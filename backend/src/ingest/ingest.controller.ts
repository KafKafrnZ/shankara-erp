import { Controller, Post, Get, Param, Query, UseInterceptors, UploadedFile, Body, Req, Res, BadRequestException, HttpCode } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { IngestService } from './ingest.service';
import { UploadDto } from './dto/upload.dto';
import { AuthUser } from '../auth/auth-user';
import { ParseIdPipe } from '../common/parse-id.pipe';

type AuthedRequest = Request & { user: AuthUser };

@Controller('uploads')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}
  
  @Roles('steward')
  @Post()
  // Multer buffers the whole upload in memory, so an unbounded limit here
  // let a single large file exhaust the process. Matches the catalog cap.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
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

  @Roles('steward', 'finance')
  @Get(':id')
  async getBatch(@Param('id', ParseIdPipe) id: number, @Req() req: AuthedRequest) {
    return this.ingestService.getBatch(id, req.user);
  }

  @Roles('steward')
  @Get(':id/rejects')
  async getBatchRejects(
    @Param('id', ParseIdPipe) id: number,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '50',
  ) {
    return this.ingestService.getBatchRejects(id, Number(page), Number(pageSize));
  }

  @Roles('steward')
  @Post(':id/publish')
  @HttpCode(200)
  async publishBatch(@Param('id', ParseIdPipe) id: number, @Req() req: AuthedRequest) {
    return this.ingestService.publishBatch(id, req.user.id, req.ip, req.headers['user-agent'] as string);
  }

  @Roles('steward')
  @Post(':id/hold')
  @HttpCode(200)
  async holdBatch(@Param('id', ParseIdPipe) id: number, @Req() req: AuthedRequest) {
    return this.ingestService.holdBatch(id, req.user.id, req.ip, req.headers['user-agent'] as string);
  }
}
