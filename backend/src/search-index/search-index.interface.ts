export interface IndexedVoucher {
  id: string; // postgres voucher.id
  company_id: string;
  company_name: string;
  vch_no: string;
  vch_no_norm: string;
  party_name: string | null;
  total_amount: string; // 2-dp string
  narration: string | null;
  vch_date: string; // yyyy-MM-dd
  vch_type: string;
  batch_id: string;
}

export const VOUCHER_INDEX_TOKEN = 'VOUCHER_INDEX_TOKEN';

export interface VoucherIndex {
  upsert(docs: IndexedVoucher[]): Promise<void>;
  deleteByIds(ids: string[]): Promise<void>;
  deleteByBatchId(batchId: string): Promise<void>;
  reindexAll(docs: IndexedVoucher[]): Promise<{ indexed: number }>; // wipe + bulk
  ping(): Promise<boolean>;
  searchCandidates(q: string, opts: { size: number }): Promise<{ ids: string[]; tookMs: number }>;
}
