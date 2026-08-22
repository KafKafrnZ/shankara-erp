import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { ParseIdPipe } from '../common/parse-id.pipe';

@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get(':id')
  async getVoucher(@Param('id', ParseIdPipe) id: number, @Query('version') version: string, @Req() req: any) {
    return this.vouchersService.getVoucher(id, req.user, version === 'all', req.ip, req.headers['user-agent']);
  }
}
