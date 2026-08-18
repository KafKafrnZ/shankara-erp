import { Controller, Post, UseInterceptors, UploadedFile, Body, Req, Res, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/roles.decorator';
import { IngestService } from './ingest.service';
import { UploadDto } from './dto/upload.dto';
import type { Response } from 'express';

@Controller('uploads')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}
  
  @Roles('steward')
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDto,
    @Req() req: any,
    @Res() res: Response
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    const result = await this.ingestService.processUpload(file, dto, req.user.id, ip, userAgent);

    if (result.duplicate) {
      return res.status(200).json(result);
    } else {
      return res.status(202).json(result);
    }
  }
}
