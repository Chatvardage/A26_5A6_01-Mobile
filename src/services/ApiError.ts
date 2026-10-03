export type ApiErrorKind = 'network' | 'unauthorized' | 'forbidden' | 'not_found' | 'server' | 'unknown';

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
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Message affichable à l'utilisateur (jamais de détail technique). */
export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'network':
        return 'Impossible de joindre le serveur. Vérifiez votre connexion.';
      case 'unauthorized':
        return 'Votre session a expiré. Reconnectez-vous.';
      case 'forbidden':
        return "Vous n'avez pas accès à cette conversation.";
      case 'not_found':
        return 'Conversation introuvable.';
      case 'server':
        return 'Le serveur rencontre un problème. Réessayez plus tard.';
    }
  }
  return 'Une erreur est survenue.';
}
