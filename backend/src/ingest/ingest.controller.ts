import { Controller, Post, Get, Param, Query, UseInterceptors, UploadedFile, Body, Req, Res, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { IngestService } from './ingest.service';
import { UploadDto } from './dto/upload.dto';
import { AuthUser } from '../auth/auth-user';

type AuthedRequest = Request & { user: AuthUser };

@Controller('uploads')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}
  
  @Roles('steward')
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDto,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const result = await this.ingestService.processUpload(
      file, dto, req.user.id, req.ip, req.headers['user-agent'] as string
    );
    if (result.status === 'duplicate') {
      res.status(200).json(result);
    } else {
      res.status(202).json(result);
    }
  }
}

@Controller('batches')
export class BatchesController {
  constructor(private readonly ingestService: IngestService) {}

  @Roles('steward')
  @Get(':id')
  async getBatch(@Param('id') id: string) {
    return this.ingestService.getBatch(Number(id));
  }

  @Roles('steward')
  @Get(':id/rejects')
  async getBatchRejects(
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '50',
  ) {
    return this.ingestService.getBatchRejects(Number(id), Number(page), Number(pageSize));
  }

  @Roles('steward')
  @Post(':id/publish')
  async publishBatch(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.ingestService.publishBatch(Number(id), req.user.id, req.ip, req.headers['user-agent'] as string);
  }

  @Roles('steward')
  @Post(':id/hold')
  async holdBatch(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.ingestService.holdBatch(Number(id), req.user.id, req.ip, req.headers['user-agent'] as string);
  }
}
