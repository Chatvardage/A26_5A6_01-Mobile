import { getTranslations } from '@/i18n';

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'bad_request' // Remplace le kind local « validation » depuis la version 1.0.0.
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited' // HTTP 429 produit par kindFromStatus ; message orienté messagerie.
  | 'server'
  | 'unknown'
  | 'invalid_response'
  | 'storage'
  | 'conflict'
  | 'rate_limit'; // Compatibilité avec les consommateurs auth historiques ; message de tentatives limitées.

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
    const messages = {
      bad_request: strings.errors.badRequest,
      conflict: strings.errors.conflict,
      rate_limit: strings.errors.rateLimit,
      rate_limited: strings.errors.rateLimited,
      storage: strings.errors.storage,
      invalid_response: strings.errors.invalidResponse,
      network: strings.errors.network,
      timeout: strings.errors.timeout,
      unauthorized: strings.errors.unauthorized,
      forbidden: strings.errors.forbidden,
      not_found: strings.errors.notFound,
      server: strings.errors.server,
      unknown: strings.errors.generic,
    } satisfies Record<ApiErrorKind, string>;
    return messages[error.kind];
  }
  return strings.errors.generic;
}
