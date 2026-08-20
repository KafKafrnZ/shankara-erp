import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);
  
  app.setGlobalPrefix('api');
  app.use(helmet());

  const corsOrigin = configService.get<string>('CORS_ORIGIN') || 'http://127.0.0.1:5173';
  app.enableCors({
    origin: Array.from(new Set([corsOrigin, 'http://127.0.0.1:5173', 'http://localhost:5173'])),
  });
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);
}
bootstrap();
