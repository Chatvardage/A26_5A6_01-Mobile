import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMessages } from '@/hooks/useMessages';
import * as messageService from '@/services/messagesService';
import { lookupPseudos } from '@/services/usersService';
import type { ChatMessage } from '@/types/conversation';

jest.mock('@/services/messagesService', () => {
  const actual = jest.requireActual<typeof import('@/services/messagesService')>('@/services/messagesService');
  return { ...actual, fetchHistory: jest.fn(), hasNewerMessages: jest.fn(async () => true), sendMessage: jest.fn(), editMessage: jest.fn() };
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
  // Par défaut : aucun message plus récent après la fenêtre d'un saut.
  fetchHistory.mockReset().mockResolvedValue([]);
  jest.mocked(messageService.hasNewerMessages).mockReset().mockResolvedValue(true);
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
  it.each(['dm', 'room'])('masque les messages plus récents si une cible initiale %s est déjà la dernière', async kind => {
    fetchHistory.mockResolvedValueOnce([msg(TARGET, 0)]);
    jest.mocked(messageService.hasNewerMessages).mockResolvedValue(false);
    const hook = await renderHook(() => useMessages(`${kind}:${OLI}`, ME, TARGET));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.hasNewer).toBe(false);
    expect(fetchHistory).toHaveBeenLastCalledWith(`${kind}:${OLI}`, 50, TARGET, { direction: 'after' });
    expect(messageService.hasNewerMessages).not.toHaveBeenCalled();
    await act(async () => hook.result.current.loadNewer());
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });
  it('masque le bouton après un saut vers le dernier message hors de la fenêtre', async () => {
    const hook = await setup([msg('recent', 0)]);
    fetchHistory.mockResolvedValueOnce([msg(TARGET, 0)]);
    jest.mocked(messageService.hasNewerMessages).mockResolvedValue(false);
    expect(await jump(hook, TARGET)).toBe(true);
    expect(hook.result.current.hasNewer).toBe(false);
  });
  it('masque le bouton même si la dernière page contient exactement cinquante messages', async () => {
    const hook = await setup([msg('recent', 0)]);
    fetchHistory.mockResolvedValueOnce([msg(TARGET, 2000)]).mockResolvedValueOnce(page('n', 1000, 50));
    await jump(hook, TARGET);
    expect(hook.result.current.hasNewer).toBe(true);
    fetchHistory.mockResolvedValueOnce(page('fin', 0, 50));
    jest.mocked(messageService.hasNewerMessages).mockResolvedValue(false);
    await act(async () => hook.result.current.loadNewer());
    expect(messageService.hasNewerMessages).toHaveBeenLastCalledWith(`dm:${OLI}`, 'fin0');
    expect(hook.result.current.hasNewer).toBe(false);
    await act(async () => hook.result.current.loadNewer());
    expect(fetchHistory).toHaveBeenCalledTimes(4);
  });
  it('affiche toute une petite conversation depuis la cible, sans bouton « plus récents »', async () => {
    const hook = await setup([msg('recent', 0)]);
    fetchHistory.mockResolvedValueOnce([msg(TARGET, 3)]).mockResolvedValueOnce([msg('b', 1), msg('a', 2)]);
    expect(await jump(hook, TARGET)).toBe(true);
    expect(ids(hook)).toEqual(['b', 'a', TARGET]);
    expect(hook.result.current.hasNewer).toBe(false);
    expect(hook.result.current.hasOlder).toBe(false);
  });
  it('garde le bouton si les messages plus récents ne se chargent pas', async () => {
    const hook = await setup([msg('recent', 0)]);
    fetchHistory.mockResolvedValueOnce([msg(TARGET, 3)]).mockRejectedValueOnce(new Error('réseau'));
    expect(await jump(hook, TARGET)).toBe(true);
    expect(ids(hook)).toEqual([TARGET]);
    expect(hook.result.current.hasNewer).toBe(true);
  });
  it('conserve la possibilité de charger si la vérification réseau échoue', async () => {
    fetchHistory.mockResolvedValueOnce([msg(TARGET, 100)]).mockResolvedValueOnce(page('n', 0, 50));
    jest.mocked(messageService.hasNewerMessages).mockRejectedValue(new Error('réseau'));
    const hook = await renderHook(() => useMessages(`dm:${OLI}`, ME, TARGET));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.hasNewer).toBe(true);
    expect(ids(hook)).toHaveLength(51);
    expect(ids(hook).at(-1)).toBe(TARGET);
  });
  it('remonte une fenêtre déjà chargée sans nouvelle requête et affiche le chargement pendant une image', async () => {
    const hook = await setup([msg('a',1)]);
    let frame!: FrameRequestCallback;
    const requestFrame = jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
    let pending!: Promise<boolean>;
    await act(async () => { pending = hook.result.current.jumpTo('a'); });
    expect(hook.result.current.jumping).toBe(true);
    await act(async () => { frame(0); await pending; });
    expect(await pending).toBe(true);
    expect(hook.result.current.jumping).toBe(false);
    expect(fetchHistory).toHaveBeenCalledTimes(1);
    expect(ids(hook)).toEqual(['a']);
    requestFrame.mockRestore();
  });

  it('limite une fenêtre locale à 101 messages et permet de retrouver les pages retirées des deux côtés', async () => {
    const hook = await setup(page('r', 0, 50));
    fetchHistory.mockResolvedValueOnce(page('r', 50, 50));
    await act(async () => hook.result.current.loadOlder());
    fetchHistory.mockResolvedValueOnce(page('r', 100, 50));
    await act(async () => hook.result.current.loadOlder());
    expect(await jump(hook, 'r75')).toBe(true);
    expect(ids(hook)).toHaveLength(101);
    expect(ids(hook)[0]).toBe('r25');
    expect(ids(hook).at(-1)).toBe('r125');
    expect(hook.result.current.hasNewer).toBe(true);
    expect(hook.result.current.hasOlder).toBe(true);
    expect(fetchHistory).toHaveBeenCalledTimes(3);
    fetchHistory.mockResolvedValueOnce([msg('r24', 24)]);
    await act(async () => hook.result.current.loadNewer());
    expect(fetchHistory).toHaveBeenLastCalledWith(`dm:${OLI}`, 50, 'r25', { direction: 'after' });
    fetchHistory.mockResolvedValueOnce([msg('r126', 126)]);
    await act(async () => hook.result.current.loadOlder());
    expect(fetchHistory).toHaveBeenLastCalledWith(`dm:${OLI}`, 50, 'r125');
  });
  it('remplace les messages recents par une seule page depuis la cible', async () => {
    const hook = await setup(page('r',0,50));
    fetchHistory.mockResolvedValueOnce([msg(TARGET,2000),...page('p',2001,49)]).mockResolvedValueOnce(page('n',1000,50));
    expect(await jump(hook,TARGET)).toBe(true);
    expect(fetchHistory).toHaveBeenNthCalledWith(2,`dm:${OLI}`,50,undefined,{around:TARGET});
    expect(fetchHistory).toHaveBeenNthCalledWith(3,`dm:${OLI}`,50,TARGET,{direction:'after'});
    expect(fetchHistory).toHaveBeenCalledTimes(3);
    // Une page de messages plus récents est chargée avec la cible.
    expect(ids(hook)[0]).toBe('n1000');
    expect(ids(hook)).toContain(TARGET);
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
    fetchHistory.mockResolvedValueOnce([msg(TARGET,2000)]).mockResolvedValueOnce(page('n',1000,50));
    await jump(hook,TARGET);
    fetchHistory.mockResolvedValueOnce([msg('newer',999),msg('n1000',1000)]);
    await act(async () => hook.result.current.loadNewer());
    expect(fetchHistory).toHaveBeenLastCalledWith(`dm:${OLI}`,50,'n1000',{direction:'after'});
    expect(ids(hook)[0]).toBe('newer');
    expect(ids(hook).filter(id => id === 'n1000')).toHaveLength(1);
    expect(ids(hook)).toHaveLength(52);
    expect(hook.result.current.hasNewer).toBe(false);
  });
  it('un echec de page recente garde la fenetre et permet de reessayer', async () => {
    const hook = await setup([msg('recent',0)]);
    fetchHistory.mockResolvedValueOnce([msg(TARGET,2000)]).mockResolvedValueOnce(page('n',1000,50));
    await jump(hook,TARGET);
    fetchHistory.mockRejectedValueOnce(new Error('network'));
    await act(async () => hook.result.current.loadNewer());
    expect(ids(hook)).toHaveLength(51);
    expect(hook.result.current.hasNewer).toBe(true);
    expect(hook.result.current.olderError).toBeTruthy();
    expect(hook.result.current.loadingNewer).toBe(false);
  });
});

it('ouvre directement une cible initiale sans charger la page recente', async () => {
  fetchHistory.mockResolvedValueOnce([msg(TARGET,2000)]);
  const hook = await renderHook(() => useMessages(`dm:${OLI}`,ME,TARGET));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  // La cible, puis les messages qui la suivent (aucun ici) ; jamais la page récente.
  expect(fetchHistory).toHaveBeenCalledTimes(2);
  expect(fetchHistory).toHaveBeenNthCalledWith(1,`dm:${OLI}`,50,undefined,{around:TARGET});
  expect(fetchHistory).toHaveBeenNthCalledWith(2,`dm:${OLI}`,50,TARGET,{direction:'after'});
  expect(ids(hook)).toEqual([TARGET]);
  expect(hook.result.current.hasNewer).toBe(false);
});

describe('useMessages : fenêtre ouverte sur des messages anciens', () => {
  /** Saut vers TARGET avec une page complète de messages plus récents : `hasNewer` reste vrai. */
  const anchored = async () => {
    const hook = await setup([msg('recent', 0)]);
    fetchHistory.mockResolvedValueOnce([msg(TARGET, 2000)]).mockResolvedValueOnce(page('n', 1000, 50));
    await jump(hook, TARGET);
    expect(hook.result.current.hasNewer).toBe(true);
    return hook;
  };
  const handler = (event: string) => (mockRealtime.subscribe.mock.calls as unknown as [string, (raw: unknown) => void][]).findLast(([name]) => name === event)![1];
  const raw = (id: string, extra: Record<string, unknown> = {}) => ({
    id, senderId: OLI, recipientId: ME, content: `reçu ${id}`, createdAt: '2026-10-01T12:30:00Z', updatedAt: '2026-10-01T12:30:00Z', ...extra,
  });

  it('ignore un nouveau message hors de la fenêtre mais applique la réception d’un message affiché', async () => {
    const hook = await anchored();
    await act(async () => handler('private-message.created')(raw('hors-fenetre')));
    expect(ids(hook)).not.toContain('hors-fenetre');
    await act(async () => handler('private-message.delivered')(raw('n1000', { deliveredAt: '2026-10-01T12:31:00Z' })));
    expect(hook.result.current.messages.find(m => m.id === 'n1000')?.deliveredAt).toBe('2026-10-01T12:31:00Z');
  });

  it('considère qu’il reste des messages plus récents si leur vérification échoue', async () => {
    const hook = await anchored();
    fetchHistory.mockResolvedValueOnce(page('m', 500, 50));
    jest.mocked(messageService.hasNewerMessages).mockRejectedValueOnce(new Error('réseau'));
    await act(async () => hook.result.current.loadNewer());
    expect(ids(hook)[0]).toBe('m500');
    expect(hook.result.current.hasNewer).toBe(true);
  });

  it('ignore une page plus récente arrivée après un nouveau saut', async () => {
    const hook = await anchored();
    let resolve!: (messages: ChatMessage[]) => void;
    fetchHistory.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    let pending!: Promise<void>;
    await act(async () => { pending = hook.result.current.loadNewer(); });
    fetchHistory.mockResolvedValueOnce([msg('autre', 3000)]).mockResolvedValueOnce([]);
    expect(await jump(hook, 'autre')).toBe(true);
    await act(async () => { resolve([msg('tardif', 1)]); await pending; });
    expect(ids(hook)).toEqual(['autre']);
  });

  it('ignore l’échec d’une page plus récente arrivé après un nouveau saut', async () => {
    const hook = await anchored();
    let reject!: (error: Error) => void;
    fetchHistory.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    let pending!: Promise<void>;
    await act(async () => { pending = hook.result.current.loadNewer(); });
    fetchHistory.mockResolvedValueOnce([msg('autre', 3000)]).mockResolvedValueOnce([]);
    expect(await jump(hook, 'autre')).toBe(true);
    await act(async () => { reject(new Error('réseau')); await pending; });
    expect(hook.result.current.olderError).toBeNull();
    expect(hook.result.current.loadingNewer).toBe(false);
  });

  it('ignore une page plus récente arrivée après un changement de conversation', async () => {
    const hook = await anchored();
    let resolve!: (messages: ChatMessage[]) => void;
    fetchHistory.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    let pending!: Promise<void>;
    await act(async () => { pending = hook.result.current.loadNewer(); });
    fetchHistory.mockResolvedValueOnce([msg('ailleurs', 0)]);
    await hook.rerender({ conversation: `dm:${TARGET}` });
    await waitFor(() => expect(ids(hook)).toEqual(['ailleurs']));
    await act(async () => { resolve([msg('tardif', 1)]); await pending; });
    expect(ids(hook)).toEqual(['ailleurs']);
  });

  it('un envoi depuis une fenêtre ancienne revient aux messages récents', async () => {
    const hook = await anchored();
    const sent = { ...msg('envoye', -1), senderId: ME };
    jest.mocked(messageService.sendMessage).mockResolvedValueOnce(sent);
    fetchHistory.mockResolvedValueOnce([sent, msg('recent', 0)]);
    await act(async () => hook.result.current.send('bonjour'));
    expect(hook.result.current.hasNewer).toBe(false);
    expect(ids(hook)).toEqual(['envoye', 'recent']);
    expect(fetchHistory).toHaveBeenLastCalledWith(`dm:${OLI}`);
  });
});
