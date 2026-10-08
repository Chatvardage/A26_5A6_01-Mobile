import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMessages } from '@/hooks/useMessages';
import * as messageService from '@/services/messagesService';
import { lookupPseudos } from '@/services/usersService';
import type { ChatMessage } from '@/types/conversation';

jest.mock('@/services/messagesService', () => {
  const actual = jest.requireActual<typeof import('@/services/messagesService')>('@/services/messagesService');
  return { ...actual, fetchHistory: jest.fn(), sendMessage: jest.fn(), editMessage: jest.fn() };
});
jest.mock('@/services/usersService', () => ({ lookupPseudos: jest.fn() }));
const mockRealtime = {
  getRealtimeState: jest.fn(() => 'ready'),
  joinRoom: jest.fn(() => Promise.resolve()),
  leaveRoom: jest.fn(() => Promise.resolve()),
  onConnectionState: jest.fn(() => jest.fn()),
  onReady: jest.fn(() => jest.fn()),
  subscribe: jest.fn(() => jest.fn()),
};
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ realtime: mockRealtime }) }));

const OLI = '22222222-2222-4222-8222-222222222222';
const ME = '33333333-3333-4333-8333-333333333333';
const TARGET = '44444444-4444-4444-8444-444444444444';
const fetchHistory = messageService.fetchHistory as jest.Mock;

const msg = (id: string, minutes: number): ChatMessage => ({
  id,
  senderId: OLI,
  senderName: 'oli',
  content: `texte ${id}`,
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0) - minutes * 60_000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 1, 12, 0) - minutes * 60_000).toISOString(),
});
const page = (prefix: string, from: number, count: number) =>
  Array.from({ length: count }, (_, i) => msg(`${prefix}${from + i}`, from + i));

beforeEach(() => {
  fetchHistory.mockReset();
  (lookupPseudos as jest.Mock).mockReset().mockResolvedValue({});
});

const setup = async (recent: ChatMessage[], id = `dm:${OLI}`) => {
  fetchHistory.mockResolvedValueOnce(recent);
  const hook = await renderHook(({ conversation }: { conversation: string }) => useMessages(conversation, ME), {
    initialProps: { conversation: id },
  });
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
/** Appelle `jumpTo` dans `act` : il met à jour l'état de la liste pendant le chargement des pages. */
const jump = async (hook: Hook, messageId: string) => {
  let found = false;
  await act(async () => {
    found = await hook.result.current.jumpTo(messageId);
  });
  return found;
};
const ids = (hook: Hook) => hook.result.current.messages.map((m) => m.id);

describe('useMessages.jumpTo', () => {
  it('retrouve tout de suite un message déjà chargé, sans appel supplémentaire', async () => {
    const hook = await setup([msg('a', 1), msg('b', 2)]);
    await expect(hook.result.current.jumpTo('b')).resolves.toBe(true);
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it("charge les pages plus anciennes, sans trou ni doublon, jusqu'au message", async () => {
    const hook = await setup(page('r', 0, 50));
    fetchHistory.mockResolvedValueOnce(page('p', 50, 50));
    fetchHistory.mockResolvedValueOnce([...page('q', 100, 49), msg(TARGET, 149), msg('r49', 49)]);
    expect(await jump(hook, TARGET)).toBe(true);
    expect(fetchHistory).toHaveBeenNthCalledWith(2, `dm:${OLI}`, 50, 'r49');
    expect(fetchHistory).toHaveBeenNthCalledWith(3, `dm:${OLI}`, 50, 'p99');
    expect(ids(hook)).toHaveLength(new Set(ids(hook)).size);
    expect(ids(hook)[0]).toBe('r0');
    expect(ids(hook).at(-1)).toBe(TARGET);
  });

  it("s'arrête à la fin de l'historique : message introuvable, sans nouvel appel ensuite", async () => {
    const hook = await setup(page('r', 0, 50));
    fetchHistory.mockResolvedValueOnce(page('p', 50, 3));
    expect(await jump(hook, TARGET)).toBe(false);
    await waitFor(() => expect(hook.result.current.hasOlder).toBe(false));
    expect(await jump(hook, TARGET)).toBe(false);
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('abandonne après 20 pages', async () => {
    const hook = await setup(page('r', 0, 50));
    fetchHistory.mockImplementation(async (_id: string, _limit: number, cursor: string) => page(`c${cursor}-`, 1, 50));
    expect(await jump(hook, TARGET)).toBe(false);
    expect(fetchHistory).toHaveBeenCalledTimes(21);
  });

  it("retourne faux quand le chargement d'une page échoue", async () => {
    const hook = await setup(page('r', 0, 50));
    fetchHistory.mockRejectedValueOnce(new Error('réseau'));
    expect(await jump(hook, TARGET)).toBe(false);
  });

  it("retourne faux sans historique chargé ou avant la fin du chargement", async () => {
    fetchHistory.mockReturnValueOnce(new Promise(() => undefined));
    const loading = await renderHook(() => useMessages(`dm:${OLI}`, ME));
    expect(await jump(loading, TARGET)).toBe(false);
    const empty = await setup([], `room:${OLI}`);
    expect(await jump(empty, TARGET)).toBe(false);
  });

  it('abandonne si la conversation change pendant le chargement', async () => {
    const hook = await setup(page('r', 0, 50));
    let resolve: (messages: ChatMessage[]) => void = () => undefined;
    fetchHistory.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    let result: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      result = hook.result.current.jumpTo(TARGET);
    });
    fetchHistory.mockResolvedValueOnce([msg('autre', 1)]);
    await hook.rerender({ conversation: `room:${OLI}` });
    await act(async () => resolve(page('p', 50, 50)));
    await expect(result).resolves.toBe(false);
  });

  it('attend un loadOlder en cours au lieu de redemander la même page', async () => {
    const hook = await setup(page('r', 0, 50));
    let resolve: (messages: ChatMessage[]) => void = () => undefined;
    fetchHistory.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    let jumped: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      void hook.result.current.loadOlder();
    });
    await act(async () => {
      jumped = hook.result.current.jumpTo(TARGET);
    });
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    await act(async () => resolve([...page('p', 50, 49), msg(TARGET, 99)]));
    await expect(jumped).resolves.toBe(true);
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    expect(ids(hook)).toHaveLength(new Set(ids(hook)).size);
  });

  it('ignore loadOlder tant que jumpTo charge une page, puis le réautorise', async () => {
    const hook = await setup(page('r', 0, 50));
    let resolve: (messages: ChatMessage[]) => void = () => undefined;
    fetchHistory.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    let jumped: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      jumped = hook.result.current.jumpTo(TARGET);
    });
    await act(async () => {
      await hook.result.current.loadOlder();
    });
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    await act(async () => resolve([...page('p', 50, 49), msg(TARGET, 99)]));
    await expect(jumped).resolves.toBe(true);
    fetchHistory.mockResolvedValueOnce([msg('encore', 70)]);
    await act(async () => {
      await hook.result.current.loadOlder();
    });
    expect(fetchHistory).toHaveBeenCalledTimes(3);
  });

  it('abandonne si la conversation change pendant l\'attente d\'un loadOlder', async () => {
    const hook = await setup(page('r', 0, 50));
    let resolve: (messages: ChatMessage[]) => void = () => undefined;
    fetchHistory.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    let jumped: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      void hook.result.current.loadOlder();
    });
    await act(async () => {
      jumped = hook.result.current.jumpTo(TARGET);
    });
    fetchHistory.mockResolvedValueOnce([msg('autre', 1)]);
    await hook.rerender({ conversation: `room:${OLI}` });
    await act(async () => resolve(page('p', 50, 50)));
    await expect(jumped).resolves.toBe(false);
  });

  it('mémorise les pseudos déjà connus des pages anciennes', async () => {
    const hook = await setup(page('r', 0, 50));
    fetchHistory.mockResolvedValueOnce([msg(TARGET, 60), { ...msg('sans-nom', 61), senderName: undefined }]);
    await jump(hook, TARGET);
    expect(ids(hook)).toContain(TARGET);
  });
});
