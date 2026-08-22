import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Ingest (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let db: DataSource;
  let stewardToken: string;
  const tempFiles: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    db = app.get(DataSource);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'steward@shankara.local', password: process.env.SEED_STEWARD_PASSWORD });
    stewardToken = loginRes.body.accessToken;
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
    const tmp = path.join(os.tmpdir(), `test-ingest-${Date.now()}-${Math.random()}.csv`);
    fs.writeFileSync(tmp, newContent);
    tempFiles.push(tmp);
    return { tmp, uniq };
  };

  it('ingest sample daybook creates expected voucher count', async () => {
    const { tmp: csvPath, uniq } = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'));

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(202);

    expect(res.body.status).toBe('held');
    const batchId = res.body.batchId;

    const vouchers = await db.query(`SELECT * FROM voucher WHERE batch_id = $1 AND valid_to IS NULL`, [batchId]);
    expect(vouchers.length).toBe(2);

    const lines = await db.query(`SELECT * FROM voucher_line WHERE voucher_id IN ($1, $2)`, [vouchers[0].id, vouchers[1].id]);
    expect(lines.length).toBe(6);

    const sales = vouchers.find((v: any) => v.vch_type === 'Sales');
    expect(sales.total_amount).toBe('1248500.00');

    // Assert sample batch published_at IS NULL and sales vch_no_norm
    const batch = await db.query(`SELECT * FROM ingest_batch WHERE id = $1`, [batchId]);
    expect(batch[0].published_at).toBeNull();
    expect(sales.vch_no_norm).toBeTruthy();

    const cgst = lines.find((l: any) => l.ledger_name === 'CGST');
    expect(Number(cgst.credit)).toBeGreaterThan(0);

    const receipt = vouchers.find((v: any) => v.vch_type === 'Receipt');
    const receiptSriSteel = lines.find((l: any) => l.voucher_id === receipt.id && l.ledger_name === 'Sri Steel Traders');
    expect(receiptSriSteel.credit).toBe('50000.00');

    // GET /api/batches/:id as steward returns the held batch
    const getBatchRes = await request(app.getHttpServer())
      .get(`/api/batches/${batchId}`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);
    expect(getBatchRes.body.id.toString()).toBe(batchId.toString());
    expect(getBatchRes.body.status).toBe('held');
  });

  it('same sha256 second ingest does not duplicate vouchers', async () => {
    const { tmp: csvPath, uniq } = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'));

    await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(202);

    const beforeCount = await db.query(`SELECT count(*) as c FROM voucher WHERE valid_to IS NULL`);

    const res2 = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(200);

    expect(res2.body.duplicate).toBe(true);

    const afterCount = await db.query(`SELECT count(*) as c FROM voucher WHERE valid_to IS NULL`);
    expect(afterCount[0].c).toBe(beforeCount[0].c);
  });

  it('changed file same vch key versions the row', async () => {
    // Generate a fixed uniq for this test
    const testUniq = 'TEST_VER_' + Date.now().toString() + Math.floor(Math.random() * 1000);

    // Original upload then make live — versioning happens at publish, not upload.
    const { tmp: origCsvPath } = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'), () => {}, testUniq);
    const orig = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', origCsvPath)
      .expect(202);
    await request(app.getHttpServer())
      .post(`/api/batches/${orig.body.batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    // Mutated upload with SAME uniq
    const { tmp: changedCsvPath } = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'), (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Sri Steel Traders')) {
          lines[i] = lines[i].replace('Sri Steel Traders', 'Sri Steel Traders Revised');
        }
      }
    }, testUniq);

    const changed = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', changedCsvPath)
      .expect(202);
    await request(app.getHttpServer())
      .post(`/api/batches/${changed.body.batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    const afterVouchers = await db.query(`
      SELECT * FROM voucher
      WHERE vch_type = 'Sales' AND company_id = 'SHANKARA_HYD' AND vch_no = $1
      ORDER BY created_at DESC LIMIT 5
    `, ['INV/HYD/' + testUniq]);

    const current = afterVouchers.find((v: any) => v.valid_to === null);
    const old = afterVouchers.find((v: any) => v.valid_to !== null && String(v.party_name || '').includes('Sri Steel Traders') && !String(v.party_name || '').includes('Revised'));

    expect(current).toBeDefined();
    expect(String(current.party_name)).toContain('Revised');
    expect(old).toBeDefined();
  });

  it('unrecognized layout rejects with zero vouchers', async () => {
    const tmp = path.join(os.tmpdir(), `test-ingest-${Date.now()}-${Math.random()}.csv`);
    fs.writeFileSync(tmp, 'a,b,c\n1,2,3\n' + Date.now() + Math.random());
    tempFiles.push(tmp);

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', tmp)
      .expect(202);

    expect(res.body.status).toBe('rejected');
    expect(res.body.errorSummary).toBe('UNRECOGNIZED_LAYOUT');
  });

  it('bad amount writes ingest_reject and keeps other vouchers', async () => {
    const { tmp: csvPath } = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook-bad-amount.csv'));

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(202);

    expect(res.body.status).toBe('held');

    const rejects = await db.query(`SELECT * FROM ingest_reject WHERE batch_id = $1`, [res.body.batchId]);
    expect(rejects.length).toBeGreaterThan(0);
    expect(rejects[0].code).toBe('UNPARSEABLE_AMOUNT');

    const vouchers = await db.query(`SELECT * FROM voucher WHERE batch_id = $1`, [res.body.batchId]);
    expect(vouchers.length).toBe(2);
  });

  it('out-of-balance batch stays held and publish is blocked', async () => {
    const { tmp: csvPath } = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'), (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('12,48,500.00') && lines[i].includes('Sri Steel Traders')) {
          lines[i] = lines[i].replace('12,48,500.00', '12,48,501.00');
        }
      }
    });

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(202);

    expect(res.body.status).toBe('held');
    expect(res.body.errorSummary).toMatch(/^OUT_OF_BALANCE/);

    await request(app.getHttpServer())
      .post(`/api/batches/${res.body.batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(409);

    const b = await db.query(`SELECT status FROM ingest_batch WHERE id = $1`, [res.body.batchId]);
    expect(b[0].status).toBe('held');
  });

  it('zero vouchers after skip totals rejects batch', async () => {
    const { tmp: csvPath } = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'), (lines) => {
      // Remove all lines except titles and Opening Balance / Grand Total
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('Sri Steel Traders') || lines[i].includes('CGST') || lines[i].includes('SGST') || lines[i].includes('Sales GST') || lines[i].includes('TMT 12mm') || lines[i].includes('Cash')) {
          lines.splice(i, 1);
        }
      }
    });

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(202);

    expect(res.body.status).toBe('rejected');
    expect(res.body.errorSummary).toBe('ZERO_VOUCHERS');
    const vouchers = await db.query(`SELECT * FROM voucher WHERE batch_id = $1`, [res.body.batchId]);
    expect(vouchers.length).toBe(0);
  });

  it('company mismatch rejects batch', async () => {
    const { tmp: csvPath } = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'), (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Shankara Buildpro - Hyderabad')) {
          lines[i] = lines[i].replace('Shankara Buildpro - Hyderabad', 'Some Other Company');
        }
      }
    });

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(202);

    expect(res.body.status).toBe('rejected');
    expect(res.body.errorSummary).toBe('COMPANY_MISMATCH');
  });

  const generateUniqueSalesCsv = (originalPath: string) => {
    const content = fs.readFileSync(originalPath, 'utf8');
    const lines = content.split('\n');
    const uniq = Date.now().toString() + Math.floor(Math.random() * 1000);
    // mutate the vchNo to avoid constraint issues across tests
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('INV/SR/1')) {
        lines[i] = lines[i].replace('INV/SR/1', 'INV/SR/1-' + uniq);
      }
      if (lines[i].includes('INV/SR/2')) {
        lines[i] = lines[i].replace('INV/SR/2', 'INV/SR/2-' + uniq);
      }
    }
    // Change some irrelevant cell to avoid duplicate SHA256 across e2e runs
    lines.splice(1, 0, `"Run ${uniq}",,,,,,,,`);
    const newContent = lines.join('\n');
    const tmp = path.join(os.tmpdir(), `test-ingest-sales-${uniq}.csv`);
    fs.writeFileSync(tmp, newContent);
    tempFiles.push(tmp);
    return { tmp, uniq };
  };

  it('steward upload sales csv, no autoPublish', async () => {
    const { tmp: csvPath, uniq } = generateUniqueSalesCsv(path.join(__dirname, '../../fixtures/sales-register/sample-sales-register.csv'));

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(202);

    expect(res.body.status).toBe('held');
    const batchId = res.body.batchId;

    const batch = await db.query(`SELECT * FROM ingest_batch WHERE id = $1`, [batchId]);
    expect(batch[0].published_at).toBeNull();
    expect(batch[0].report_type).toBe('SALES_REGISTER');

    const vouchers = await db.query(`SELECT * FROM voucher WHERE batch_id = $1 AND valid_to IS NULL ORDER BY vch_no ASC`, [batchId]);
    expect(vouchers.length).toBe(2);
    expect(vouchers[0].vch_no).toBe('INV/SR/1-' + uniq);
    expect(vouchers[1].vch_no).toBe('INV/SR/2-' + uniq);

    // finance search INV/SR/1 before publish -> total === 0
    // get finance token
    const financeLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'finance@shankara.local', password: process.env.SEED_FINANCE_PASSWORD });
    const financeToken = financeLogin.body.accessToken;

    const searchRes = await request(app.getHttpServer())
      .post('/api/search')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ q: 'INV/SR/1-' + uniq })
      .expect(200);
    expect(searchRes.body.total).toBe(0);

    // re-upload same SHA -> voucher current count for INV/SR/% unchanged
    const beforeCount = await db.query(`SELECT count(*) as c FROM voucher WHERE vch_no LIKE 'INV/SR/%' AND valid_to IS NULL`);

    const res2 = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(200); // duplicate

    expect(res2.body.duplicate).toBe(true);

    const afterCount = await db.query(`SELECT count(*) as c FROM voucher WHERE vch_no LIKE 'INV/SR/%' AND valid_to IS NULL`);
    expect(afterCount[0].c).toBe(beforeCount[0].c);
  });

  it('OUT_OF_BALANCE batch stays held and publish is 409', async () => {
    const { tmp: csvPath } = generateUniqueCsv(
      path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'),
      (lines) => {
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('12,48,500.00') && lines[i].includes('Sri Steel Traders')) {
            lines[i] = lines[i].replace('12,48,500.00', '12,48,501.00');
          }
        }
      },
    );

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(202);

    expect(res.body.status).toBe('held');
    expect(String(res.body.errorSummary || '')).toMatch(/^OUT_OF_BALANCE/);

    const batchId = res.body.batchId;
    const pub = await request(app.getHttpServer())
      .post(`/api/batches/${batchId}/publish`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(409);

    expect(pub.body.message).toBe('OUT_OF_BALANCE');

    const batch = await db.query(`SELECT status, published_at, error_summary FROM ingest_batch WHERE id = $1`, [batchId]);
    expect(batch[0].status).toBe('held');
    expect(batch[0].published_at).toBeNull();
    expect(String(batch[0].error_summary)).toMatch(/^OUT_OF_BALANCE/);
  });
});
