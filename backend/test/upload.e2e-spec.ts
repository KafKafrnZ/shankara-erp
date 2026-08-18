import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { AppModule } from '../src/app.module';

describe('UploadController (e2e)', () => {
  let app: INestApplication;
  let stewardToken: string;
  let financeToken: string;
  let dbConnection: DataSource;
  let tmpDir: string;
  let fixturePathCsv: string;
  let fixturePathTxt: string;
  let expectedSha: string;

  beforeAll(async () => {
    const stewardPassword = process.env.SEED_STEWARD_PASSWORD;
    const financePassword = process.env.SEED_FINANCE_PASSWORD;
    if (!stewardPassword || !financePassword) {
      throw new Error('SEED_STEWARD_PASSWORD and SEED_FINANCE_PASSWORD must be set');
    }

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

    const sRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'steward@shankara.local',
        password: stewardPassword,
      });
    stewardToken = sRes.body.accessToken;

    const fRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'finance@shankara.local',
        password: financePassword,
      });
    financeToken = fRes.body.accessToken;

    dbConnection = app.get(DataSource);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shankara-upload-'));
    const uniqueToken = `${Date.now()}-${process.pid}`;
    fixturePathCsv = path.join(tmpDir, `upload-test-${uniqueToken}.csv`);
    fixturePathTxt = path.join(tmpDir, `bad-${uniqueToken}.txt`);
    const uniqueContent = `mock,csv,${uniqueToken}\n`;
    fs.writeFileSync(fixturePathCsv, uniqueContent);
    fs.writeFileSync(fixturePathTxt, 'bad content');
    expectedSha = crypto.createHash('sha256').update(uniqueContent).digest('hex');
  });

  afterAll(async () => {
    await app.close();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
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
      .expect(202)
      .expect((res) => {
        expect(res.body.duplicate).toBe(false);
        expect(res.body.status).toBe('rejected');
      });

    const sourceFile = await dbConnection.query(`SELECT * FROM source_file WHERE sha256 = $1`, [expectedSha]);
    expect(sourceFile.length).toBe(1);

    const batch = await dbConnection.query(`SELECT * FROM ingest_batch WHERE file_sha256 = $1`, [expectedSha]);
    expect(batch.length).toBe(1);
    expect(batch[0].status).toBe('rejected');

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
