/**
 * Typed API client for BBH backend (FastAPI).
 *
 * Types are auto-generated from /openapi.json — run `npm run gen-types` to refresh
 * when backend schema changes. See ../CLAUDE.md for workflow.
 */
import type { paths } from './api-types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';
const TOKEN_KEY = 'bbh_token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

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

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
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
