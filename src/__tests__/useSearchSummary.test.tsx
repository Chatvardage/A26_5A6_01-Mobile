import { act, renderHook } from '@testing-library/react-native';
import { useSearchSummary } from '@/hooks/useSearchSummary';
import { ApiError } from '@/services/ApiError';
import { searchSummary, type SearchSummary } from '@/services/searchSummaryService';
jest.mock('@/services/searchSummaryService', () => ({ searchSummary: jest.fn() }));
const search = jest.mocked(searchSummary);
const data: SearchSummary = { directMessages: [{ conversationId: 'dm:alice', count: 100 }], servers: [] };
beforeEach(() => { jest.useFakeTimers(); search.mockReset(); });
afterEach(() => jest.useRealTimers());
const settle = () => act(async () => jest.advanceTimersByTimeAsync(400));

it('ne cherche pas sans texte valide, attend la frappe puis affiche les totaux', async () => {
  search.mockResolvedValue(data);
  const hook = await renderHook(() => useSearchSummary());
  expect(hook.result.current.status).toBe('idle');
  await act(async () => hook.result.current.setQuery('a'));
  expect(hook.result.current.status).toBe('tooShort');
  await settle();
  expect(search).not.toHaveBeenCalled();
  await act(async () => hook.result.current.setQuery(' bonjour '));
  expect(hook.result.current.status).toBe('loading');
  await act(async () => jest.advanceTimersByTimeAsync(200));
  expect(search).not.toHaveBeenCalled();
  await settle();
  expect(search).toHaveBeenCalledWith('bonjour', expect.any(AbortSignal));
  expect(hook.result.current.data).toEqual(data);
  expect(hook.result.current.status).toBe('ready');
});

it.each(['success', 'error'])('ignore la réponse %s d’un terme remplacé et annule la requête', async outcome => {
  let resolve!: (value: SearchSummary) => void;
  let reject!: (error: Error) => void;
  search.mockImplementationOnce(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
  search.mockResolvedValueOnce({ directMessages: [], servers: [] });
  const hook = await renderHook(() => useSearchSummary('premier'));
  await settle();
  const signal = search.mock.calls[0][1];
  await act(async () => hook.result.current.setQuery('second'));
  expect(signal?.aborted).toBe(true);
  expect(hook.result.current.data).toBeNull();
  await settle();
  await act(async () => { if (outcome === 'success') resolve(data); else reject(new Error('périmée')); });
  expect(hook.result.current.status).toBe('empty');
  expect(hook.result.current.error).toBeNull();
});

it.each(['network', 'unauthorized', 'forbidden'] as const)('affiche l’erreur %s et autorise un nouvel essai', async kind => {
  search.mockRejectedValueOnce(new ApiError(kind, 'échec')).mockResolvedValueOnce(data);
  const hook = await renderHook(() => useSearchSummary('bonjour'));
  await settle();
  expect(hook.result.current.status).toBe('error');
  expect(hook.result.current.error).toBeTruthy();
  await act(async () => hook.result.current.retry());
  expect(hook.result.current.status).toBe('loading');
  await settle();
  expect(hook.result.current.status).toBe('ready');
});
