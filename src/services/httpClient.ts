import { API_URL } from '@/config/env';

import { ApiError, kindFromStatus } from './ApiError';

const REQUEST_TIMEOUT_MS = 10_000;

type TokenProvider = () => string | null;

let tokenProvider: TokenProvider = () => null;
let onUnauthorized: (() => void) | null = null;

/** Branché par la couche session : le client HTTP ne sait pas où le jeton est stocké. */
export function configureHttpClient(options: { getToken: TokenProvider; onUnauthorized?: () => void }) {
  tokenProvider = options.getToken;
  onUnauthorized = options.onUnauthorized ?? null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenProvider();
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('network', 'Network request failed');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.erreur === 'string') detail = body.erreur;
      else if (typeof body?.message === 'string') detail = body.message;
    } catch {
      // corps non JSON : on garde le statut
    }
    if (response.status === 401 && token) onUnauthorized?.();
    throw new ApiError(kindFromStatus(response.status), detail, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
