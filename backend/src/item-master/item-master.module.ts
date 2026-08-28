import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemMasterBatch } from './entities/item-master-batch.entity';
import { ItemMasterRow } from './entities/item-master-row.entity';
import { ItemMasterSkip } from './entities/item-master-skip.entity';
import { SourceFile } from '../storage/entities/source-file.entity';
import { ItemMasterService } from './item-master.service';
import {
  ItemUploadsController,
  ItemBatchesController,
} from './item-master.controller';
import { ItemMasterManualController } from './item-master-manual.controller';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { ItemSearchService } from './item-search.service';
import { ItemSearchController } from './item-search.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemMasterBatch,
      ItemMasterRow,
      ItemMasterSkip,
      SourceFile,
    ]),
    StorageModule,
    AuditModule,
  ],
  controllers: [
    ItemUploadsController,
    ItemBatchesController,
    ItemMasterManualController,
    ItemSearchController,
  ],
  providers: [ItemMasterService, ItemSearchService],
  exports: [ItemMasterService, ItemSearchService],
})
export class ItemMasterModule {}
