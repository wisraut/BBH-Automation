/**
 * Typed API client for BBH backend (FastAPI).
 *
 * Types are auto-generated from /openapi.json — run `npm run gen-types` to refresh
 * when backend schema changes. See ../CLAUDE.md for workflow.
 */
import type { paths } from './api-types';
import { API_BASE } from './apiBase';

const TOKEN_KEY = 'bbh_token';

// Auth state lives in HttpOnly cookies set by the backend (XSS-safe). These
// localStorage helpers stay as no-ops so existing call sites don't need to
// change, but the bridge no longer trusts whatever is in localStorage —
// only the bbh_token cookie matters.
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

// CSRF double-submit: bridge sets a readable bbh_csrf cookie on login; we
// echo its value back in X-CSRF-Token on every mutation.
function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  /** Skip Authorization header (for /auth/login etc.) */
  noAuth?: boolean;
}

// core ของ API client — ประกอบ header (auth token + CSRF), ยิง fetch ไป backend,
// จัดการ 401 (เคลียร์ token + emit event), และแปลง error body เป็น ApiError ที่ typed
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (!options.noAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  // CSRF token on state-changing methods (cookie-based session only).
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = readCookie('bbh_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
    credentials: 'include',
  });

  if (res.status === 401 && !options.noAuth) {
    clearToken();
    window.dispatchEvent(new CustomEvent('bbh:unauthorized'));
  }

  if (!res.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = res.statusText;
    let details: unknown;
    try {
      const errBody = await res.json();
      // FastAPI default: { detail: ... } or our standard: { error: { code, message } }
      if (errBody.error?.code) {
        code = errBody.error.code;
        message = errBody.error.message ?? message;
        details = errBody.error.details;
      } else if (typeof errBody.detail === 'string') {
        message = errBody.detail;
      } else if (errBody.detail?.code) {
        code = errBody.detail.code;
        message = errBody.detail.message ?? message;
      } else {
        details = errBody;
      }
    } catch {
      // body not JSON
    }
    throw new ApiError(res.status, code, message, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
};

/**
 * Helper to extract response type for a given path + method.
 *
 * Usage:
 *   type LoginResponse = ApiResponse<'/auth/login', 'post'>;
 *   const data = await api.post<LoginResponse>('/auth/login', { email, password });
 */
export type ApiResponse<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  responses: { 200: { content: { 'application/json': infer R } } };
}
  ? R
  : paths[P][M] extends {
      responses: { 201: { content: { 'application/json': infer R } } };
    }
  ? R
  : never;

export type ApiRequestBody<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;
