import type { ApiErrorShape } from '@shared/types';

/**
 * Thin fetch wrapper.
 *
 * Everything goes through here so that: cookies are always sent, errors always
 * come back as an `ApiError` with a message worth showing a human, and the
 * base URL lives in exactly one place.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level errors keyed by input name, for inline form messages. */
  get fieldErrors(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const detail of this.details ?? []) map[detail.path] = detail.message;
    return map;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

function buildUrl(path: string, query?: Query): string {
  const url = `/api${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function handle<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const shape = payload as ApiErrorShape | null;
    throw new ApiError(
      response.status,
      shape?.error?.code ?? 'UNKNOWN',
      shape?.error?.message ?? 'Something went wrong. Please try again.',
      shape?.error?.details,
    );
  }

  return payload as T;
}

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Query; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      credentials: 'include',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'We could not reach the server. Check your connection and try again.',
    );
  }
  return handle<T>(response);
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),

  /** Multipart upload — used for task attachments and avatars. */
  upload: async <T>(path: string, file: File, extra?: Record<string, string>): Promise<T> => {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);

    const response = await fetch(buildUrl(path), {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    return handle<T>(response);
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
