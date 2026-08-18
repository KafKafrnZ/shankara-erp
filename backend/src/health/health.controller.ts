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
      return {
        status: 'ok',
        db: 'ok',
        asOf: null,
      };
    } catch (error) {
      throw new InternalServerErrorException({
        status: 'error',
        db: 'down',
      });
    }
  }
}
