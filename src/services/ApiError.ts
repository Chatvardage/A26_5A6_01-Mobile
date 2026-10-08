import { getTranslations } from '@/i18n';

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'server'
  | 'unknown'
  | 'invalid_response'
  | 'storage'
  | 'conflict'
  | 'rate_limit';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function kindFromStatus(status: number): ApiErrorKind {
  if (status === 400) return 'bad_request';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Message affichable à l'utilisateur (jamais de détail technique). */
export function userMessage(error: unknown): string {
  const strings = getTranslations();
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'bad_request':
        return strings.errors.badRequest;
      case 'conflict':
        return strings.errors.conflict;
      case 'rate_limit':
        return strings.errors.rateLimit;
      case 'rate_limited':
        return strings.errors.rateLimited;
      case 'storage':
        return strings.errors.storage;
      case 'invalid_response':
        return strings.errors.invalidResponse;
      case 'network':
        return strings.errors.network;
      case 'timeout':
        return strings.errors.timeout;
      case 'unauthorized':
        return strings.errors.unauthorized;
      case 'forbidden':
        return strings.errors.forbidden;
      case 'not_found':
        return strings.errors.notFound;
      case 'server':
        return strings.errors.server;
    }
  }
  return strings.errors.generic;
}
