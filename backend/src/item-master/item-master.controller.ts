import { Controller, Post, Get, Param, UseInterceptors, UploadedFile, Req, Res, BadRequestException, HttpCode, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { Roles } from '../auth/roles.decorator';
import { ItemMasterService } from './item-master.service';

type AuthedRequest = Request & { user: any };

@Controller('item-uploads')
export class ItemUploadsController {
  constructor(private readonly itemMasterService: ItemMasterService) {}
  
  @Roles('steward')
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } })) // 50MB
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
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
  async getBatch(@Param('id') id: string, @Req() req: AuthedRequest) {
    const batch = await this.itemMasterService.getBatch(Number(id));
    if (req.user && (req.user.role === 'finance' || req.user.role === 'branch') && batch.status !== 'published') {
      throw new NotFoundException();
    }
    return batch;
  }

  @Roles('steward')
  @Post(':id/publish')
  @HttpCode(200)
  async publishBatch(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.itemMasterService.publishBatch(Number(id), req.user.id, req.ip, req.headers['user-agent'] as string);
  }

  @Roles('steward')
  @Post(':id/hold')
  @HttpCode(200)
  async holdBatch(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.itemMasterService.holdBatch(Number(id), req.user.id, req.ip, req.headers['user-agent'] as string);
  }

  @Roles('steward')
  @Get(':id/skips')
  async getSkips(@Param('id') id: string) {
    return this.itemMasterService.getSkips(Number(id));
  }
}
