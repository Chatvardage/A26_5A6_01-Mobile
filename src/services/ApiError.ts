export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'server'
  | 'unknown'
  | 'invalid_response'
  | 'storage'
  | 'conflict'
  | 'validation'
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
  if (status === 400) return 'validation';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limit';
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
      case 'validation':
        return 'Vérifiez les champs du formulaire.';
      case 'conflict':
        return 'Ce pseudo ou ce courriel est déjà utilisé.';
      case 'rate_limit':
        return 'Trop de tentatives. Réessayez dans quelques instants.';
      case 'storage':
        return 'Le stockage sécurisé est indisponible. Réessayez.';
      case 'invalid_response':
        return 'Réponse du serveur invalide. Réessayez.';
      case 'network':
        return 'Impossible de joindre le serveur. Vérifiez votre connexion.';
      case 'timeout':
        return 'Le serveur met trop de temps à répondre. Réessayez.';
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
