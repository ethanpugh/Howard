import { hc, type ClientResponse } from 'hono/client';
import type { AppType } from '../../server/http.ts';
import type { ProfileId } from '../../shared/schemas/common.ts';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function buildProfileScopedUrl(url: string, profileId?: ProfileId | ''): string {
  if (!profileId) return url;
  const hashIdx = url.indexOf('#');
  const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
  const qIdx = base.indexOf('?');
  if (qIdx >= 0) {
    const existingParams = new URLSearchParams(base.slice(qIdx + 1));
    if (existingParams.has('profile')) return url;
    return `${base}&profile=${encodeURIComponent(profileId)}${hash}`;
  }
  return `${base}?profile=${encodeURIComponent(profileId)}${hash}`;
}

export interface RpcRequestOptions {
  profileId?: ProfileId | '' | undefined;
  signal?: AbortSignal | undefined;
  keepalive?: boolean | undefined;
  headers?: Record<string, string> | undefined;
}

/**
 * Typed Hono RPC client (`hc<AppType>`) with uniform profile scoping, abort signal, and keepalive support.
 */
export function createRpcClient({
  profileId = '',
  signal,
  keepalive = false,
  headers = {}
}: RpcRequestOptions = {}) {
  return hc<AppType>('', {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const finalUrl = buildProfileScopedUrl(rawUrl, profileId);
      const mergedHeaders = new Headers(headers);
      if (init?.headers) {
        new Headers(init.headers).forEach((value, key) => {
          mergedHeaders.set(key, value);
        });
      }
      if (profileId && !mergedHeaders.has('X-Howard-Profile')) {
        mergedHeaders.set('X-Howard-Profile', profileId);
      }
      const nextInit: RequestInit = {
        ...init,
        headers: mergedHeaders
      };
      const resolvedSignal = signal ?? init?.signal;
      if (resolvedSignal !== undefined) {
        nextInit.signal = resolvedSignal;
      }
      if (keepalive || init?.keepalive) {
        nextInit.keepalive = true;
      }
      return fetch(finalUrl, nextInit);
    }
  });
}

export const apiRpc = createRpcClient();

type SuccessResponseData<TRes> =
  TRes extends ClientResponse<infer TData, infer TStatus, string>
    ? TStatus extends 204
      ? undefined
      : TStatus extends 200 | 201 | 202
        ? TData
        : never
    : never;

/**
 * Unwraps a Hono RPC `ClientResponse`, throwing `ApiError` on non-OK HTTP status
 * or malformed JSON payloads, preserving the inferred success JSON payload type.
 */
export async function unwrapRpc<TRes extends ClientResponse<unknown, number, string>>(
  resPromise: Promise<TRes>
): Promise<SuccessResponseData<TRes>> {
  const res = await resPromise;
  if (res.status === 204) {
    return undefined as SuccessResponseData<TRes>;
  }

  const text = await res.text();
  let data: unknown = null;
  let parseFailed = false;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      parseFailed = true;
      data = null;
    }
  }

  if (!res.ok) {
    const errPayload =
      data && typeof data === 'object' ? (data as { error?: unknown }) : null;
    const message =
      typeof errPayload?.error === 'string'
        ? errPayload.error
        : `Request failed (${res.status} ${res.statusText || ''})`.trim();
    throw new ApiError(message, res.status, data);
  }

  if (parseFailed || !text) {
    throw new ApiError(
      parseFailed
        ? `Invalid JSON response from server (${res.status})`
        : `Empty JSON response from server (${res.status})`,
      res.status,
      text
    );
  }

  return data as SuccessResponseData<TRes>;
}
