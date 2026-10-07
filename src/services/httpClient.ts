import { API_URL } from '@/config/env';
import { ApiError, kindFromStatus } from './ApiError';
import { getTranslations } from '@/i18n';

const REQUEST_TIMEOUT_MS = 10_000;
type TokenProvider = () => string | null;
let tokenProvider: TokenProvider = () => null;
let onUnauthorized: (() => void | Promise<void>) | null = null;
let refreshSession: (() => Promise<void>) | null = null;
let renewal: Promise<void> | null = null;
let generation = 0;

export function configureHttpClient(options: {
  getToken: TokenProvider;
  onUnauthorized?: () => void | Promise<void>;
  refreshSession?: () => Promise<void>;
}) {
  generation++;
  tokenProvider = options.getToken;
  onUnauthorized = options.onUnauthorized ?? null;
  refreshSession = options.refreshSession ?? null;
  renewal = null;
}
export function resetHttpClient() {
  configureHttpClient({ getToken: () => null });
}
export function invalidateHttpRequests() {
  generation++;
  renewal = null;
}

type RequestPolicy = { authenticated?: boolean; retryUnauthorized?: boolean };

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  policy: RequestPolicy = {},
): Promise<T> {
  const epoch = generation;
  const authenticated = policy.authenticated !== false;
  const token = authenticated ? tokenProvider() : null;
  try {
    return await request<T>(path, init, token);
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      !token ||
      !authenticated ||
      policy.retryUnauthorized === false ||
      epoch !== generation
    )
      throw error;
    if (refreshSession) {
      // Late responses for the old token reuse an already renewed session.
      if (tokenProvider() === token) {
        if (!renewal) {
          const pending = refreshSession();
          renewal = pending;
          void pending
            .finally(() => {
              if (renewal === pending) renewal = null;
            })
            .catch(() => undefined);
        }
        await renewal;
      }
      const nextToken = tokenProvider();
      if (!nextToken || epoch !== generation) throw error;
      try {
        return await request<T>(path, init, nextToken);
      } catch (retryError) {
        if (
          retryError instanceof ApiError &&
          retryError.status === 401 &&
          epoch === generation &&
          tokenProvider() === nextToken
        )
          await onUnauthorized?.();
        throw retryError;
      }
    }
    await onUnauthorized?.();
    throw error;
  }
}

async function request<T>(path: string, init: RequestInit, token: string | null): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  init.signal?.addEventListener('abort', cancel);
  if (init.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok)
      throw new ApiError(kindFromStatus(response.status), `HTTP ${response.status}`, response.status);
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ApiError('invalid_response', getTranslations().errors.invalidResponseShort);
    }
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError')
      throw new ApiError('timeout', getTranslations().errors.requestTimedOut);
    throw new ApiError('network', getTranslations().errors.networkRequestFailed);
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}
