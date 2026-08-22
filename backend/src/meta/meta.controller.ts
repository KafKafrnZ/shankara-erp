import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { MetaService } from './meta.service';
import type { AuthUser } from '../auth/auth-user';

type AuthedRequest = Request & { user: AuthUser };

@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Get('as-of')
  async getAsOf(@Req() req: AuthedRequest) {
    return this.metaService.getAsOf(req.user);
  }

  @Get('live-sources')
  async getLiveSources(@Req() req: AuthedRequest) {
    return this.metaService.getLiveSources(req.user);
  }

  @Get('vch-types')
  async getVchTypes(@Req() req: AuthedRequest) {
    return this.metaService.listVchTypes(req.user);
  }

  @Get('companies')
  async getCompanies(@Req() req: AuthedRequest) {
    return this.metaService.listCompanies(req.user);
  }
}
