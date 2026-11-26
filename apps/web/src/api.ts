import { useCallback, useEffect, useState } from 'react';
import type { PageResult } from './types.js';

let csrfToken = '';
export function setCsrfToken(value: string) { csrfToken = value; }
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) { super(message); }
}

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET') headers.set('x-csrf-token', csrfToken);
  let response: Response;
  try { response = await fetch(`/api${url}`, { credentials: 'same-origin', ...options, headers }); }
  catch { throw new ApiError('Không kết nối được ứng dụng. Hãy kiểm tra API đang chạy rồi thử lại.', 0); }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string; error?: string | { message?: string }; details?: unknown };
    const errorText = typeof payload.error === 'string' ? payload.error : payload.error?.message;
    if (response.status === 401 && url !== '/auth/login' && url !== '/auth/me') window.dispatchEvent(new Event('coursegraph:unauthorized'));
    throw new ApiError(payload.message ?? errorText ?? `Yêu cầu không thành công (${response.status}).`, response.status, payload.details);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function useResource<T>(url: string | null, load: (url: string) => Promise<T> = api) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    if (!url) { setData(null); setLoading(false); setError(''); return; }
    setLoading(true); setError('');
    load(url).then((result) => { if (active) setData(result); }).catch((cause: unknown) => { if (active) setError(errorMessage(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url, version, load]);
  return { data, loading, error, reload };
}

export async function loadAllPages<T>(url: string): Promise<PageResult<T>> {
  const parsed = new URL(url, 'http://coursegraph.local');
  parsed.searchParams.set('pageSize', '100');
  parsed.searchParams.set('page', '1');
  const first = await api<PageResult<T>>(`${parsed.pathname}${parsed.search}`);
  const items = [...first.items];
  const pageCount = Math.ceil(first.total / first.pageSize);
  for (let page = 2; page <= pageCount; page++) {
    parsed.searchParams.set('page', String(page));
    const next = await api<PageResult<T>>(`${parsed.pathname}${parsed.search}`);
    if (!next.items.length) throw new ApiError('Danh mục đang thay đổi. Vui lòng tải lại để lấy đủ bản ghi.', 409);
    items.push(...next.items);
  }
  return { ...first, items, pageSize: items.length || first.pageSize };
}

export function useAllPages<T>(url: string | null) { return useResource<PageResult<T>>(url, loadAllPages); }

export function csvFilename(label: string, entities: { label: string; file: string }[]): string {
  return label === 'relationships' ? 'QuanHeLienKet.csv' : entities.find((entity) => entity.label === label)?.file ?? `${label}.csv`;
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
  if (!(error instanceof ApiError)) return message;
  const details = Array.isArray(error.details) ? error.details : [error.details];
  const hints = details.flatMap((detail: unknown) => {
    if (typeof detail !== 'object' || detail === null || !('message' in detail) || typeof detail.message !== 'string') return [];
    const location = 'path' in detail ? detail.path : undefined;
    const field = Array.isArray(location) ? location.filter((part) => typeof part === 'string' || typeof part === 'number').join('.') : typeof location === 'string' ? location : '';
    return [`${field ? `${field.slice(0, 160)}: ` : ''}${detail.message.replace(/\s+/g, ' ').slice(0, 260)}`];
  }).slice(0, 5);
  return hints.length ? `${message} ${hints.join('; ')}` : message;
}

export async function download(url: string, filename: string) {
  const response = await fetch(`/api${url}`, { credentials: 'same-origin' });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('coursegraph:unauthorized'));
    throw new ApiError(`Không xuất được dữ liệu (${response.status}).`, response.status);
  }
  const href = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = href; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
