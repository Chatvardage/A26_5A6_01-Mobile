import { ApiError } from '@/services/ApiError';
import * as http from '@/services/httpClient';
import { fetchDmSuggestions, lookupDisplayNames, searchUsers } from '@/services/usersService';

jest.mock('@/services/httpClient');
const apiFetch = http.apiFetch as jest.Mock;

const ME = '00000000-0000-4000-8000-000000000000';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const S1 = '44444444-4444-4444-8444-444444444444';
const S2 = '55555555-5555-4555-8555-555555555555';

/** Simule le Gateway : la clé est le chemin sans paramètres de requête. */
function mockApi(routes: Record<string, unknown>) {
  apiFetch.mockImplementation(async (path: string) => {
    const value = routes[path.split('?')[0]];
    if (value === undefined) throw new Error(`route non simulée: ${path}`);
    if (value instanceof Error) throw value;
    return value;
  });
}

const PSEUDOS: Record<string, string> = { [ME]: 'moi', [A]: 'Zoé', [B]: 'alice', [C]: 'Bruno' };
const lookupResponse = (path: string) =>
  decodeURIComponent(path.split('ids=')[1])
    .split(',')
    .filter((id) => PSEUDOS[id])
    .map((id) => ({ id, pseudo: PSEUDOS[id] }));

beforeEach(() => apiFetch.mockReset());

describe('searchUsers', () => {
  it('cherche par début de pseudo, encode le texte, borne sa longueur et exclut l’appelant', async () => {
    mockApi({ '/api/users/search': [{ id: ME, pseudo: 'moi' }, { id: A, pseudo: 'moa', extra: 'ignoré' }] });
    const result = await searchUsers('  mo&i très long pseudo  ', ME);
    expect(apiFetch).toHaveBeenCalledWith(`/api/users/search?q=${encodeURIComponent('mo&i très long pseud')}&limit=20`);
    expect(result).toEqual([{ id: A, pseudo: 'moa' }]);
  });

  it('n’appelle pas l’API pour un texte vide', async () => {
    await expect(searchUsers('   ', ME)).resolves.toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('propage une erreur typée', async () => {
    mockApi({ '/api/users/search': new ApiError('unauthorized', '401', 401) });
    await expect(searchUsers('al', ME)).rejects.toMatchObject({ kind: 'unauthorized' });
  });
});

describe('fetchDmSuggestions', () => {
  it('réunit interlocuteurs et membres des serveurs, sans soi-même ni doublon, triés par pseudo', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/messages/conversations') return [{ otherUserId: A }];
      if (path === '/api/servers') return [{ id: S1 }, { id: S2 }];
      if (path === `/api/servers/${S1}/members?limite=20`) return { membres: [{ utilisateurId: ME }, { utilisateurId: B }] };
      if (path === `/api/servers/${S2}/members?limite=20`) throw new ApiError('forbidden', '403', 403);
      if (path.startsWith('/api/users/lookup')) return lookupResponse(path);
      throw new Error(`route non simulée: ${path}`);
    });
    await expect(fetchDmSuggestions(ME)).resolves.toEqual({
      users: [{ id: B, pseudo: 'alice' }, { id: A, pseudo: 'Zoé' }],
      partnerIds: [A],
    });
  });

  it('écarte un utilisateur dont le pseudo est introuvable', async () => {
    mockApi({
      '/api/messages/conversations': [{ otherUserId: C }, { otherUserId: 'inconnu' }],
      '/api/servers': [],
      '/api/users/lookup': [{ id: C, pseudo: 'Bruno' }],
    });
    const result = await fetchDmSuggestions(ME);
    expect(result.users).toEqual([{ id: C, pseudo: 'Bruno' }]);
    expect(result.partnerIds).toEqual([C, 'inconnu']);
  });

  it('garde une source quand l’autre échoue', async () => {
    mockApi({
      '/api/messages/conversations': new ApiError('server', '503', 503),
      '/api/servers': [{ id: S1 }],
      [`/api/servers/${S1}/members`]: { membres: [{ utilisateurId: B }] },
      '/api/users/lookup': [{ id: B, pseudo: 'alice' }],
    });
    await expect(fetchDmSuggestions(ME)).resolves.toEqual({ users: [{ id: B, pseudo: 'alice' }], partnerIds: [] });

    mockApi({
      '/api/messages/conversations': [{ otherUserId: A }],
      '/api/servers': new ApiError('network', 'offline'),
      '/api/users/lookup': [{ id: A, pseudo: 'Zoé' }],
    });
    await expect(fetchDmSuggestions(ME)).resolves.toEqual({ users: [{ id: A, pseudo: 'Zoé' }], partnerIds: [A] });
  });

  it('échoue si aucune source n’est lisible ou si les pseudos ne peuvent être résolus', async () => {
    mockApi({
      '/api/messages/conversations': new ApiError('unauthorized', '401', 401),
      '/api/servers': new ApiError('network', 'offline'),
    });
    await expect(fetchDmSuggestions(ME)).rejects.toMatchObject({ kind: 'unauthorized' });

    mockApi({
      '/api/messages/conversations': [{ otherUserId: A }],
      '/api/servers': [],
      '/api/users/lookup': new ApiError('server', '500', 500),
    });
    await expect(fetchDmSuggestions(ME)).rejects.toMatchObject({ kind: 'server' });
  });

  it('renvoie une liste vide sans appeler la résolution des pseudos', async () => {
    mockApi({ '/api/messages/conversations': [], '/api/servers': [] });
    await expect(fetchDmSuggestions(ME)).resolves.toEqual({ users: [], partnerIds: [] });
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});

describe('lookupDisplayNames', () => {
  const profiles = (path: string) =>
    decodeURIComponent(path.split('ids=')[1]).split(',').map((id) => ({ idUtilisateur: id, alias: id === A ? 'Zozo' : null, avatar: null, actif: true }));

  it('préfère l’alias au pseudo, sinon garde le pseudo', async () => {
    apiFetch.mockImplementation(async (path: string) => (path.startsWith('/api/users/lookup') ? lookupResponse(path) : profiles(path)));
    expect(await lookupDisplayNames([A, B])).toEqual({ [A]: 'Zozo', [B]: 'alice' });
  });

  it('garde les pseudos si les profils publics sont indisponibles, et propage une panne des pseudos', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/users/lookup')) return lookupResponse(path);
      throw new ApiError('network', 'x');
    });
    expect(await lookupDisplayNames([A])).toEqual({ [A]: 'Zoé' });
    apiFetch.mockRejectedValue(new ApiError('network', 'x'));
    await expect(lookupDisplayNames([A])).rejects.toMatchObject({ kind: 'network' });
  });
});
