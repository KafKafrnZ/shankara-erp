import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
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
    await app.init();
    db = app.get(DataSource);

    // Truncate tables for clean state
    await db.query(`TRUNCATE TABLE ingest_reject, voucher_line, voucher, ingest_batch, source_file, audit_event RESTART IDENTITY CASCADE`);

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

  const generateUniqueCsv = (originalPath: string, mutations: (lines: string[]) => void = () => {}) => {
    const content = fs.readFileSync(originalPath, 'utf8');
    const lines = content.split('\n');
    // Insert unique title block to avoid SHA collision
    lines.splice(1, 0, `"Run ${Date.now()}-${Math.random()}",,,,,,,`);
    mutations(lines);
    const newContent = lines.join('\n');
    const tmp = path.join(os.tmpdir(), `test-ingest-${Date.now()}-${Math.random()}.csv`);
    fs.writeFileSync(tmp, newContent);
    tempFiles.push(tmp);
    return tmp;
  };

  it('ingest sample daybook creates expected voucher count', async () => {
    const csvPath = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'));

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath);

    if (res.status !== 202) {
      console.log('UNEXPECTED STATUS:', res.status, res.body);
    }
    expect(res.status).toBe(202);

    expect(res.body.status).toBe('held');
    const batchId = res.body.batchId;
    
    // Check voucher table
    const vouchers = await db.query(`SELECT * FROM voucher WHERE batch_id = $1 AND valid_to IS NULL`, [batchId]);
    if (vouchers.length === 0) {
      console.log('ALL VOUCHERS:', await db.query(`SELECT id, batch_id, company_id FROM voucher`));
    }
    expect(vouchers.length).toBe(2);
    
    const lines = await db.query(`SELECT * FROM voucher_line WHERE voucher_id IN ($1, $2)`, [vouchers[0].id, vouchers[1].id]);
    expect(lines.length).toBe(6);

    const sales = vouchers.find((v: any) => v.vch_type === 'Sales');
    expect(sales.total_amount).toBe('1248500.00');
    expect(sales.vch_no_norm).toBe('invhyd242511820');

    const batch = await db.query(`SELECT * FROM ingest_batch WHERE id = $1`, [batchId]);
    expect(batch[0].status).toBe('held');
    expect(batch[0].published_at).toBeNull();
  });

  it('sample line sides match EXPECTED', async () => {
    // Rely on previous test inserting the vouchers
    const lines = await db.query(`
      SELECT vl.*, v.vch_type, v.party_name 
      FROM voucher_line vl 
      JOIN voucher v ON vl.voucher_id = v.id 
      WHERE v.valid_to IS NULL 
      ORDER BY vl.id DESC LIMIT 6
    `);
    
    const cgst = lines.find((l: any) => l.ledger_name === 'CGST');
    expect(parseFloat(cgst.credit)).toBeGreaterThan(0);
    expect(parseFloat(cgst.debit)).toBe(0);

    const receipt = lines.find((l: any) => l.ledger_name === 'Sri Steel Traders' && l.vch_type === 'Receipt');
    if (receipt) {
      expect(receipt.credit).toBe('50000.00');
    }
  });

  it('same sha256 second ingest does not duplicate vouchers', async () => {
    const csvPath = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'));
    
    // First upload
    const res1 = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(202);

    const beforeCount = await db.query(`SELECT count(*) as c FROM voucher WHERE valid_to IS NULL`);

    // Second upload (duplicate)
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
    // Generate unique CSV, change Sales header debit to 12,48,501.00
    const csvPath = generateUniqueCsv(path.join(__dirname, '../../fixtures/daybook/sample-daybook.csv'), (lines) => {
      // Find sales header row. It's Sri Steel Traders, Date: 1-Apr-25, Vch Type: Sales, Vch No: INV/HYD/24-25/11820, Debit: 12,48,500.00
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('12,48,500.00') && lines[i].includes('Sri Steel Traders')) {
          lines[i] = lines[i].replace('12,48,500.00', '12,48,501.00');
        }
      }
    });

    const beforeVouchers = await db.query(`SELECT * FROM voucher WHERE vch_type = 'Sales' AND company_id = 'SHANKARA_HYD'`);
    const oldIds = beforeVouchers.map((v: any) => v.id);

    await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', csvPath)
      .expect(202);

    const afterVouchers = await db.query(`
      SELECT * FROM voucher 
      WHERE vch_type = 'Sales' AND company_id = 'SHANKARA_HYD' 
      ORDER BY created_at DESC LIMIT 5
    `);

    const current = afterVouchers.find((v: any) => v.valid_to === null);
    const old = afterVouchers.find((v: any) => v.valid_to !== null && v.total_amount === '1248500.00');

    expect(current).toBeDefined();
    expect(current.total_amount).toBe('1248501.00');
    expect(old).toBeDefined();

    // Check old lines still exist
    if (old) {
      const oldLines = await db.query(`SELECT * FROM voucher_line WHERE voucher_id = $1`, [old.id]);
      expect(oldLines.length).toBeGreaterThan(0);
    }
  });
});
