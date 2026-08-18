import { Module } from '@nestjs/common';
import { OBJECT_STORE } from './object-store';
import { LocalFsObjectStore } from './local-fs.object-store';

@Module({
  providers: [
    {
      provide: OBJECT_STORE,
      useClass: LocalFsObjectStore,
    },
  ],
  exports: [OBJECT_STORE],
})
export class StorageModule {}
