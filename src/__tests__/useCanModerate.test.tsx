import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useCanModerate } from '@/hooks/useCanModerate';
import { fetchCanModerate } from '@/services/serversService';

jest.mock('@/services/serversService', () => ({ fetchCanModerate: jest.fn() }));
const mockHandlers = new Map<string, (payload: unknown) => void>();
const mockRealtime = {
  subscribe: jest.fn((event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
    return () => mockHandlers.delete(event);
  }),
};
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ realtime: mockRealtime }) }));

const fetchRole = jest.mocked(fetchCanModerate);
const ROOM = 'room:77777777-7777-4777-8777-777777777777';

beforeEach(() => {
  mockHandlers.clear();
  fetchRole.mockReset();
});

describe('useCanModerate', () => {
  it('est faux pendant le chargement, puis vrai pour un modérateur', async () => {
    fetchRole.mockResolvedValue(true);
    const { result } = await renderHook(() => useCanModerate(ROOM));
    await waitFor(() => expect(result.current).toBe(true));
    expect(fetchRole).toHaveBeenCalledWith(ROOM);
  });

  it('est faux pour un membre ordinaire et en cas d’échec', async () => {
    fetchRole.mockResolvedValueOnce(false);
    const first = await renderHook(() => useCanModerate(ROOM));
    await waitFor(() => expect(fetchRole).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBe(false);
    fetchRole.mockRejectedValueOnce(new Error('503'));
    const second = await renderHook(() => useCanModerate(ROOM));
    await waitFor(() => expect(fetchRole).toHaveBeenCalledTimes(2));
    expect(second.result.current).toBe(false);
  });

  it('relit le rôle quand Room-Service signale un changement de serveur', async () => {
    fetchRole.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { result } = await renderHook(() => useCanModerate(ROOM));
    await waitFor(() => expect(result.current).toBe(true));
    await act(async () => mockHandlers.get('serveur.change')!({ serveurId: 's', raison: 'membres' }));
    await waitFor(() => expect(result.current).toBe(false));
    expect(fetchRole).toHaveBeenCalledTimes(2);
  });
});
