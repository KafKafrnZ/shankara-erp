export type Role = 'steward' | 'finance' | 'branch';

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  companyId: string | null;
  branchId: string | null;
};

export type SearchBody = {
  q?: string;
  from?: string;
  to?: string;
  vchType?: string;
  limit?: number;
  offset?: number;
};

export type SearchHit = {
  id: number;
  vchNo: string;
  vchType: string;
  vchDate: string;
  partyName: string;
  totalAmount: string;
  narration: string;
  companyId: string;
};

export type SearchResponse = {
  asOf: string | null;
  total: number;
  hits: SearchHit[];
};

export type VoucherLine = {
  lineNo: number;
  ledgerName: string;
  debit: string;
  credit: string;
};

export type VoucherDetail = {
  id: number;
  vchNo: string;
  vchNoNorm: string;
  vchType: string;
  vchDate: string;
  partyName: string;
  totalAmount: string;
  narration: string;
  companyId: string;
  lines: VoucherLine[];
  source: {
    batchId: number;
    fileName: string;
    sha256: string;
    sourceRowNo: number;
    publishedAt: string | null;
  };
};

export type BatchStatus = 'held' | 'published' | 'rejected';

export type Batch = {
  id: number;
  status: BatchStatus;
  companyId: string;
  tallyCompany: string;
  periodFrom: string | null;
  periodTo: string | null;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  debitSum: string;
  creditSum: string;
  errorSummary: string | null;
  publishedAt: string | null;
  sha256: string;
};

export type UploadResult = {
  batchId: number;
  status: 'duplicate' | 'held' | 'rejected';
  duplicate: boolean;
  sha256: string;
  originalName: string;
  bytes: number;
  errorSummary?: string;
};

export type RejectRow = {
  sourceRowNo: number;
  code: string;
  message: string;
  raw: unknown;
};

export type RejectsResponse = {
  items: RejectRow[];
  total: number;
};

export const VCH_TYPES = [
  'Sales',
  'Receipt',
  'Payment',
  'Journal',
  'Purchase',
  'Contra',
  'Debit Note',
  'Credit Note',
] as const;

export const PAGE_SIZE = 20;
