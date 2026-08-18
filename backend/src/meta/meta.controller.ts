import { Controller, Get, Req } from '@nestjs/common';
import { MetaService } from './meta.service';

@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Get('as-of')
  async getAsOf(@Req() req: any) {
    return this.metaService.getAsOf(req.user);
  }
}
