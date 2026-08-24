import { Controller, Post, Delete, Body, Param, Req, HttpCode } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { ItemMasterService } from './item-master.service';
import { ManualItemDto } from './dto/manual-item.dto';

type AuthedRequest = Request & { user: any };

// Add / edit / delete one catalog row without a full spreadsheet re-upload.
// Every write here goes through ItemMasterService's normal batch->publish
// pipeline (see manualUpsert/manualDelete) so it's versioned and audited
// exactly like an upload — just steward-only and immediate, since there's
// nothing to hold for review on a single typed-in row.
@Controller('item-master/rows')
@Roles('steward')
export class ItemMasterManualController {
  constructor(private readonly itemMasterService: ItemMasterService) {}

  @Post()
  @HttpCode(200)
  async upsert(@Body() body: ManualItemDto, @Req() req: AuthedRequest) {
    return this.itemMasterService.manualUpsert(body, req.user.id, req.ip, req.headers['user-agent'] as string);
  }

  @Delete(':itemCode')
  @HttpCode(200)
  async remove(@Param('itemCode') itemCode: string, @Req() req: AuthedRequest) {
    return this.itemMasterService.manualDelete(itemCode, req.user.id, req.ip, req.headers['user-agent'] as string);
  }
}
