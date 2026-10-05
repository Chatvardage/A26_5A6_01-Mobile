import { ApiError, kindFromStatus, userMessage, type ApiErrorKind } from '@/services/ApiError';

it.each([
  [400, 'bad_request'], [401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'],
  [429, 'rate_limited'], [500, 'server'], [503, 'server'], [418, 'unknown'],
] as const)('classe le statut %i en %s', (status, kind) => {
  expect(kindFromStatus(status)).toBe(kind);
});

const cases: [ApiErrorKind, string][] = [
  ['network', 'Impossible de joindre le serveur. Vérifiez votre connexion.'],
  ['timeout', 'Le serveur met trop de temps à répondre. Réessayez.'],
  ['bad_request', 'Le message est invalide. Vérifiez son contenu.'],
  ['unauthorized', 'Votre session a expiré. Reconnectez-vous.'],
  ['forbidden', "Vous n'avez pas accès à cette conversation."],
  ['not_found', 'Conversation introuvable.'],
  ['rate_limited', 'Vous envoyez des messages trop rapidement. Réessayez dans un instant.'],
  ['server', 'Le serveur rencontre un problème. Réessayez plus tard.'],
  ['unknown', 'Une erreur est survenue.'],
];
it.each(cases)('affiche un message utilisateur pour %s sans détail technique', (kind, text) => {
  const error = new ApiError(kind, 'détail interne', 500);
  expect(error.name).toBe('ApiError');
  expect(error.status).toBe(500);
  expect(userMessage(error)).toBe(text);
});

it('traite les erreurs non typées et les valeurs inconnues', () => {
  expect(userMessage(new Error('interne'))).toBe('Une erreur est survenue.');
  expect(userMessage(null)).toBe('Une erreur est survenue.');
});
