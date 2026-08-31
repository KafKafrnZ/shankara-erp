import type { LiveSources, User } from './types.ts';
import { pushDevLog } from './devlog.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  /** The server's own error text, kept for logging/debugging — `message`
   *  is what's shown to the user and may be a friendlier stand-in for this. */
  readonly technicalMessage?: string;

  constructor(status: number, message: string, payload?: unknown, technicalMessage?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.technicalMessage = technicalMessage;
  }
}

const CONTACT_HINT = 'contact your steward with what you were doing';

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
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const method = (init.method || 'GET').toUpperCase();
  const startedAt = performance.now();

  let res: Response;
  try {
    // Auth rides an httpOnly cookie (see AuthController.login), not a
    // header this code sets — 'same-origin' just makes explicit what
    // fetch already defaults to: send it for same-origin requests (the
    // only kind this app makes, via the Vite dev proxy or Caddy in
    // production), never cross-origin.
    res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  } catch {
    pushDevLog({ method, path, status: null, ok: false, ms: Math.round(performance.now() - startedAt), at: Date.now() });
    throw new ApiError(0, `Can't reach the server right now. Check your connection and try again, or ${CONTACT_HINT} if this keeps happening.`);
  }
  pushDevLog({ method, path, status: res.status, ok: res.ok, ms: Math.round(performance.now() - startedAt), at: Date.now() });

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
      // No client-side token to clear — the cookie is httpOnly and
      // whatever made this 401 (expired/missing/revoked) already means
      // the server no longer honors it either way.
      if (window.location.pathname !== '/login') {
        const next = `${window.location.pathname}${window.location.search}`;
        const safe = next.startsWith('/') && !next.startsWith('//')
          ? `/login?next=${encodeURIComponent(next)}`
          : '/login';
        window.location.assign(safe);
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

  if (res.status >= 500) {
    const raw = nestMessage(payload) || `Request failed (${res.status})`;
    console.error(`[api] ${path} -> ${res.status}: ${raw}`);
    throw new ApiError(
      res.status,
      `Something went wrong on our end — this wasn't caused by anything you did. Please try again, or ${CONTACT_HINT} if it keeps happening.`,
      payload,
      raw,
    );
  }

  if (!res.ok) {
    throw new ApiError(res.status, nestMessage(payload) || `Request failed (${res.status})`, payload);
  }

  return payload as T;
}

export function login(email: string, password: string) {
  // The response also carries accessToken (kept for non-browser callers —
  // see AuthController.login) but this app authenticates via the cookie
  // the same response sets, not by reading it out of the JSON body.
  return api<{ user: User }>(
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

export function changePassword(currentPassword: string, newPassword: string) {
  return api<{ user: User }>(
    '/api/auth/password',
    { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) },
  );
}

export function fetchAsOf() {
  return api<{ asOf: string | null; batchId: number | null }>('/api/meta/as-of');
}

export function fetchLiveSources() {
  return api<LiveSources>('/api/meta/live-sources');
}
