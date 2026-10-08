import { act, renderHook, waitFor } from '@testing-library/react-native';

import { SEARCH_DEBOUNCE_MS, useNewDirectMessage } from '@/hooks/useNewDirectMessage';
import { ApiError } from '@/services/ApiError';
import { fetchDmSuggestions, searchUsers } from '@/services/usersService';

jest.mock('@/services/usersService', () => ({
  ...jest.requireActual('@/services/usersService'),
  fetchDmSuggestions: jest.fn(),
  searchUsers: jest.fn(),
}));

const ME = 'me';
const alice = { id: 'alice-id', pseudo: 'alice' };
const bob = { id: 'bob-id', pseudo: 'bob' };
const suggestions = jest.mocked(fetchDmSuggestions);
const search = jest.mocked(searchUsers);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.useFakeTimers();
  suggestions.mockReset().mockResolvedValue({ users: [alice, bob], partnerIds: [alice.id] });
  search.mockReset().mockResolvedValue([bob]);
});
afterEach(() => jest.useRealTimers());

describe('useNewDirectMessage', () => {
  it('charge les suggestions et repère les conversations existantes', async () => {
    const { result } = await renderHook(() => useNewDirectMessage(ME));
    await waitFor(() => expect(result.current.suggestions).toEqual({ status: 'ready', data: [alice, bob] }));
    expect(suggestions).toHaveBeenCalledWith(ME);
    expect(result.current.searching).toBe(false);
    expect(result.current.search).toEqual({ status: 'idle' });
    expect(result.current.hasConversationWith(alice.id)).toBe(true);
    expect(result.current.hasConversationWith(bob.id)).toBe(false);
  });

  it('expose une liste vide et une erreur réessayable des suggestions', async () => {
    suggestions.mockResolvedValueOnce({ users: [], partnerIds: [] });
    const first = await renderHook(() => useNewDirectMessage(ME));
    await waitFor(() => expect(first.result.current.suggestions.status).toBe('empty'));

    suggestions.mockRejectedValueOnce(new ApiError('network', 'offline'));
    const { result } = await renderHook(() => useNewDirectMessage(ME));
    await waitFor(() => expect(result.current.suggestions).toEqual({
      status: 'error', message: 'Impossible de joindre le serveur. Vérifiez votre connexion.',
    }));
    expect(result.current.hasConversationWith(alice.id)).toBe(false);
    await act(async () => result.current.retrySuggestions());
    await waitFor(() => expect(result.current.suggestions.status).toBe('ready'));
  });

  it('attend la fin de la frappe, ne lance qu’une recherche et borne le texte', async () => {
    const { result } = await renderHook(() => useNewDirectMessage(ME));
    await act(async () => result.current.setQuery('b'));
    await act(async () => result.current.setQuery('  bo  '));
    expect(result.current.searching).toBe(true);
    expect(result.current.search).toEqual({ status: 'loading' });
    expect(search).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('bo', ME);
    await waitFor(() => expect(result.current.search).toEqual({ status: 'ready', users: [bob] }));

    await act(async () => result.current.setQuery('x'.repeat(30)));
    expect(result.current.query).toHaveLength(20);
    await act(async () => result.current.setQuery('   '));
    expect(result.current.searching).toBe(false);
    expect(result.current.search).toEqual({ status: 'idle' });
  });

  it('ignore les réponses et erreurs arrivées après un nouveau texte', async () => {
    const old = deferred<typeof alice[]>();
    const failed = deferred<typeof alice[]>();
    search.mockReturnValueOnce(old.promise).mockReturnValueOnce(failed.promise).mockResolvedValueOnce([bob]);
    const { result } = await renderHook(() => useNewDirectMessage(ME));
    await act(async () => result.current.setQuery('al'));
    await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    await act(async () => result.current.setQuery('ali'));
    await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    await act(async () => result.current.setQuery('bo'));
    await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    await waitFor(() => expect(result.current.search).toEqual({ status: 'ready', users: [bob] }));
    await act(async () => {
      old.resolve([alice]);
      failed.reject(new ApiError('network', 'tardif'));
    });
    expect(result.current.search).toEqual({ status: 'ready', users: [bob] });
  });

  it('affiche l’erreur de recherche puis réessaie le même texte', async () => {
    search.mockRejectedValueOnce(new ApiError('rate_limited', '429', 429));
    const { result } = await renderHook(() => useNewDirectMessage(ME));
    await act(async () => result.current.setQuery('al'));
    await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    await waitFor(() => expect(result.current.search.status).toBe('error'));
    await act(async () => result.current.retrySearch());
    expect(result.current.search).toEqual({ status: 'loading' });
    await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    await waitFor(() => expect(result.current.search).toEqual({ status: 'ready', users: [bob] }));
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('annule la recherche en attente au démontage', async () => {
    const { result, unmount } = await renderHook(() => useNewDirectMessage(ME));
    await act(async () => result.current.setQuery('al'));
    await unmount();
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(search).not.toHaveBeenCalled();
  });
});
