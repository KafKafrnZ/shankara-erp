import { Controller, Get, Post, Body, Param, Res } from '@nestjs/common';
import { ItemSearchService } from './item-search.service';

@Controller('item-search')
export class ItemSearchController {
  constructor(private readonly searchService: ItemSearchService) {}

  @Post()
  async search(@Body() query: any) {
    return this.searchService.search({
      q: query.q,
      mainGroup: query.mainGroup,
      subGroup: query.subGroup,
      brand: query.brand,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('facets')
  async facets() {
    return this.searchService.getFacets();
  }

  @Get('history/:itemCode')
  async history(@Param('itemCode') itemCode: string) {
    return this.searchService.getItemHistory(itemCode);
  }
}
