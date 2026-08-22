import { Controller, Post, Get, Param, Query, UseInterceptors, UploadedFile, Req, Res, BadRequestException, HttpCode, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/roles.decorator';
import { ItemMasterService } from './item-master.service';
import { ParseIdPipe } from '../common/parse-id.pipe';

type AuthedRequest = Request & { user: any };

const ITEM_UPLOAD_EXTENSIONS = ['.xlsx'];

@Controller('item-uploads')
export class ItemUploadsController {
  constructor(private readonly itemMasterService: ItemMasterService) {}
  
  @Roles('steward')
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } })) // 50MB
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Without this, any file at all (a PDF, a screenshot, a .txt) was hashed,
    // stored and queued, only to fail deep inside the spreadsheet parser and
    // surface to the user as "invalid signature: 0x73696874". Reject it here,
    // in words that say what to do about it.
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!ITEM_UPLOAD_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `"${file.originalname}" isn't a spreadsheet we can read. Please upload an Excel .xlsx workbook exported from Tally.`,
      );
    }

    const stream = Readable.from(file.buffer);

    const result = await this.itemMasterService.processUpload(
      stream, file.originalname, file.mimetype, file.size, req.user.id, req.ip, req.headers['user-agent'] as string
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
  async getBatch(@Param('id', ParseIdPipe) id: number, @Req() req: AuthedRequest) {
    const batch = await this.itemMasterService.getBatch(id);
    if (req.user && (req.user.role === 'finance' || req.user.role === 'branch') && batch.status !== 'published') {
      throw new NotFoundException();
    }
    return batch;
  }

  @Roles('steward')
  @Post(':id/publish')
  @HttpCode(200)
  async publishBatch(@Param('id', ParseIdPipe) id: number, @Req() req: AuthedRequest) {
    return this.itemMasterService.publishBatch(id, req.user.id, req.ip, req.headers['user-agent'] as string);
  }

  @Roles('steward')
  @Post(':id/hold')
  @HttpCode(200)
  async holdBatch(@Param('id', ParseIdPipe) id: number, @Req() req: AuthedRequest) {
    return this.itemMasterService.holdBatch(id, req.user.id, req.ip, req.headers['user-agent'] as string);
  }

  @Roles('steward')
  @Get(':id/skips')
  async getSkips(
    @Param('id', ParseIdPipe) id: number,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '50',
  ) {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(String(pageSize), 10) || 50));
    return this.itemMasterService.getSkips(id, pageNum, size);
  }

  @Roles('steward')
  @Post(':id/retry')
  @HttpCode(200)
  async retryBatch(@Param('id', ParseIdPipe) id: number, @Req() req: AuthedRequest) {
    return this.itemMasterService.retryBatch(id, req.user.id, req.ip, req.headers['user-agent'] as string);
  }
}
