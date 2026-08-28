import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let stewardToken: string;
  let financeToken: string;

  const stewardPassword = process.env.SEED_STEWARD_PASSWORD as string;
  const financePassword = process.env.SEED_FINANCE_PASSWORD as string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('login good steward returns token and role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'steward@shankara.local',
        password: stewardPassword,
      })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.role).toBe('steward');
    expect(res.body.user.email).toBe('steward@shankara.local');
    expect(res.body.user.displayName).toBe('System Steward');
    stewardToken = res.body.accessToken;
  });

  it('login good finance returns token and role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'finance@shankara.local',
        password: financePassword,
      })
      .expect(200);
    financeToken = res.body.accessToken;
  });

  it('login bad password is 401 and audits login_failed', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'steward@shankara.local',
        password: 'wrongpassword',
      })
      .expect(401);

    const rows = await dataSource.query(
      `SELECT action FROM audit_event WHERE action = $1 ORDER BY id DESC LIMIT 1`,
      ['login_failed'],
    );
    expect(rows[0]?.action).toBe('login_failed');
  });

  it('GET /api/auth/me without token is 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('GET /api/auth/me with token returns user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);

    expect(res.body.email).toBe('steward@shankara.local');
    expect(res.body.role).toBe('steward');
    expect(res.body.displayName).toBe('System Steward');
  });

  it('GET /api/meta/live-sources is authenticated and lists live/pending buckets', async () => {
    await request(app.getHttpServer())
      .get('/api/meta/live-sources')
      .expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'steward@shankara.local', password: stewardPassword })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/meta/live-sources')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(Array.isArray(res.body.items.live)).toBe(true);
    expect(Array.isArray(res.body.items.pending)).toBe(true);
  });

  it('GET /api/health remains public 200', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('POST /api/item-uploads without token is 401', async () => {
    await request(app.getHttpServer()).post('/api/item-uploads').expect(401);
  });

  it('finance cannot hit a steward-only upload', async () => {
    await request(app.getHttpServer())
      .post('/api/item-uploads')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(403);
  });

  it('steward CAN hit a steward-only upload', async () => {
    const path = require('path');
    // Must be a real .xlsx (ZIP local file header) — the upload endpoint
    // content-sniffs the file, so fake CSV-with-.xlsx-extension content
    // gets a 400 before the auth/role gate this test is actually checking.
    // What's inside doesn't matter beyond that; parsing happens async,
    // after this response.
    const fixturePath = path.resolve(
      __dirname,
      '../fixtures/item-master/test-fixture-1.xlsx',
    );

    const res = await request(app.getHttpServer())
      .post('/api/item-uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .attach('file', fixturePath);

    expect([200, 202]).toContain(res.status);
  });
});
