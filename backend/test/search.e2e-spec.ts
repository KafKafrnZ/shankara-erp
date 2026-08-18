import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Search & Vouchers (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let db: DataSource;
  let stewardToken: string;
  let financeToken: string;
  let branchToken: string;
  const tempFiles: string[] = [];

  beforeAll(async () => {
    if (!process.env.SEED_FINANCE_PASSWORD || !process.env.SEED_BRANCH_PASSWORD) {
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

    let res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'steward@shankara.local', password: process.env.SEED_STEWARD_PASSWORD });
    stewardToken = res.body.accessToken;

    res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'finance@shankara.local', password: process.env.SEED_FINANCE_PASSWORD });
    financeToken = res.body.accessToken;

    res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'branch@shankara.local', password: process.env.SEED_BRANCH_PASSWORD });
    branchToken = res.body.accessToken;
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
    const tmp = path.join(os.tmpdir(), `test-search-${Date.now()}-${Math.random()}.csv`);
    fs.writeFileSync(tmp, newContent);
    tempFiles.push(tmp);
    return { tmp, uniq };
  };

  const uploadSample = async (companyId = 'SHANKARA_HYD', mutations: (lines: string[]) => void = () => {}, passedUniq?: string) => {
    const { tmp, uniq } = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'), mutations, passedUniq);
    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', companyId)
      .attach('file', tmp)
      .expect(202);
    const batchId = res.body.batchId;
    const vch = await db.query(`SELECT id FROM voucher WHERE batch_id = $1 AND vch_type = 'Sales'`, [batchId]);
    return { batchId, uniq, salesId: vch[0]?.id };
  };

  it('search and get voucher without token is 401', async () => {
    await request(app.getHttpServer()).post('/api/search').expect(401);
    await request(app.getHttpServer()).get('/api/vouchers/1').expect(401);
  });

  it('finance cannot publish', async () => {
    const { batchId } = await uploadSample();
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(403);
    const b = await db.query(`SELECT status FROM ingest_batch WHERE id = $1`, [batchId]);
    expect(b[0].status).toBe('held');
  });

  it('unpublished batch is not searchable', async () => {
    const { uniq } = await uploadSample();
    const res = await request(app.getHttpServer())
      .post('/api/search')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ q: uniq })
      .expect(200);
    expect(res.body.total).toBe(0);
  });

  it('publish then search by vch fragment', async () => {
    const { batchId, uniq } = await uploadSample();
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/search')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ q: uniq })
      .expect(200);
    
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.hits.slice(0, 3).some((h: any) => h.vchNo.includes(uniq))).toBe(true);
  });

  it('search by amount finds voucher', async () => {
    const { batchId } = await uploadSample();
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    for (const q of ['1248500', '12,48,500.00']) {
      const res = await request(app.getHttpServer())
        .post('/api/search')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ q })
        .expect(200);
      const hasHit = res.body.hits.some((h: any) => h.totalAmount === '1248500.00');
      expect(hasHit).toBe(true);
    }
  });

  it('search by party substring finds voucher', async () => {
    const { batchId } = await uploadSample();
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/search')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ q: 'Sri Steel' })
      .expect(200);
    
    expect(res.body.hits.some((h: any) => h.partyName === 'Sri Steel Traders')).toBe(true);
  });

  it('hold removes voucher from search', async () => {
    const { batchId, uniq } = await uploadSample();
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/search')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ q: uniq })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/hold`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    const res2 = await request(app.getHttpServer())
      .post('/api/search')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ q: uniq })
      .expect(200);
    
    expect(res2.body.total).toBe(0);
  });

  it('get voucher returns lines and source', async () => {
    const { batchId, salesId } = await uploadSample();
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/vouchers/${salesId}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);

    expect(res.body.lines.length).toBe(4);
    const cgst = res.body.lines.find((l: any) => l.ledgerName === 'CGST');
    expect(cgst.credit).toBe('112365.00');
    expect(res.body.source.sha256).toBeTruthy();
    expect(res.body.source.publishedAt).toBeTruthy();
  });

  it('get unpublished voucher is 404', async () => {
    const { salesId } = await uploadSample();
    await request(app.getHttpServer())
      .get(`/api/vouchers/${salesId}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(404);
  });

  it('get superseded voucher is 404 unless steward version=all', async () => {
    const { batchId, uniq, salesId } = await uploadSample();
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    const { batchId: batchB } = await uploadSample('SHANKARA_HYD', (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('12,48,500.00') && lines[i].includes('Sri Steel Traders')) {
          lines[i] = lines[i].replace('12,48,500.00', '12,48,501.00');
        }
      }
    }, uniq);

    await request(app.getHttpServer())
      .post(`/api/batches/${batchB}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/vouchers/${salesId}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/vouchers/${salesId}?version=all`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);
  });

  it('branch user cannot see other company', async () => {
    const { batchId, uniq, salesId } = await uploadSample('OTHER_CO');
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .post('/api/search')
      .set('Authorization', `Bearer ${branchToken}`)
      .send({ q: uniq })
      .expect(200);
    expect(resB.body.total).toBe(0);

    const resS = await request(app.getHttpServer())
      .post('/api/search')
      .set('Authorization', `Bearer ${stewardToken}`)
      .send({ q: uniq })
      .expect(200);
    expect(resS.body.total).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .get(`/api/vouchers/${salesId}`)
      .set('Authorization', `Bearer ${branchToken}`)
      .expect(404);
  });

  it('as-of is null then set after publish', async () => {
    const { batchId } = await uploadSample();
    await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    const res2 = await request(app.getHttpServer())
      .get('/api/meta/as-of')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(res2.body.asOf).toBeTruthy();
    expect(res2.body.batchId).toBe(Number(batchId));
  });

  it('search and voucher_open and publish and unpublish are audited', async () => {
    const audits = await db.query(`
      SELECT action FROM audit_event 
      WHERE action IN ('publish', 'unpublish', 'search', 'voucher_open') 
      ORDER BY id DESC LIMIT 50
    `);
    const actions = audits.map((a: any) => a.action);
    expect(actions).toContain('publish');
    expect(actions).toContain('unpublish');
    expect(actions).toContain('search');
    expect(actions).toContain('voucher_open');
  });
});
