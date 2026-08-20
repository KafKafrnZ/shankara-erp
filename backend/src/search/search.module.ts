import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

import { AuditModule } from '../audit/audit.module';
import { SearchIndexModule } from '../search-index/search-index.module';

@Module({
  imports: [AuditModule, SearchIndexModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
