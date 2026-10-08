import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

import { getPermission, setAppBadge } from '@/adapters/notifications.adapter';
import * as http from '@/services/httpClient';
import { fetchUnreadCounts, markConversationRead } from '@/services/unreadService';
import { UnreadProvider, useUnread } from '@/unread/UnreadContext';

jest.mock('@/services/httpClient');
jest.mock('@/adapters/notifications.adapter');
const mockRealtime = { onReady: jest.fn() };
const { onReady } = mockRealtime;
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ realtime: mockRealtime }) }));
const apiFetch = http.apiFetch as jest.Mock;

const DM = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';

describe('unreadService', () => {
  beforeEach(() => apiFetch.mockReset());

  it('ne garde que les compteurs valides et positifs', async () => {
    apiFetch.mockResolvedValue({
      counts: { [`dm:${DM}`]: 2, [`room:${ROOM}`]: 3.7, 'dm:invalide': 4, [`dm:${ROOM}`]: 0, [`room:${DM}`]: 'beaucoup' },
    });
    expect(await fetchUnreadCounts()).toEqual({ [`dm:${DM}`]: 2, [`room:${ROOM}`]: 3 });
    expect(apiFetch).toHaveBeenCalledWith('/api/messages/unread');
  });

  it('tolère une réponse sans compteurs', async () => {
    apiFetch.mockResolvedValue({});
    expect(await fetchUnreadCounts()).toEqual({});
    apiFetch.mockResolvedValue(null);
    expect(await fetchUnreadCounts()).toEqual({});
  });

  it('marque un message privé ou un salon comme lu, sans accepter un identifiant invalide', async () => {
    apiFetch.mockResolvedValue(undefined);
    await markConversationRead(`dm:${DM}`);
    expect(apiFetch).toHaveBeenLastCalledWith(`/api/messages/conversations/${DM}/read`, { method: 'PUT' });
    await markConversationRead(`room:${ROOM}`);
    expect(apiFetch).toHaveBeenLastCalledWith(`/api/messages/rooms/${ROOM}/read`, { method: 'PUT' });
    apiFetch.mockClear();
    await expect(markConversationRead('room:nope')).rejects.toMatchObject({ kind: 'not_found' });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('UnreadProvider', () => {
  let ready: () => void;
  let appStateListener: (state: string) => void;
  const remove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ counts: { [`dm:${DM}`]: 2, [`room:${ROOM}`]: 1 } });
    jest.mocked(getPermission).mockResolvedValue('granted');
    jest.mocked(onReady).mockImplementation((handler) => {
      ready = handler;
      return jest.fn();
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: typeof appStateListener) => {
      appStateListener = listener;
      return { remove };
    }) as never);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => <UnreadProvider>{children}</UnreadProvider>;

  it('charge les compteurs du serveur et calcule les totaux par type', async () => {
    const hook = await renderHook(() => useUnread(), { wrapper });
    await waitFor(() => expect(hook.result.current.dmTotal).toBe(2));
    expect(hook.result.current.roomTotal).toBe(1);
    await waitFor(() => expect(setAppBadge).toHaveBeenCalledWith(3));
  });

  it('incrémente et efface localement un compteur', async () => {
    const hook = await renderHook(() => useUnread(), { wrapper });
    await waitFor(() => expect(hook.result.current.dmTotal).toBe(2));
    await act(async () => hook.result.current.increment(`dm:${DM}`));
    await act(async () => hook.result.current.increment('dm:autre'));
    expect(hook.result.current.dmTotal).toBe(4);
    await act(async () => hook.result.current.clear(`dm:${DM}`));
    expect(hook.result.current.counts[`dm:${DM}`]).toBeUndefined();
    expect(hook.result.current.dmTotal).toBe(1);
    const before = hook.result.current.counts;
    await act(async () => hook.result.current.clear('room:inconnu'));
    expect(hook.result.current.counts).toBe(before);
  });

  it('recharge à la reconnexion et au retour au premier plan, et garde les compteurs en cas de panne', async () => {
    const hook = await renderHook(() => useUnread(), { wrapper });
    await waitFor(() => expect(hook.result.current.dmTotal).toBe(2));
    apiFetch.mockResolvedValue({ counts: { [`dm:${DM}`]: 5 } });
    await act(async () => ready());
    await waitFor(() => expect(hook.result.current.dmTotal).toBe(5));
    apiFetch.mockRejectedValue(new Error('réseau'));
    await act(async () => appStateListener('active'));
    await act(async () => appStateListener('background'));
    expect(hook.result.current.dmTotal).toBe(5);
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it("n'applique pas le badge de l'icône sans permission, et se désabonne au démontage", async () => {
    jest.mocked(getPermission).mockResolvedValue('denied');
    const hook = await renderHook(() => useUnread(), { wrapper });
    await waitFor(() => expect(hook.result.current.dmTotal).toBe(2));
    expect(setAppBadge).not.toHaveBeenCalled();
    await hook.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it("n'échoue pas si le canal temps réel n'est pas configuré", async () => {
    jest.mocked(onReady).mockImplementation(() => {
      throw new Error('Session absente');
    });
    const hook = await renderHook(() => useUnread(), { wrapper });
    await waitFor(() => expect(hook.result.current.dmTotal).toBe(2));
  });

  it('fournit des valeurs vides hors provider', async () => {
    const hook = await renderHook(() => useUnread());
    expect(hook.result.current.counts).toEqual({});
    expect(hook.result.current.dmTotal).toBe(0);
    await hook.result.current.refresh();
    hook.result.current.increment('dm:a');
    hook.result.current.clear('dm:a');
    function Probe() {
      return <Text>{useUnread().roomTotal}</Text>;
    }
    await render(<Probe />);
    expect(screen.getByText('0')).toBeTruthy();
  });
});
