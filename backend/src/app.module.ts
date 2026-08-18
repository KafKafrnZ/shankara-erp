import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestModule } from './ingest/ingest.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    // Database Architecture: Connects to the PostgreSQL container we built in Phase 1
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'shankara_admin',
      password: 'supersecretpassword',
      database: 'shankara_erp',
      autoLoadEntities: true,
      synchronize: false, // We use init.sql for strict schema management, not auto-sync
    }),
    IngestModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
