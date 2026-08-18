import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { VouchersService } from './vouchers.service';

@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get(':id')
  async getVoucher(@Param('id') id: string, @Query('version') version: string, @Req() req: any) {
    return this.vouchersService.getVoucher(Number(id), req.user, version === 'all', req.ip, req.headers['user-agent']);
  }
}
