import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import * as multer from 'multer';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { SourceFile } from './entities/source-file.entity';
import { IngestBatch } from './entities/ingest-batch.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SourceFile, IngestBatch]),
    StorageModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        storage: multer.memoryStorage(),
        limits: {
          fileSize: configService.get<number>('MAX_UPLOAD_BYTES') || 52428800,
        },
      }),
    }),
  ],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
