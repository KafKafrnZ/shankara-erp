import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
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
    app.use(cookieParser());
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

  // Grouped at the end of the file, deliberately: the logout test below
  // bumps the steward's token_version server-side, which invalidates
  // every steward token issued earlier in this run — including the
  // outer-scope `stewardToken` every test above depends on. Placed
  // anywhere else, it would silently break later tests' auth.
  it('login sets an httpOnly, SameSite=Strict, Path=/ cookie carrying the same token as the body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'steward@shankara.local', password: stewardPassword })
      .expect(200);

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).find(
      (c: string) => c.startsWith('sb_token='),
    );
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    // Dev runs over plain HTTP (127.0.0.1) — Secure would make the browser
    // silently drop the cookie there, so it must be absent outside prod.
    expect(cookie).not.toContain('Secure');
    expect(cookie).toContain(encodeURIComponent(res.body.accessToken).slice(0, 20));
  });

  it('a protected route is reachable via the cookie alone, no Authorization header', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email: 'steward@shankara.local', password: stewardPassword })
      .expect(200);

    // supertest's agent persists Set-Cookie from the login response and
    // resends it automatically — no header set here at all.
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body.email).toBe('steward@shankara.local');
  });

  it('steward upload accepts a real CSV and rejects a .txt', async () => {
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const csv =
      'Catalogue No,Brand,Stock Item Name for Migration,Alias,Main Group,Sub Group,UOM\n' +
      `C${Date.now()},Brand,Name,A${Date.now()},G,S,PCS\n`;
    const csvPath = path.join(os.tmpdir(), `e2e-upload-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, csv);
    try {
      const ok = await request(app.getHttpServer())
        .post('/api/item-uploads')
        .set('Authorization', `Bearer ${stewardToken}`)
        .attach('file', csvPath);
      expect([200, 202]).toContain(ok.status);

      const txtPath = path.join(os.tmpdir(), `e2e-notes-${Date.now()}.txt`);
      fs.writeFileSync(txtPath, 'hello');
      try {
        await request(app.getHttpServer())
          .post('/api/item-uploads')
          .set('Authorization', `Bearer ${stewardToken}`)
          .attach('file', txtPath)
          .expect(400);
      } finally {
        fs.unlinkSync(txtPath);
      }
    } finally {
      fs.unlinkSync(csvPath);
    }
  });

  it('logout clears the cookie, and the cleared cookie no longer authenticates', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email: 'steward@shankara.local', password: stewardPassword })
      .expect(200);
    await agent.get('/api/auth/me').expect(200);

    const logoutRes = await agent.post('/api/auth/logout').expect(200);
    const setCookie = logoutRes.headers['set-cookie'];
    const cleared = (Array.isArray(setCookie) ? setCookie : [setCookie]).find(
      (c: string) => c.startsWith('sb_token='),
    );
    expect(cleared).toBeDefined();
    // Express's clearCookie sends an already-expired cookie rather than
    // omitting it — that's what actually makes the browser delete it.
    expect(cleared).toMatch(/sb_token=;/);

    // logout() also bumps token_version server-side, so even a copy of
    // the old cookie value made before it expired would be rejected —
    // belt and suspenders, not just relying on the browser having
    // discarded it.
    await agent.get('/api/auth/me').expect(401);
  });

  // Last: mutates the finance seed user's password (and token_version).
  it('signed-in user can change their own password and stay signed in via a new cookie', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email: 'finance@shankara.local', password: financePassword })
      .expect(200);

    await agent
      .post('/api/auth/password')
      .send({ currentPassword: 'wrong', newPassword: 'newpass-e2e-1' })
      .expect(401);

    await agent
      .post('/api/auth/password')
      .send({ currentPassword: financePassword, newPassword: 'short' })
      .expect(400);

    const changed = await agent
      .post('/api/auth/password')
      .send({
        currentPassword: financePassword,
        newPassword: 'newpass-e2e-99',
      })
      .expect(200);
    expect(changed.body.user.email).toBe('finance@shankara.local');

    await agent.get('/api/auth/me').expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'finance@shankara.local', password: financePassword })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'finance@shankara.local',
        password: 'newpass-e2e-99',
      })
      .expect(200);

    // Put the seed password back so later suites in the same scratch DB
    // (if any) still work.
    await agent
      .post('/api/auth/password')
      .send({
        currentPassword: 'newpass-e2e-99',
        newPassword: financePassword,
      })
      .expect(200);
  });
});
