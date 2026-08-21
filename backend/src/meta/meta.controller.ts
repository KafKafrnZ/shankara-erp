import { Controller, Get, Req } from '@nestjs/common';
import { MetaService } from './meta.service';

@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Get('as-of')
  async getAsOf(@Req() req: any) {
    return this.metaService.getAsOf(req.user);
  }

  @Get('vch-types')
  async getVchTypes(@Req() req: any) {
    return this.metaService.listVchTypes(req.user);
  }

  @Get('companies')
  async getCompanies(@Req() req: any) {
    return this.metaService.listCompanies(req.user);
  }
}
