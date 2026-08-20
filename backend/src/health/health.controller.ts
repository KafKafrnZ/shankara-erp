import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async checkHealth() {
    try {
      await this.dataSource.query('SELECT 1');
      const asOfRes = await this.dataSource.query(
        `SELECT MAX(published_at) as "asOf" FROM ingest_batch WHERE status = 'published'`,
      );
      const asOf = asOfRes[0]?.asOf ? new Date(asOfRes[0].asOf).toISOString() : null;
      return {
        status: 'ok',
        db: 'ok',
        asOf,
      };
    } catch (error) {
      throw new InternalServerErrorException({
        status: 'error',
        db: 'down',
      });
    }
  }
}
