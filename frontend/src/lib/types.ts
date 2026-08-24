export type Role = 'steward' | 'finance' | 'branch';

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  companyId: string | null;
  branchId: string | null;
};

export type LiveSourceFile = {
  batchId: number;
  originalName: string;
  publishedAt: string | null;
  liveRows: number;
};

export type PendingSourceFile = {
  batchId: number;
  originalName: string;
  status: string;
  acceptedRows: number;
  uploadedAt: string | null;
};

export type LiveSources = {
  items: { live: LiveSourceFile[]; pending: PendingSourceFile[] };
};

export const PAGE_SIZE = 20;
