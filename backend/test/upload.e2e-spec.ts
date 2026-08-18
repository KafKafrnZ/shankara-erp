import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
const request = require('supertest');

describe('UploadController (e2e)', () => {
  let app: INestApplication;
  let stewardToken: string;
  let financeToken: string;
  let dbConnection: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();

    // Login to get tokens
    const sRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'steward@shankara.local',
        password: process.env.SEED_STEWARD_PASSWORD || 'steward_dev_pass',
      });
    stewardToken = sRes.body.accessToken;

    const fRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'finance@shankara.local',
        password: process.env.SEED_FINANCE_PASSWORD || 'finance_dev_pass',
      });
    financeToken = fRes.body.accessToken;

    const { DataSource } = require('typeorm');
    dbConnection = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const uniqueToken = Date.now().toString() + Math.random().toString();
  const fixturePathCsv = path.resolve(__dirname, `../../fixtures/daybook/upload-test-${uniqueToken}.csv`);
  const fixturePathTxt = path.resolve(__dirname, `../../fixtures/daybook/bad-${uniqueToken}.txt`);
  let expectedSha: string;

  beforeAll(() => {
    fs.mkdirSync(path.dirname(fixturePathCsv), { recursive: true });
    const uniqueContent = `mock,csv,${uniqueToken}\n`;
    fs.writeFileSync(fixturePathCsv, uniqueContent);
    fs.writeFileSync(fixturePathTxt, 'bad content');
    expectedSha = crypto.createHash('sha256').update(uniqueContent).digest('hex');
  });

  it('unauthenticated upload is 401', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .expect(401);
  });

  it('finance upload is 403', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(403);
  });

  it('steward upload without file is 400', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .expect(400);
  });

  it('steward upload bad extension is 400', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', fixturePathTxt)
      .expect(400);
  });

  it('steward upload csv creates source_file and batch uploaded', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', fixturePathCsv)
      .expect(202);

    expect(res.body.status).toBe('uploaded');
    expect(res.body.duplicate).toBe(false);
    expect(res.body.sha256).toBe(expectedSha);

    const sourceFile = await dbConnection.query(`SELECT * FROM source_file WHERE sha256 = $1`, [expectedSha]);
    expect(sourceFile.length).toBe(1);

    const batch = await dbConnection.query(`SELECT * FROM ingest_batch WHERE file_sha256 = $1`, [expectedSha]);
    expect(batch.length).toBe(1);
    expect(batch[0].status).toBe('uploaded');

    const audit = await dbConnection.query(`SELECT * FROM audit_event WHERE action = 'upload' AND meta->>'sha256' = $1 ORDER BY at DESC LIMIT 1`, [expectedSha]);
    expect(audit.length).toBe(1);
  });

  it('second upload same bytes is duplicate and does not add source_file', async () => {
    const beforeCount = await dbConnection.query(`SELECT COUNT(*) as count FROM source_file`);

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .field('companyId', 'SHANKARA_HYD')
      .attach('file', fixturePathCsv)
      .expect(200);

    expect(res.body.status).toBe('duplicate');
    expect(res.body.duplicate).toBe(true);

    const afterCount = await dbConnection.query(`SELECT COUNT(*) as count FROM source_file`);
    expect(afterCount[0].count).toBe(beforeCount[0].count);
  });

  it('stored file sha256 matches response', async () => {
    const storageDir = path.resolve(process.cwd(), './var/uploads');
    const first2 = expectedSha.substring(0, 2);
    const next2 = expectedSha.substring(2, 4);
    const diskPath = path.join(storageDir, first2, next2, expectedSha);
    
    expect(fs.existsSync(diskPath)).toBe(true);
    
    const fileBytes = fs.readFileSync(diskPath);
    const actualSha = crypto.createHash('sha256').update(fileBytes).digest('hex');
    expect(actualSha).toBe(expectedSha);
  });
});
