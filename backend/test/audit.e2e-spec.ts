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

  const generateUniqueExcel = (originalPath: string) => {
    // Excel is binary — append a random trailing byte sequence to get a
    // distinct sha256 per run without needing to touch the workbook format.
    const content = fs.readFileSync(originalPath);
    const uniq = Date.now().toString() + Math.floor(Math.random() * 1000);
    const newContent = Buffer.concat([content, Buffer.from(uniq)]);
    const tmp = path.join(os.tmpdir(), `test-audit-item-${uniq}.xlsx`);
    fs.writeFileSync(tmp, newContent);
    tempFiles.push(tmp);
    return { tmp, uniq };
  };

  it('full path writes login item_upload item_publish item_hold logout and login_failed', async () => {
    // 1. POST /api/auth/login steward good -> 200
    let res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'steward@shankara.local', password: process.env.SEED_STEWARD_PASSWORD })
      .expect(200);
    stewardToken = res.body.accessToken;
    const stewardId = res.body.user.id;

    // Finance login (unused for item-search — item-search issues no audit
    // events — kept only to exercise the credential pair, matching the
    // rest of this suite's login coverage).
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

    // 3. Steward upload unique item list -> 202 processing
    const { tmp: xlsxPath } = generateUniqueExcel(path.join(__dirname, '../fixtures/item-master/test-fixture-1.xlsx'));
    const uploadRes = await request(app.getHttpServer())
      .post('/api/item-uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .attach('file', xlsxPath)
      .expect(202);
    const batchId = uploadRes.body.batchId;

    // Poll until the background parse job lands the batch in 'held'.
    let batchStatus = 'processing';
    let pollCount = 0;
    while (batchStatus === 'processing' && pollCount < 30) {
      await new Promise((r) => setTimeout(r, 1000));
      const bRes = await request(app.getHttpServer())
        .get(`/api/item-batches/${batchId}`)
        .set('Authorization', `Bearer ${stewardToken}`);
      batchStatus = bRes.body.status;
      pollCount++;
    }
    expect(batchStatus).toBe('held');

    // 4. Steward POST /api/item-batches/:id/publish -> 200
    await request(app.getHttpServer())
      .post(`/api/item-batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    // 5. Steward POST /api/item-batches/:id/hold -> 200
    await request(app.getHttpServer())
      .post(`/api/item-batches/${batchId}/hold`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    // 6. Steward POST /api/auth/logout -> 200
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    // One SQL query to get all events and verify
    const audits = await db.query(`
      SELECT action, entity_type, entity_id, meta, user_id
      FROM audit_event
      WHERE action IN (
        'login','login_failed','logout',
        'item_upload','item_publish','item_hold'
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

    const uploadEvent = audits.find((a: any) => a.action === 'item_upload' && a.entity_id === String(batchId));
    expect(uploadEvent).toBeDefined();
    expect(uploadEvent.entity_type).toBe('item_master_batch');

    const publishEvent = audits.find((a: any) => a.action === 'item_publish' && a.entity_id === String(batchId));
    expect(publishEvent).toBeDefined();
    expect(publishEvent.entity_type).toBe('item_master_batch');

    const holdEvent = audits.find((a: any) => a.action === 'item_hold' && a.entity_id === String(batchId));
    expect(holdEvent).toBeDefined();
    expect(holdEvent.entity_type).toBe('item_master_batch');

    const logoutEvent = audits.find((a: any) => a.action === 'logout' && a.user_id === stewardId);
    expect(logoutEvent).toBeDefined();
    expect(logoutEvent.entity_type).toBe('app_user');
  });
});
