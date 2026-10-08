import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useSearch } from '@/hooks/useSearch';
import { useSearchResults } from '@/partage/useSearch';
import { ApiError } from '@/services/ApiError';
import { searchMessages, type SearchResult } from '@/services/searchService';

jest.mock('@/services/searchService', () => ({
  ...jest.requireActual('@/services/searchService'),
  searchMessages: jest.fn(),
}));
const search = jest.mocked(searchMessages);

const result = (id: string): SearchResult => ({
  id,
  conversationId: 'room:33333333-3333-4333-8333-333333333333',
  kind: 'room',
  senderId: 'u',
  content: `texte ${id}`,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
});

beforeEach(() => {
  jest.useFakeTimers();
  search.mockReset();
});
afterEach(() => jest.useRealTimers());

const type = async (hook: { result: { current: ReturnType<typeof useSearch> } }, text: string) => {
  await act(async () => hook.result.current.setQuery(text));
};
const settle = () => act(async () => jest.advanceTimersByTimeAsync(400));

it('reste inactif sans saisie, puis signale un texte trop court sans requête', async () => {
  const hook = await renderHook(() => useSearch());
  expect(hook.result.current.status).toBe('idle');
  await type(hook, ' a ');
  await settle();
  expect(hook.result.current.status).toBe('tooShort');
  expect(search).not.toHaveBeenCalled();
});

it('attend la fin de la frappe, puis affiche les résultats', async () => {
  search.mockResolvedValue({ results: [result('a'), result('b')], nextCursor: 'c1' });
  const hook = await renderHook(() => useSearch());
  await type(hook, 'bo');
  expect(hook.result.current.status).toBe('loading');
  await type(hook, 'bon');
  await act(async () => jest.advanceTimersByTimeAsync(200));
  expect(search).not.toHaveBeenCalled();
  await settle();
  expect(search).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledWith(expect.objectContaining({ q: 'bon', conversationId: undefined }));
  expect(hook.result.current.status).toBe('ready');
  expect(hook.result.current.results.map((r) => r.id)).toEqual(['a', 'b']);
  expect(hook.result.current.hasMore).toBe(true);
});

it('signale un résultat vide, puis revient à « trop court » en effaçant', async () => {
  search.mockResolvedValue({ results: [], nextCursor: null });
  const hook = await renderHook(() => useSearch());
  await type(hook, 'rien');
  await settle();
  expect(hook.result.current.status).toBe('empty');
  expect(hook.result.current.hasMore).toBe(false);
  expect(hook.result.current.results).toEqual([]);
  await type(hook, '');
  expect(hook.result.current.status).toBe('idle');
});

it('limite la recherche à la conversation donnée', async () => {
  search.mockResolvedValue({ results: [result('a')], nextCursor: null });
  const hook = await renderHook(() => useSearch('dm:22222222-2222-4222-8222-222222222222'));
  await type(hook, 'bonjour');
  await settle();
  expect(search).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'dm:22222222-2222-4222-8222-222222222222' }));
});

it("affiche l'erreur et permet de réessayer", async () => {
  search.mockRejectedValueOnce(new ApiError('server', 'HTTP 503', 503));
  search.mockResolvedValueOnce({ results: [result('a')], nextCursor: null });
  const hook = await renderHook(() => useSearch());
  await type(hook, 'bonjour');
  await settle();
  expect(hook.result.current.status).toBe('error');
  expect(hook.result.current.errorMessage).toBe('Le serveur rencontre un problème. Réessayez plus tard.');
  await act(async () => hook.result.current.retry());
  expect(hook.result.current.status).toBe('loading');
  await settle();
  expect(hook.result.current.status).toBe('ready');
  expect(hook.result.current.errorMessage).toBeNull();
});

it("ignore aussi la réponse réussie d'une requête annulée par une saisie plus récente", async () => {
  let resolveFirst: (page: { results: SearchResult[]; nextCursor: null }) => void = () => undefined;
  search.mockImplementationOnce(
    () => new Promise((resolve) => {
      resolveFirst = resolve;
    }),
  );
  search.mockResolvedValueOnce({ results: [result('b')], nextCursor: null });
  const hook = await renderHook(() => useSearch());
  await type(hook, 'premier');
  await settle();
  await type(hook, 'second');
  await settle();
  await act(async () => resolveFirst({ results: [result('périmé')], nextCursor: null }));
  expect(hook.result.current.results.map((r) => r.id)).toEqual(['b']);
});

it('ignore la réponse d\'une requête annulée par une saisie plus récente', async () => {
  let rejectFirst: (error: Error) => void = () => undefined;
  search.mockImplementationOnce(
    () => new Promise((_, reject) => {
      rejectFirst = reject;
    }),
  );
  search.mockResolvedValueOnce({ results: [result('b')], nextCursor: null });
  const hook = await renderHook(() => useSearch());
  await type(hook, 'premier');
  await settle();
  await type(hook, 'second');
  await settle();
  await act(async () => rejectFirst(new Error('aborted')));
  expect(hook.result.current.status).toBe('ready');
  expect(hook.result.current.results.map((r) => r.id)).toEqual(['b']);
});

describe('pagination', () => {
  const start = async () => {
    search.mockResolvedValueOnce({ results: [result('a'), result('b')], nextCursor: 'c1' });
    const hook = await renderHook(() => useSearch());
    await type(hook, 'bonjour');
    await settle();
    return hook;
  };

  it('charge la page suivante sans doublon et s\'arrête à la fin', async () => {
    const hook = await start();
    search.mockResolvedValueOnce({ results: [result('b'), result('c')], nextCursor: null });
    await act(async () => hook.result.current.loadMore());
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'bonjour', cursor: 'c1' }));
    expect(hook.result.current.results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(hook.result.current.hasMore).toBe(false);
    await act(async () => hook.result.current.loadMore());
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('ne lance pas deux chargements simultanés', async () => {
    const hook = await start();
    let resolve: (page: { results: SearchResult[]; nextCursor: null }) => void = () => undefined;
    search.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    await act(async () => {
      void hook.result.current.loadMore();
      void hook.result.current.loadMore();
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(hook.result.current.loadingMore).toBe(true);
    await act(async () => resolve({ results: [result('z')], nextCursor: null }));
    expect(hook.result.current.loadingMore).toBe(false);
  });

  it('garde les résultats affichés quand la page suivante échoue', async () => {
    const hook = await start();
    search.mockRejectedValueOnce(new ApiError('network', 'x'));
    await act(async () => hook.result.current.loadMore());
    expect(hook.result.current.moreError).toBe('Impossible de joindre le serveur. Vérifiez votre connexion.');
    expect(hook.result.current.results).toHaveLength(2);
    search.mockResolvedValueOnce({ results: [result('c')], nextCursor: null });
    await act(async () => hook.result.current.loadMore());
    expect(hook.result.current.moreError).toBeNull();
    expect(hook.result.current.results).toHaveLength(3);
  });

  it('ne fait rien sans page suivante ni résultats', async () => {
    search.mockResolvedValueOnce({ results: [result('a')], nextCursor: null });
    const hook = await renderHook(() => useSearch());
    await act(async () => hook.result.current.loadMore());
    await type(hook, 'bonjour');
    await settle();
    await act(async () => hook.result.current.loadMore());
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('abandonne une page tardive quand la recherche a changé', async () => {
    const hook = await start();
    let resolve: (page: { results: SearchResult[]; nextCursor: null }) => void = () => undefined;
    search.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    await act(async () => void hook.result.current.loadMore());
    search.mockResolvedValueOnce({ results: [result('n')], nextCursor: null });
    await type(hook, 'autre');
    await settle();
    await act(async () => resolve({ results: [result('tard')], nextCursor: null }));
    await waitFor(() => expect(hook.result.current.results.map((r) => r.id)).toEqual(['n']));
  });
});

describe('useSearchResults (hook commun, dépendances injectées)', () => {
  it("utilise le service et le texte d'erreur fournis, avec un délai de frappe choisi, même si les fonctions sont recréées à chaque rendu", async () => {
    const calls: string[] = [];
    const { result } = await renderHook(() =>
      useSearchResults(
        {
          // Fonctions recréées à chaque rendu : la recherche ne doit pas se relancer pour autant.
          search: async ({ q }) => {
            calls.push(q);
            throw new Error('web hors service');
          },
          describeError: (error) => `Web : ${(error as Error).message}`,
          debounceMs: 50,
        },
      ),
    );
    await act(async () => result.current.setQuery('bonjour'));
    await act(async () => jest.advanceTimersByTimeAsync(20));
    expect(calls).toEqual([]);
    await act(async () => jest.advanceTimersByTimeAsync(60));
    expect(calls).toEqual(['bonjour']);
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('Web : web hors service');
    await act(async () => jest.advanceTimersByTimeAsync(500));
    expect(calls).toEqual(['bonjour']);
  });
});
