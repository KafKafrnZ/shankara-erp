import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  Req,
  Res,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/roles.decorator';
import { ItemMasterService } from './item-master.service';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { matchUpload, UPLOAD_ERROR } from '../common/spreadsheet-kind';
import { PublishBatchDto } from './dto/publish-batch.dto';

type AuthedRequest = Request & { user: any };

@Controller('item-uploads')
export class ItemUploadsController {
  constructor(private readonly itemMasterService: ItemMasterService) {}

  @Roles('steward', 'finance', 'branch')
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  ) // 50MB
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Filename and bytes have to agree (.xlsx that isn't a ZIP, .csv that
    // is actually a PDF, a screenshot renamed to .xls). Reject it here in
    // words that say what to do about it, before anything is stored.
    if (!matchUpload(file.originalname, file.buffer)) {
      throw new BadRequestException(`"${file.originalname}" ${UPLOAD_ERROR}`);
    }

    const stream = Readable.from(file.buffer);

    const result = await this.itemMasterService.processUpload(
      stream,
      file.originalname,
      file.mimetype,
      file.size,
      req.user.id,
      req.ip,
      req.headers['user-agent'],
    );
    if (result.status === 'duplicate') {
      res.status(200).json(result);
    } else {
      res.status(202).json(result);
    }
  }
}

@Controller('item-batches')
export class ItemBatchesController {
  constructor(private readonly itemMasterService: ItemMasterService) {}

  @Roles('steward', 'finance', 'branch')
  @Get(':id')
  async getBatch(@Param('id', ParseIdPipe) id: number) {
    return this.itemMasterService.getBatch(id);
  }

  @Roles('steward', 'finance', 'branch')
  @Post(':id/publish')
  @HttpCode(200)
  async publishBatch(
    @Param('id', ParseIdPipe) id: number,
    @Body() body: PublishBatchDto = {},
    @Req() req: AuthedRequest,
  ) {
    return this.itemMasterService.publishBatch(
      id,
      req.user.id,
      req.ip,
      req.headers['user-agent'],
      body,
    );
  }

  @Roles('steward')
  @Post(':id/hold')
  @HttpCode(200)
  async holdBatch(
    @Param('id', ParseIdPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.itemMasterService.holdBatch(
      id,
      req.user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Roles('steward', 'finance', 'branch')
  @Get(':id/skips')
  async getSkips(
    @Param('id', ParseIdPipe) id: number,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '50',
  ) {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const size = Math.min(
      100,
      Math.max(1, parseInt(String(pageSize), 10) || 50),
    );
    return this.itemMasterService.getSkips(id, pageNum, size);
  }

  @Roles('steward', 'finance', 'branch')
  @Post(':id/retry')
  @HttpCode(200)
  async retryBatch(
    @Param('id', ParseIdPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.itemMasterService.retryBatch(
      id,
      req.user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
