import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');
import { AppModule } from '../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app.close();
  });

  let stewardToken: string;
  let financeToken: string;

  it('login good steward returns 200, token and role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'steward@shankara.local',
        password: process.env.SEED_STEWARD_PASSWORD || 'steward_dev_pass',
      })
      .expect(201); // NestJS default for POST is 201
    
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('steward');
    stewardToken = res.body.accessToken;
  });

  it('login good finance returns 200, token and role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'finance@shankara.local',
        password: process.env.SEED_FINANCE_PASSWORD || 'finance_dev_pass',
      })
      .expect(201);
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
  });

  it('GET /api/auth/me without token is 401', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .expect(401);
  });

  it('GET /api/auth/me with token returns user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(200);
    
    expect(res.body.email).toBe('steward@shankara.local');
    expect(res.body.role).toBe('steward');
  });

  it('GET /api/health remains public 200', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
  });

  it('finance cannot hit a steward-only stub', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(403);
  });

  it('steward CAN hit a steward-only stub', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${stewardToken}`)
      .expect(201); // default POST
  });
});
