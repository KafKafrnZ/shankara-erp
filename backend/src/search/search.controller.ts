import { Controller, Post, Body, Req } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchDto } from './dto/search.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  async search(@Body() dto: SearchDto, @Req() req: any) {
    return this.searchService.search(dto, req.user, req.ip, req.headers['user-agent']);
  }
}
