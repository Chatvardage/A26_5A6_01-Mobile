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
  it('retrouve un message deja charge sans requete supplementaire', async () => {
    const hook = await setup([msg('a',1)]);
    expect(await jump(hook,'a')).toBe(true);
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });
  it('remplace les messages recents par une seule page depuis la cible', async () => {
    const hook = await setup(page('r',0,50));
    fetchHistory.mockResolvedValueOnce([msg(TARGET,2000),...page('p',2001,49)]);
    expect(await jump(hook,TARGET)).toBe(true);
    expect(fetchHistory).toHaveBeenLastCalledWith(`dm:${OLI}`,50,undefined,{around:TARGET});
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    expect(ids(hook)[0]).toBe(TARGET);
    expect(ids(hook)).not.toContain('r0');
    expect(hook.result.current.hasOlder).toBe(true);
    expect(hook.result.current.hasNewer).toBe(true);
    expect(hook.result.current.jumping).toBe(false);
    fetchHistory.mockResolvedValueOnce([msg('older',2050)]);
    await act(async () => hook.result.current.loadOlder());
    expect(fetchHistory).toHaveBeenLastCalledWith(`dm:${OLI}`,50,'p2049');
    expect(hook.result.current.hasOlder).toBe(false);
  });
  it('conserve la liste et termine le chargement si la cible est absente ou le reseau refuse', async () => {
    const hook = await setup([msg('recent',0)]);
    fetchHistory.mockResolvedValueOnce([]);
    expect(await jump(hook,TARGET)).toBe(false);
    expect(ids(hook)).toEqual(['recent']);
    fetchHistory.mockRejectedValueOnce(new Error('network'));
    expect(await jump(hook,TARGET)).toBe(false);
    expect(hook.result.current.jumping).toBe(false);
  });
  it('affiche le chargement et ignore une reponse tardive apres changement de conversation', async () => {
    const hook = await setup([msg('recent',0)]);
    let resolve!: (messages:ChatMessage[]) => void;
    fetchHistory.mockImplementationOnce(() => new Promise(done => {resolve=done;}));
    let pending!:Promise<boolean>;
    await act(async () => {pending=hook.result.current.jumpTo(TARGET);});
    expect(hook.result.current.jumping).toBe(true);
    fetchHistory.mockResolvedValueOnce([msg('new-conversation',0)]);
    await hook.rerender({conversation:`dm:${TARGET}`});
    await act(async () => resolve([msg(TARGET,2000)]));
    expect(await pending).toBe(false);
    expect(ids(hook)).toEqual(['new-conversation']);
  });
  it('seule la derniere recherche peut remplacer la liste', async () => {
    const hook = await setup([msg('recent',0)]);
    let resolve!:(messages:ChatMessage[]) => void;
    fetchHistory.mockImplementationOnce(() => new Promise(done => {resolve=done;}));
    let pending!:Promise<boolean>;
    await act(async () => {pending=hook.result.current.jumpTo('first');});
    fetchHistory.mockResolvedValueOnce([msg('second',2000)]);
    expect(await jump(hook,'second')).toBe(true);
    await act(async () => resolve([msg('first',2001)]));
    expect(await pending).toBe(false);
    expect(ids(hook)).toEqual(['second']);
  });
  it('charge les pages plus recentes a partir de la cible sans doublons', async () => {
    const hook = await setup([msg('recent',0)]);
    fetchHistory.mockResolvedValueOnce([msg(TARGET,2000)]);
    await jump(hook,TARGET);
    fetchHistory.mockResolvedValueOnce([msg('newer',1999)]);
    await act(async () => hook.result.current.loadNewer());
    expect(fetchHistory).toHaveBeenLastCalledWith(`dm:${OLI}`,50,TARGET,{direction:'after'});
    expect(ids(hook)).toEqual(['newer',TARGET]);
    expect(hook.result.current.hasNewer).toBe(false);
  });
  it('un echec de page recente garde la fenetre et permet de reessayer', async () => {
    const hook = await setup([msg('recent',0)]);
    fetchHistory.mockResolvedValueOnce([msg(TARGET,2000)]);
    await jump(hook,TARGET);
    fetchHistory.mockRejectedValueOnce(new Error('network'));
    await act(async () => hook.result.current.loadNewer());
    expect(ids(hook)).toEqual([TARGET]);
    expect(hook.result.current.hasNewer).toBe(true);
    expect(hook.result.current.olderError).toBeTruthy();
    expect(hook.result.current.loadingNewer).toBe(false);
  });
});

it('ouvre directement une cible initiale sans charger la page recente', async () => {
  fetchHistory.mockResolvedValueOnce([msg(TARGET,2000)]);
  const hook = await renderHook(() => useMessages(`dm:${OLI}`,ME,TARGET));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  expect(fetchHistory).toHaveBeenCalledTimes(1);
  expect(fetchHistory).toHaveBeenCalledWith(`dm:${OLI}`,50,undefined,{around:TARGET});
  expect(ids(hook)).toEqual([TARGET]);
  expect(hook.result.current.hasNewer).toBe(true);
});
