import type {
  Batch,
  RejectsResponse,
  SearchBody,
  SearchResponse,
  UploadResult,
  User,
  VoucherDetail,
} from './types.ts';

export const TOKEN_KEY = 'sb.accessToken';

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

function nestMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message)) return message.filter((m) => typeof m === 'string').join('; ');
  }
  return '';
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (res.status === 401) {
    const isLogin = path === '/api/auth/login';
    if (!isLogin) {
      sessionStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    throw new ApiError(401, nestMessage(payload) || 'Invalid credentials', payload);
  }

  if (res.status === 403) {
    throw new ApiError(403, nestMessage(payload) || "You don't have access to this", payload);
  }

  if (res.status === 429) {
    throw new ApiError(429, nestMessage(payload) || 'Too many attempts, wait a moment.', payload);
  }

  if (!res.ok) {
    throw new ApiError(res.status, nestMessage(payload) || `Request failed (${res.status})`, payload);
  }

  return payload as T;
}

export function login(email: string, password: string) {
  return api<{ accessToken: string; user: User }>(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
}

export function fetchMe() {
  return api<User>('/api/auth/me');
}

export function logout() {
  return api<{ ok: true }>('/api/auth/logout', { method: 'POST' });
}

export function fetchAsOf() {
  return api<{ asOf: string | null; batchId: number | null }>('/api/meta/as-of');
}

export function fetchVchTypes() {
  return api<{ items: string[] }>('/api/meta/vch-types');
}

export function fetchCompanies() {
  return api<{ items: string[] }>('/api/meta/companies');
}

export function searchVouchers(body: SearchBody) {
  return api<SearchResponse>('/api/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchVoucher(id: number) {
  return api<VoucherDetail>(`/api/vouchers/${id}`);
}

export function uploadFile(file: File, companyId: string, branchId?: string) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('companyId', companyId);
  if (branchId) fd.append('branchId', branchId);
  return api<UploadResult>('/api/uploads', { method: 'POST', body: fd });
}

export function fetchBatch(id: number) {
  return api<Batch>(`/api/batches/${id}`);
}

export function fetchBatchRejects(id: number, page = 1, pageSize = 50) {
  return api<RejectsResponse>(`/api/batches/${id}/rejects?page=${page}&pageSize=${pageSize}`);
}

export function publishBatch(id: number) {
  return api<Batch>(`/api/batches/${id}/publish`, { method: 'POST' });
}

export function holdBatch(id: number) {
  return api<Batch>(`/api/batches/${id}/hold`, { method: 'POST' });
}
