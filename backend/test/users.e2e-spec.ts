import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from './../src/app.module';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let db: Client;
  let stewardToken: string;
  let financeToken: string;
  const createdIds: string[] = [];

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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
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
    for (const id of createdIds) {
      await db.query(`DELETE FROM audit_event WHERE entity_id = $1 AND entity_type = 'app_user'`, [id]);
      await db.query(`DELETE FROM app_user WHERE id = $1`, [id]).catch(() => undefined);
    }
    await app.close();
    await db.end();
  });

  it('non-steward is 403 on every user admin route', async () => {
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        email: 'nope@shankara.local',
        displayName: 'Nope',
        role: 'finance',
        password: 'password1',
      })
      .expect(403);
  });

  it('steward creates a user who can log in, then deactivation blocks login', async () => {
    const email = `e2e-user-${Date.now()}@shankara.local`;
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${stewardToken}`)
      .send({
        email,
        displayName: 'E2E Person',
        role: 'finance',
        password: 'password1',
      })
      .expect(201);
    createdIds.push(created.body.id);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password1' })
      .expect(200);
    expect(login.body.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .patch(`/api/users/${created.body.id}`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password1' })
      .expect(401);
  });

  it('password reset changes the password and kills the old token', async () => {
    const email = `e2e-reset-${Date.now()}@shankara.local`;
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${stewardToken}`)
      .send({
        email,
        displayName: 'Reset Person',
        role: 'finance',
        password: 'password1',
      })
      .expect(201);
    createdIds.push(created.body.id);

    const before = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password1' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/users/${created.body.id}/reset-password`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .send({ newPassword: 'password2' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password1' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password2' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${before.body.accessToken}`)
      .expect(401);
  });

  it('refuses to turn off the last office admin', async () => {
    const stewards = await db.query(
      `SELECT id FROM app_user WHERE role = 'steward' AND is_active = true`,
    );
    expect(stewards.rows.length).toBeGreaterThanOrEqual(1);

    const extra = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${stewardToken}`)
      .send({
        email: `e2e-steward-${Date.now()}@shankara.local`,
        displayName: 'Extra Admin',
        role: 'steward',
        password: 'password1',
      })
      .expect(201);
    createdIds.push(extra.body.id);

    await request(app.getHttpServer())
      .patch(`/api/users/${extra.body.id}`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .send({ isActive: false })
      .expect(200);

    const lastId = stewards.rows[0].id;
    const res = await request(app.getHttpServer())
      .patch(`/api/users/${lastId}`)
      .set('Authorization', `Bearer ${stewardToken}`)
      .send({ isActive: false })
      .expect(400);
    expect(res.body.message).toMatch(/at least one office admin/i);
  });

  it('logout stops the old token from working', async () => {
    const email = `e2e-logout-${Date.now()}@shankara.local`;
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${stewardToken}`)
      .send({
        email,
        displayName: 'Logout Person',
        role: 'finance',
        password: 'password1',
      })
      .expect(201);
    createdIds.push(created.body.id);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
  });
});
