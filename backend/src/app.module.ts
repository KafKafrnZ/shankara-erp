import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestModule } from './ingest/ingest.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import * as Joi from 'joi';

import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

import { StorageModule } from './storage/storage.module';
import { SearchModule } from './search/search.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { MetaModule } from './meta/meta.module';
import { SearchIndexModule } from './search-index/search-index.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ItemMasterModule } from './item-master/item-master.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        CORS_ORIGIN: Joi.string().required(),
        DATABASE_HOST: Joi.string().required(),
        DATABASE_PORT: Joi.number().required(),
        DATABASE_USER: Joi.string().required(),
        DATABASE_PASSWORD: Joi.string().required(),
        DATABASE_NAME: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_EXPIRES_IN: Joi.string().default('8h'),
        STORAGE_DIR: Joi.string().default('./var/uploads'),
        MAX_UPLOAD_BYTES: Joi.number().default(52428800),
        DEBIT_CREDIT_TOLERANCE: Joi.number().default(0.01),
        EXPECTED_TALLY_COMPANY_SUBSTR: Joi.string().default('shankara'),
        OPENSEARCH_NODE: Joi.string().default('http://127.0.0.1:9200'),
        JOBS_DATABASE_PORT: Joi.number().default(5432),
        TRUST_PROXY: Joi.boolean().default(false),
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DATABASE_HOST'),
        port: configService.get<number>('DATABASE_PORT'),
        username: configService.get<string>('DATABASE_USER'),
        password: configService.get<string>('DATABASE_PASSWORD'),
        database: configService.get<string>('DATABASE_NAME'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    HealthModule,
    IngestModule,
    AuthModule,
    UsersModule,
    AuditModule,
    StorageModule,
    SearchModule,
    VouchersModule,
    MetaModule,
    SearchIndexModule,
    ItemMasterModule,
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 100 }],
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
