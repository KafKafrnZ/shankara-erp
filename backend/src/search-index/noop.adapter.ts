import { Injectable } from '@nestjs/common';
import { VoucherIndex, IndexedVoucher } from './search-index.interface';

@Injectable()
export class NoOpAdapter implements VoucherIndex {
  async upsert(docs: IndexedVoucher[]): Promise<void> {}
  async deleteByIds(ids: string[]): Promise<void> {}
  async deleteByBatchId(batchId: string): Promise<void> {}
  async reindexAll(docs: IndexedVoucher[]): Promise<{ indexed: number }> {
    return { indexed: docs.length };
  }
  async ping(): Promise<boolean> {
    return true;
  }
  
  async searchCandidates(q: string, opts: { size: number }): Promise<{ ids: string[]; tookMs: number }> {
    throw new Error('OS disabled');
  }
}
