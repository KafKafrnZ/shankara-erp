import { Controller, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';

@Controller('uploads')
export class IngestController {
  
  @Roles('steward')
  @Post()
  upload() {
    return { ok: true };
  }
}
