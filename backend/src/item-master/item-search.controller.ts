import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ItemSearchService } from './item-search.service';
import { ItemSearchDto } from './dto/item-search.dto';
import { BulkItemCodesDto } from './dto/bulk-item-codes.dto';

@Controller('item-search')
export class ItemSearchController {
  constructor(private readonly searchService: ItemSearchService) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async search(@Body() query: ItemSearchDto) {
    return this.searchService.search({
      q: query.q,
      mainGroup: query.mainGroup,
      subGroup: query.subGroup,
      brand: query.brand,
      extra: query.extra,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('facets')
  async facets() {
    return this.searchService.getFacets();
  }

  @Get('fields')
  async fields() {
    return this.searchService.getAvailableExtraFields();
  }

  @Get('facets/extra')
  async extraFacet(@Query('field') field: string) {
    return this.searchService.getExtraFacet(field);
  }

  @Get('history/:itemCode')
  async history(@Param('itemCode') itemCode: string) {
    return this.searchService.getItemHistory(itemCode);
  }

  @Post('bulk')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async bulk(@Body() body: BulkItemCodesDto) {
    return this.searchService.getCurrentRowsForExport(body.itemCodes);
  }

  @Post('export')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async export(@Body() body: BulkItemCodesDto, @Res() res: Response) {
    const rows = await this.searchService.getCurrentRowsForExport(
      body.itemCodes,
    );
    const workbook = this.searchService.buildExportWorkbook(rows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="catalog-export.xlsx"',
    );
    await workbook.xlsx.write(res);
    res.end();
  }
}
