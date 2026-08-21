import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Client } from 'pg';
import { AppModule } from './../src/app.module';

describe('ItemMasterController (e2e)', () => {
  let app: INestApplication;
  let db: Client;
  let stewardToken: string;
  let financeToken: string;
  const tempFiles: string[] = [];

  beforeAll(async () => {
    db = new Client({
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
    });
    await db.connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const loginSteward = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'steward@shankara.local', password: process.env.SEED_STEWARD_PASSWORD });
    stewardToken = loginSteward.body.accessToken;

    const loginFinance = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'finance@shankara.local', password: process.env.SEED_FINANCE_PASSWORD });
    financeToken = loginFinance.body.accessToken;
  });

  afterAll(async () => {
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
    await app.close();
    await db.end();
  });

  const generateUniqueExcel = (originalPath: string) => {
    // We just copy the fixture but wait, Excel is binary. 
    // We can't just string-replace easily.
    // Instead we will rely on file content and metadata changes, or just test it once.
    // To ensure unique SHA, we can append a random byte.
    const content = fs.readFileSync(originalPath);
    const uniq = Date.now().toString() + Math.floor(Math.random() * 1000);
    const newContent = Buffer.concat([content, Buffer.from(uniq)]);
    const tmp = path.join(os.tmpdir(), `test-item-master-${uniq}.xlsx`);
    fs.writeFileSync(tmp, newContent);
    tempFiles.push(tmp);
    return { tmp, uniq };
  };

  it('item master upload and search lifecycle', async () => {
    const { tmp: xlsxPath } = generateUniqueExcel(path.join(__dirname, '../fixtures/item-master/test-fixture-1.xlsx'));

    // Non-steward gets 403
    await request(app.getHttpServer())
      .post('/api/item-uploads')
      .set('Authorization', `Bearer ${financeToken}`)
      .attach('file', xlsxPath)
      .expect(403);

    // Steward upload
    const res = await request(app.getHttpServer())
      .post('/api/item-uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .attach('file', xlsxPath)
      .expect(202);

    expect(res.body.status).toBe('processing');
    const batchId = res.body.batchId;

    // Poll until held
    let batchStatus = 'processing';
    let pollCount = 0;
    while (batchStatus === 'processing' && pollCount < 30) {
      await new Promise(r => setTimeout(r, 1000));
      const bRes = await request(app.getHttpServer())
        .get(`/api/item-batches/${batchId}`)
        .set('Authorization', `Bearer ${stewardToken}`);
      batchStatus = bRes.body.status;
      pollCount++;
    }

    expect(batchStatus).toBe('held');

    const heldBatchRes = await request(app.getHttpServer())
      .get(`/api/item-batches/${batchId}`)
      .set('Authorization', `Bearer ${stewardToken}`);
    expect(heldBatchRes.body.acceptedRows).toBeGreaterThan(0);

    // finance/branch calling GET on held batch gets 404
    await request(app.getHttpServer())
      .get(`/api/item-batches/${batchId}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(404);

    // Publish
    await request(app.getHttpServer())
      .post(`/api/item-batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    // Search
    const searchRes = await request(app.getHttpServer())
      .post('/api/item-search')
      .set('Authorization', `Bearer ${stewardToken}`)
      .send({ q: 'TEST_ITEM_NAME' })
      .expect(201); // Post returns 201 by default unless configured
    expect(searchRes.body.hits.length).toBeGreaterThan(0);

    // Duplicate upload
    const dupRes = await request(app.getHttpServer())
      .post('/api/item-uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .attach('file', xlsxPath)
      .expect(200);

    expect(dupRes.body.duplicate).toBe(true);
  }, 40000); // Allow up to 40s

  it('a batch stuck in processing can be recovered', async () => {
    const { tmp: xlsxPath } = generateUniqueExcel(path.join(__dirname, '../fixtures/item-master/test-fixture-1.xlsx'));

    const res = await request(app.getHttpServer())
      .post('/api/item-uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .attach('file', xlsxPath)
      .expect(202);
    const batchId = res.body.batchId;

    // Let it actually finish once, then force it back into 'processing' —
    // simulates the worker crashing or never picking the job up, without
    // needing to actually kill anything mid-flight.
    let batchStatus = 'processing';
    let pollCount = 0;
    while (batchStatus === 'processing' && pollCount < 30) {
      await new Promise(r => setTimeout(r, 1000));
      const bRes = await request(app.getHttpServer())
        .get(`/api/item-batches/${batchId}`)
        .set('Authorization', `Bearer ${stewardToken}`);
      batchStatus = bRes.body.status;
      pollCount++;
    }
    expect(batchStatus).toBe('held');

    await db.query(`UPDATE item_master_batch SET status = 'processing' WHERE id = $1`, [batchId]);

    // Non-steward can't retry
    await request(app.getHttpServer())
      .post(`/api/item-batches/${batchId}/retry`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(403);

    // Re-uploading the identical file auto-heals a stuck batch instead of
    // just reporting an inert duplicate.
    const retryRes = await request(app.getHttpServer())
      .post('/api/item-uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .attach('file', xlsxPath)
      .expect(202);
    expect(retryRes.body.duplicate).toBe(true);
    expect(retryRes.body.retried).toBe(true);
    expect(retryRes.body.status).toBe('processing');

    batchStatus = 'processing';
    pollCount = 0;
    while (batchStatus === 'processing' && pollCount < 30) {
      await new Promise(r => setTimeout(r, 1000));
      const bRes = await request(app.getHttpServer())
        .get(`/api/item-batches/${batchId}`)
        .set('Authorization', `Bearer ${stewardToken}`);
      batchStatus = bRes.body.status;
      pollCount++;
    }
    expect(batchStatus).toBe('held');

    // A held (not stuck/failed) batch can't be retried.
    await request(app.getHttpServer())
      .post(`/api/item-batches/${batchId}/retry`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(400);
  }, 60000);
});
