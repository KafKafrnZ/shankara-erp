import { Module, Global } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { OpensearchAdapter } from './opensearch.adapter';
import { NoOpAdapter } from './noop.adapter';
import { VOUCHER_INDEX_TOKEN } from './search-index.interface';
import { SearchIndexController } from './search-index.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [SearchIndexController],
  providers: [
    {
      provide: VOUCHER_INDEX_TOKEN,
      useFactory: (config: ConfigService) => {
        const node = config.get<string>('OPENSEARCH_NODE');
        if (!node || node === 'off') {
          return new NoOpAdapter();
        }
        return new OpensearchAdapter(node);
      },
      inject: [ConfigService],
    },
  ],
  exports: [VOUCHER_INDEX_TOKEN],
})
export class SearchIndexModule {}
