import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Audit (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let db: DataSource;
  let stewardToken: string;
  let financeToken: string;
  const tempFiles: string[] = [];

  beforeAll(async () => {
    if (!process.env.SEED_FINANCE_PASSWORD || !process.env.SEED_STEWARD_PASSWORD) {
      throw new Error('Missing password env vars for e2e tests');
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = app.get(DataSource);
  });

  afterAll(async () => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    await app.close();
  });

  const generateUniqueCsv = (originalPath: string, mutations: (lines: string[]) => void = () => {}, passedUniq?: string) => {
    const content = fs.readFileSync(originalPath, 'utf8');
    const lines = content.split('\n');
    const uniq = passedUniq || Date.now().toString() + Math.floor(Math.random() * 1000);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('INV/HYD/24-25/11820')) {
        lines[i] = lines[i].replace('INV/HYD/24-25/11820', 'INV/HYD/' + uniq);
      }
      if (lines[i].includes('RCT/HYD/2401')) {
        lines[i] = lines[i].replace('RCT/HYD/2401', 'RCT/HYD/' + uniq);
      }
    }
    lines.splice(1, 0, `"Run ${Date.now()}-${Math.random()}",,,,,,,`);
    mutations(lines);
    const newContent = lines.join('\n');
    const tmp = path.join(os.tmpdir(), `test-audit-${Date.now()}-${Math.random()}.csv`);
    fs.writeFileSync(tmp, newContent);
    tempFiles.push(tmp);
    return { tmp, uniq };
  };

  it('full path writes login upload publish search voucher_open unpublish logout and login_failed', async () => {
    // 1. POST /api/auth/login steward good -> 200
    let res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'steward@shankara.local', password: process.env.SEED_STEWARD_PASSWORD })
      .expect(200);
    stewardToken = res.body.accessToken;
    const stewardId = res.body.user.id;

    // Finance login
    res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'finance@shankara.local', password: process.env.SEED_FINANCE_PASSWORD })
      .expect(200);
    financeToken = res.body.accessToken;

    // 2. POST /api/auth/login steward bad password -> 401
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'steward@shankara.local', password: 'wrong' })
      .expect(401);

    // 3. Steward upload unique sample -> 202 held
    const { tmp, uniq } = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'));
    const uploadRes = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', tmp)
      .expect(202);
    const batchId = uploadRes.body.batchId;

    // 4. Steward POST /api/batches/:id/publish -> 200
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    // 5. Finance POST /api/search { q: uniq } -> 200, total >= 1
    const searchRes = await request(app.getHttpServer())
      .post('/api/search')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ q: uniq })
      .expect(200);
    expect(searchRes.body.total).toBeGreaterThanOrEqual(1);

    const salesId = searchRes.body.hits.find((h: any) => h.vchNo.includes('INV/HYD/')).id;

    // 6. Finance GET /api/vouchers/:salesId -> 200
    await request(app.getHttpServer())
      .get(`/api/vouchers/${salesId}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);

    // 7. Steward POST /api/batches/:id/hold -> 200
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/hold`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    // 8. Steward POST /api/auth/logout -> 200
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    // One SQL query to get all events and verify
    const audits = await db.query(`
      SELECT action, entity_type, entity_id, meta, user_id
      FROM audit_event
      WHERE action IN (
        'login','login_failed','logout','upload',
        'publish','unpublish','search','voucher_open'
      )
      ORDER BY id DESC LIMIT 20
    `);

    const loginEvent = audits.find((a: any) => a.action === 'login' && a.user_id === stewardId);
    expect(loginEvent).toBeDefined();
    expect(loginEvent.entity_type).toBe('app_user');

    const loginFailedEvent = audits.find((a: any) => a.action === 'login_failed');
    expect(loginFailedEvent).toBeDefined();
    expect(loginFailedEvent.meta.reason).toBe('invalid_password');
    expect(loginFailedEvent.meta.password).toBeUndefined();

    const uploadEvent = audits.find((a: any) => a.action === 'upload' && a.entity_id === String(batchId));
    expect(uploadEvent).toBeDefined();
    expect(uploadEvent.entity_type).toBe('ingest_batch');
    expect(uploadEvent.meta.duplicate).toBe(false);

    const publishEvent = audits.find((a: any) => a.action === 'publish' && a.entity_id === String(batchId));
    expect(publishEvent).toBeDefined();
    expect(publishEvent.entity_type).toBe('ingest_batch');

    const searchEvent = audits.find((a: any) => a.action === 'search' && (a.meta.q === uniq || String(a.meta.q).includes(uniq)));
    expect(searchEvent).toBeDefined();
    expect(searchEvent.meta.total).toBeGreaterThanOrEqual(1);

    const openEvent = audits.find((a: any) => a.action === 'voucher_open' && a.entity_id === String(salesId));
    expect(openEvent).toBeDefined();
    expect(openEvent.entity_type).toBe('voucher');

    const unpublishEvent = audits.find((a: any) => a.action === 'unpublish' && a.entity_id === String(batchId));
    expect(unpublishEvent).toBeDefined();
    expect(unpublishEvent.entity_type).toBe('ingest_batch');

    const logoutEvent = audits.find((a: any) => a.action === 'logout' && a.user_id === stewardId);
    expect(logoutEvent).toBeDefined();
    expect(logoutEvent.entity_type).toBe('app_user');
  });
});
