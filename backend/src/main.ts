import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  // Unsigned: the JWT itself is what's being trusted (verified by
  // JwtStrategy), not the cookie wrapper — signing the cookie too would
  // just be a second secret to manage for no added protection.
  app.use(cookieParser());

  if (configService.get<boolean>('TRUST_PROXY')) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  const corsOrigin =
    configService.get<string>('CORS_ORIGIN') || 'http://127.0.0.1:5173';
  const isProd = configService.get<string>('NODE_ENV') === 'production';
  app.enableCors({
    origin: isProd
      ? corsOrigin
      : Array.from(
          new Set([
            corsOrigin,
            'http://127.0.0.1:5173',
            'http://localhost:5173',
          ]),
        ),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get<number>('PORT') || 3000;
  // Loopback only: Caddy is the sole front door (ops/Caddyfile and
  // ops/Caddyfile.windows both reverse_proxy to 127.0.0.1:3000).
  // Binding every interface put the API on the office LAN over plain
  // HTTP, and because TRUST_PROXY is on, requests arriving straight at
  // :3000 could set their own X-Forwarded-For — spoofing the client IP
  // the login throttle and the audit log both record.
  await app.listen(port, '127.0.0.1');
}
bootstrap();
