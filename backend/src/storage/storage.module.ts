import { Module } from '@nestjs/common';
import { LocalFsObjectStore } from './local-fs.object-store';

@Module({
  providers: [LocalFsObjectStore],
  exports: [LocalFsObjectStore],
})
export class StorageModule {}
