import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useDiscoverServers } from '@/hooks/useDiscoverServers';
import { ApiError } from '@/services/ApiError';
import { discoverServers, type DiscoverableServer } from '@/services/rooms.service';

jest.mock('@/services/rooms.service', () => ({ discoverServers: jest.fn() }));

const server = (id: string) => ({ id, nom: id }) as unknown as DiscoverableServer;
const pageOf = (ids: string[], suivant: number | null) => ({ serveurs: ids.map(server), suivant, total: ids.length });
const ids = (servers: DiscoverableServer[]) => servers.map(s => s.id);

beforeEach(() => jest.clearAllMocks());

it('ajoute la page suivante sans doublon et ne charge rien de plus sans page restante', async () => {
  jest.mocked(discoverServers).mockResolvedValueOnce(pageOf(['a', 'b'], 2)).mockResolvedValueOnce(pageOf(['b', 'c'], null));
  const hook = await renderHook(() => useDiscoverServers(''));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  await act(async () => hook.result.current.loadMore());
  expect(discoverServers).toHaveBeenLastCalledWith('', 2);
  expect(ids(hook.result.current.servers)).toEqual(['a', 'b', 'c']);
  await act(async () => hook.result.current.loadMore());
  expect(discoverServers).toHaveBeenCalledTimes(2);
});

it('ne lance pas deux pages à la fois et signale l’échec de la page suivante', async () => {
  let fail!: (error: Error) => void;
  jest.mocked(discoverServers)
    .mockResolvedValueOnce(pageOf(['a'], 1))
    .mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
  const hook = await renderHook(() => useDiscoverServers(''));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  await act(async () => { void hook.result.current.loadMore(); });
  expect(hook.result.current.loadingMore).toBe(true);
  await act(async () => hook.result.current.loadMore());
  expect(discoverServers).toHaveBeenCalledTimes(2);
  await act(async () => fail(new ApiError('network', 'x')));
  expect(hook.result.current.loadingMore).toBe(false);
  expect(hook.result.current.moreError).toBeTruthy();
  expect(ids(hook.result.current.servers)).toEqual(['a']);
});

it('ignore une page suivante arrivée après un rechargement', async () => {
  let finish!: (value: ReturnType<typeof pageOf>) => void;
  let fail!: (error: Error) => void;
  jest.mocked(discoverServers)
    .mockResolvedValueOnce(pageOf(['a'], 1))
    .mockImplementationOnce(() => new Promise(done => { finish = done; }))
    .mockResolvedValueOnce(pageOf(['b'], 1))
    .mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }))
    .mockResolvedValueOnce(pageOf(['c'], null));
  const hook = await renderHook(() => useDiscoverServers(''));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  await act(async () => { void hook.result.current.loadMore(); });
  await act(async () => hook.result.current.reload());
  await act(async () => finish(pageOf(['tardif'], null)));
  expect(ids(hook.result.current.servers)).toEqual(['b']);
  await act(async () => { void hook.result.current.loadMore(); });
  await act(async () => hook.result.current.reload());
  await act(async () => fail(new ApiError('network', 'x')));
  expect(ids(hook.result.current.servers)).toEqual(['c']);
  expect(hook.result.current.moreError).toBeNull();
});

it('affiche une erreur de premier chargement', async () => {
  jest.mocked(discoverServers).mockRejectedValueOnce(new ApiError('network', 'x'));
  const hook = await renderHook(() => useDiscoverServers(''));
  await waitFor(() => expect(hook.result.current.status).toBe('error'));
  expect(hook.result.current.servers).toEqual([]);
  expect(hook.result.current.message).toBeTruthy();
});

it('ignore la réponse ou l’échec d’un ancien filtre', async () => {
  jest.useFakeTimers();
  let old!: (value: ReturnType<typeof pageOf>) => void;
  let oldFailure!: (error: Error) => void;
  jest.mocked(discoverServers)
    .mockImplementationOnce(() => new Promise(done => { old = done; }))
    .mockImplementationOnce(() => new Promise((_, reject) => { oldFailure = reject; }))
    .mockResolvedValueOnce(pageOf(['nouveau'], null));
  const hook = await renderHook(({ query }: { query: string }) => useDiscoverServers(query), { initialProps: { query: '' } });
  await hook.rerender({ query: 'équ' });
  await act(async () => { jest.advanceTimersByTime(300); });
  await hook.rerender({ query: 'équipe' });
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(discoverServers).toHaveBeenLastCalledWith('équipe');
  await act(async () => { old(pageOf(['ancien'], null)); oldFailure(new ApiError('network', 'x')); });
  expect(hook.result.current.status).toBe('ready');
  expect(ids(hook.result.current.servers)).toEqual(['nouveau']);
  jest.useRealTimers();
});
