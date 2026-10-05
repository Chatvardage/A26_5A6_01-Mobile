import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useLoadable } from '@/hooks/useLoadable';
import { ApiError } from '@/services/ApiError';

const isEmpty = (list: string[]) => list.length === 0;

describe('useLoadable', () => {
  it('passe de loading à ready', async () => {
    let resolve!: (value: string[]) => void;
    const load = jest.fn(() => new Promise<string[]>((r) => (resolve = r)));
    const { result } = await renderHook(() => useLoadable(load, isEmpty));
    expect(result.current.state.status).toBe('loading');
    await act(async () => resolve(['a']));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: ['a'] }));
  });

  it('signale un résultat vide', async () => {
    const load = jest.fn().mockResolvedValue([]);
    const { result } = await renderHook(() => useLoadable(load, isEmpty));
    await waitFor(() => expect(result.current.state.status).toBe('empty'));
  });

  it('signale une erreur lisible puis permet de réessayer', async () => {
    const load = jest.fn().mockRejectedValueOnce(new ApiError('network', 'x')).mockResolvedValueOnce(['a']);
    const { result } = await renderHook(() => useLoadable(load, isEmpty));
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'error', message: expect.stringMatching(/joindre le serveur/) }));
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.state.status).toBe('ready');
  });

  it("garde les données affichées si un rafraîchissement échoue", async () => {
    const load = jest.fn().mockResolvedValueOnce(['a']).mockRejectedValueOnce(new ApiError('network', 'x'));
    const { result } = await renderHook(() => useLoadable(load, isEmpty));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state).toEqual({ status: 'ready', data: ['a'] });
    expect(result.current.refreshing).toBe(false);
  });

  it('ignore la réponse périmée quand le chargeur change', async () => {
    let resolveOld!: (value: string[]) => void;
    const oldLoad = () => new Promise<string[]>((r) => (resolveOld = r));
    const newLoad = () => Promise.resolve(['nouveau']);
    type Props = { load: () => Promise<string[]> };
    const { result, rerender } = await renderHook(({ load }: Props) => useLoadable(load, isEmpty), {
      initialProps: { load: oldLoad } as Props,
    });
    await rerender({ load: newLoad });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: ['nouveau'] }));
    await act(async () => resolveOld(['ancien']));
    expect(result.current.state).toEqual({ status: 'ready', data: ['nouveau'] });
  });

    it('ignore également une erreur périmée quand le chargeur change', async () => {
      let rejectOld!: (error: unknown) => void;
      const oldLoad = () => new Promise<string[]>((_resolve, reject) => { rejectOld = reject; });
      const newLoad = () => Promise.resolve(['nouveau']);
      const { result, rerender } = await renderHook(({ load }: { load: () => Promise<string[]> }) => useLoadable(load, isEmpty), {
        initialProps: { load: oldLoad },
      });
      await rerender({ load: newLoad });
      await act(async () => rejectOld(new ApiError('network', 'obsolete')));
      expect(result.current.state).toEqual({ status: 'ready', data: ['nouveau'] });
      expect(result.current.refreshing).toBe(false);
    });
});
