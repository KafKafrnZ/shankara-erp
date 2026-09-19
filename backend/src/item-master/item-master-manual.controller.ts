import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { ItemMasterService } from './item-master.service';
import { ManualItemDto } from './dto/manual-item.dto';

type AuthedRequest = Request & { user: any };

// Add / edit / delete one catalog row without a full spreadsheet re-upload.
// Create is open to every signed-in role (+ New item). Edit uses this same
// POST and is steward-gated in the UI; delete stays steward-only here.
@Controller('item-master/rows')
export class ItemMasterManualController {
  constructor(private readonly itemMasterService: ItemMasterService) {}

  @Post()
  @Roles('steward', 'finance', 'branch')
  @HttpCode(200)
  async upsert(@Body() body: ManualItemDto, @Req() req: AuthedRequest) {
    return this.itemMasterService.manualUpsert(
      body,
      req.user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Delete(':itemCode')
  @Roles('steward')
  @HttpCode(200)
  async remove(@Param('itemCode') itemCode: string, @Req() req: AuthedRequest) {
    return this.itemMasterService.manualDelete(
      itemCode,
      req.user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
