import { act, render, renderHook, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import {
  configureNotifications,
  getLaunchTap,
  getPermission,
  onNotificationOpened,
  openSystemSettings,
  requestPermission,
  showInvitationNotification,
  showMessageNotification,
} from '@/adapters/notifications.adapter';
import { AppServices } from '@/components/AppServices';
import { parseInvitation, useInvitationAlerts } from '@/hooks/useInvitationAlerts';
import { useMessageAlerts, parseIncoming } from '@/hooks/useMessageAlerts';
import { getInvitations } from '@/services/rooms.service';
import { resetNotificationNavigationForTests, useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { useRoomSubscriptions } from '@/hooks/useRoomSubscriptions';
import { PreferencesScreen } from '@/screens/PreferencesScreen';
import { fetchServers } from '@/services/serversService';
import { fetchUnreadCounts, markConversationRead } from '@/services/unreadService';
import { lookupPseudos } from '@/services/usersService';
import { UnreadProvider } from '@/unread/UnreadContext';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
let mockNotificationMode = 'systeme';
jest.mock('@/profile/ProfileContext', () => ({ useProfile: () => ({ profile: { modeNotification: mockNotificationMode } }) }));
jest.mock('@/hooks/useConnection', () => ({ useConnection: () => ({ status: 'online', online: true }) }));
jest.mock('@/adapters/notifications.adapter');
jest.mock('@/services/unreadService');
jest.mock('@/services/usersService');
jest.mock('@/services/serversService');
jest.mock('@/services/rooms.service');
const mockRealtime = { subscribe: jest.fn(), onReady: jest.fn(), joinRoom: jest.fn() };
const { subscribe, onReady, joinRoom } = mockRealtime;
jest.mock('@/session/SessionContext', () => ({
  useSession: () => ({ user: { id: 'me', pseudo: 'mia' }, signOut: jest.fn(), realtime: mockRealtime }),
}));

const ME = '11111111-1111-4111-8111-111111111111';
const OLI = '22222222-2222-4222-8222-222222222222';
const ROOM = '33333333-3333-4333-8333-333333333333';
const dmEvent = (senderId = OLI) => ({ id: 'm', senderId, recipientId: ME, content: 'secret privé' });
const roomEvent = (authorId = OLI) => ({ id: 'm', roomId: ROOM, authorId, content: 'secret salon' });

const handlers = new Map<string, (raw: unknown) => void>();
let appState = 'active';

beforeEach(() => {
  mockNotificationMode = 'systeme';
  jest.clearAllMocks();
  handlers.clear();
  appState = 'active';
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => appState });
  jest.mocked(subscribe).mockImplementation(((event: string, handler: (raw: unknown) => void) => {
    handlers.set(event, handler);
    return () => handlers.delete(event);
  }) as never);
  jest.mocked(getPermission).mockResolvedValue('granted');
  jest.mocked(markConversationRead).mockResolvedValue();
  jest.mocked(fetchUnreadCounts).mockResolvedValue({});
  jest.mocked(onReady).mockReturnValue(jest.fn());
  jest.mocked(lookupPseudos).mockResolvedValue({ [OLI]: 'oli' });
  jest.mocked(showMessageNotification).mockResolvedValue(true);
});

describe('parseIncoming', () => {
  it('reconnaît un message privé reçu et un message de salon d\'un autre', () => {
    expect(parseIncoming('dm', dmEvent(), ME)).toEqual({ conversationId: `dm:${OLI}`, senderId: OLI });
    expect(parseIncoming('room', roomEvent(), ME)).toEqual({ conversationId: `room:${ROOM}`, senderId: OLI });
  });

  it.each([
    ['null', 'dm', null],
    ['texte', 'room', 'x'],
    ['soi-même (privé)', 'dm', dmEvent(ME)],
    ['autre destinataire', 'dm', { ...dmEvent(), recipientId: 'x' }],
    ['sans expéditeur', 'dm', { recipientId: ME }],
    ['soi-même (salon)', 'room', roomEvent(ME)],
    ['sans salon', 'room', { authorId: OLI }],
    ['sans auteur', 'room', { roomId: ROOM }],
  ] as const)('ignore %s', (_, kind, raw) => {
    expect(parseIncoming(kind, raw, ME)).toBeNull();
  });
});

describe('useMessageAlerts', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <UnreadProvider>{children}</UnreadProvider>;
  const setup = (active: string | null = null) =>
    renderHook(({ id }: { id: string | null }) => useMessageAlerts(ME, id), { initialProps: { id: active }, wrapper });

  it("notifie un message privé d'une autre conversation, sans son contenu", async () => {
    await setup(`dm:${ME}`);
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    await waitFor(() => expect(showMessageNotification).toHaveBeenCalled());
    expect(showMessageNotification).toHaveBeenCalledWith({ conversationId: `dm:${OLI}`, title: 'oli', body: 'Nouveau message' });
    expect(JSON.stringify(jest.mocked(showMessageNotification).mock.calls)).not.toContain('secret');
  });

  it('notifie un message de salon avec le nom de la marque quand le pseudo est inconnu, puis réutilise le pseudo', async () => {
    jest.mocked(lookupPseudos).mockResolvedValueOnce({});
    await setup();
    await act(async () => handlers.get('room-message.created')!(roomEvent()));
    await waitFor(() => expect(showMessageNotification).toHaveBeenCalledTimes(1));
    expect(showMessageNotification).toHaveBeenLastCalledWith({ conversationId: `room:${ROOM}`, title: 'Chatvardage', body: 'Nouveau message' });
    jest.mocked(lookupPseudos).mockResolvedValue({ [OLI]: 'oli' });
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    await waitFor(() => expect(showMessageNotification).toHaveBeenCalledTimes(3));
    expect(lookupPseudos).toHaveBeenCalledTimes(2);
  });

  it("borne le cache des pseudos : au-delà de 500 expéditeurs le plus ancien est oublié et sa recherche reprend", async () => {
    await setup();
    jest.mocked(lookupPseudos).mockClear();
    for (let i = 0; i < 502; i++) {
      const senderId = `expediteur-${i}`;
      jest.mocked(lookupPseudos).mockResolvedValueOnce({ [senderId]: `pseudo-${i}` });
      await act(async () => handlers.get('private-message.created')!({ id: `m${i}`, senderId, recipientId: ME }));
    }
    await waitFor(() => expect(showMessageNotification).toHaveBeenCalledTimes(502));
    // Le plus ancien a été évincé : il est cherché de nouveau.
    jest.mocked(lookupPseudos).mockClear();
    await act(async () =>
      handlers.get('private-message.created')!({ id: 'again', senderId: 'expediteur-0', recipientId: ME }),
    );
    await waitFor(() => expect(lookupPseudos).toHaveBeenCalledTimes(1));
  });

  it('tolère un annuaire des pseudos indisponible', async () => {
    jest.mocked(lookupPseudos).mockRejectedValue(new Error('503'));
    await setup();
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    await waitFor(() => expect(showMessageNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Chatvardage' })));
  });

  it("ne relit la permission que tant qu'elle n'est pas accordée", async () => {
    jest.mocked(getPermission).mockResolvedValue('denied');
    await setup();
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    expect(showMessageNotification).not.toHaveBeenCalled();
    jest.mocked(getPermission).mockResolvedValue('granted');
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    await waitFor(() => expect(showMessageNotification).toHaveBeenCalledTimes(1));
    // Accordée une fois : plus relue (même si elle était retirée ensuite, la notification suit son cours).
    jest.mocked(getPermission).mockResolvedValue('denied');
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    await waitFor(() => expect(showMessageNotification).toHaveBeenCalledTimes(2));
  });

  it('marque de nouveau lue la conversation affichée au retour au premier plan', async () => {
    const listeners: ((state: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, handler: (state: string) => void) => {
      listeners.push(handler);
      return { remove: jest.fn() };
    }) as never);
    await setup(`dm:${OLI}`);
    jest.mocked(markConversationRead).mockClear();
    await act(async () => listeners.forEach((l) => l('background')));
    expect(markConversationRead).not.toHaveBeenCalled();
    await act(async () => listeners.forEach((l) => l('active')));
    expect(markConversationRead).toHaveBeenCalledWith(`dm:${OLI}`);
    spy.mockImplementation((() => ({ remove: jest.fn() })) as never);
  });

  it('ne notifie pas sans permission accordée', async () => {
    jest.mocked(getPermission).mockResolvedValue('denied');
    await setup();
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    expect(showMessageNotification).not.toHaveBeenCalled();
  });

  it('marque lue, sans notifier, la conversation affichée au premier plan', async () => {
    await setup(`dm:${OLI}`);
    expect(markConversationRead).toHaveBeenCalledWith(`dm:${OLI}`);
    jest.mocked(markConversationRead).mockClear();
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    expect(markConversationRead).toHaveBeenCalledWith(`dm:${OLI}`);
    expect(showMessageNotification).not.toHaveBeenCalled();
  });

  it("notifie la conversation ouverte quand l'application est en arrière-plan", async () => {
    await setup(`dm:${OLI}`);
    appState = 'background';
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    await waitFor(() => expect(showMessageNotification).toHaveBeenCalled());
  });

  it('ignore ses propres messages et tolère un échec du marquage de lecture', async () => {
    jest.mocked(markConversationRead).mockRejectedValue(new Error('x'));
    const hook = await setup(`dm:${OLI}`);
    await act(async () => handlers.get('private-message.created')!(dmEvent(ME)));
    await act(async () => handlers.get('private-message.created')!(dmEvent()));
    expect(showMessageNotification).not.toHaveBeenCalled();
    await hook.rerender({ id: null });
    await hook.unmount();
    expect(handlers.size).toBe(0);
  });

  it("n'échoue pas si le canal temps réel n'est pas configuré", async () => {
    jest.mocked(subscribe).mockImplementation(() => {
      throw new Error('Session absente');
    });
    await expect(setup()).resolves.toBeDefined();
  });
});

describe('useRoomSubscriptions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(fetchServers).mockResolvedValue([
      { id: 's1', name: 'A', memberCount: 1, channelIds: ['c1', 'c2'], unreadCount: 0 },
      { id: 's2', name: 'B', memberCount: 1, channelIds: ['c3'], unreadCount: 0 },
    ]);
    jest.mocked(joinRoom).mockResolvedValue(undefined);
  });
  afterEach(() => jest.useRealTimers());

  it('rejoint tous les salons accessibles, après une reconnexion et après un changement de conversation', async () => {
    let ready: () => void = () => undefined;
    jest.mocked(onReady).mockImplementation((handler) => {
      ready = handler;
      return jest.fn();
    });
    const hook = await renderHook(({ id }: { id: string | null }) => useRoomSubscriptions(id), { initialProps: { id: null } });
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(jest.mocked(joinRoom).mock.calls.map((c) => c[0])).toEqual(['c1', 'c2', 'c3']);
    await act(async () => ready());
    expect(joinRoom).toHaveBeenCalledTimes(6);
    await hook.rerender({ id: `room:${ROOM}` });
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(joinRoom).toHaveBeenCalledTimes(9);
  });

  it('ignore la liste des salons reçue après le démontage', async () => {
    let resolve: (servers: Awaited<ReturnType<typeof fetchServers>>) => void = () => undefined;
    jest.mocked(fetchServers).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const hook = await renderHook(() => useRoomSubscriptions(null));
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    await hook.unmount();
    await act(async () => resolve([{ id: 's', name: 'A', memberCount: 1, channelIds: ['tard'], unreadCount: 0 }]));
    expect(joinRoom).not.toHaveBeenCalledWith('tard');
  });

  it('ignore les échecs de chargement et d\'abonnement, et le démontage avant la réponse', async () => {
    jest.mocked(fetchServers).mockRejectedValueOnce(new Error('503'));
    jest.mocked(onReady).mockImplementation(() => {
      throw new Error('Session absente');
    });
    const hook = await renderHook(() => useRoomSubscriptions(null));
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(joinRoom).not.toHaveBeenCalled();
    jest.mocked(joinRoom).mockRejectedValue(new Error('403'));
    await hook.rerender({});
    jest.mocked(fetchServers).mockResolvedValueOnce([{ id: 's', name: 'A', memberCount: 1, channelIds: ['c1'], unreadCount: 0 }]);
    const second = await renderHook(() => useRoomSubscriptions(null));
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(joinRoom).toHaveBeenCalledWith('c1');
    jest.mocked(fetchServers).mockResolvedValueOnce([{ id: 's', name: 'A', memberCount: 1, channelIds: ['c9'], unreadCount: 0 }]);
    const third = await renderHook(() => useRoomSubscriptions(null));
    await act(async () => jest.advanceTimersByTimeAsync(100));
    await third.unmount();
    await second.unmount();
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(joinRoom).not.toHaveBeenCalledWith('c9');
  });
});

describe('serveur.change', () => {
  it('rejoint les nouveaux salons quand un serveur change', async () => {
    jest.useFakeTimers();
    jest.mocked(fetchServers).mockReset();
    jest.mocked(fetchServers).mockResolvedValue([{ id: 's', name: 'A', memberCount: 1, channelIds: ['nouveau'], unreadCount: 0 }]);
    jest.mocked(joinRoom).mockResolvedValue(undefined);
    await renderHook(() => useRoomSubscriptions(null));
    await act(async () => handlers.get('serveur.change')!({ serveurId: 's', raison: 'salons' }));
    expect(joinRoom).toHaveBeenCalledWith('nouveau');
    jest.useRealTimers();
  });

  it('rafraîchit une liste quand un serveur change, filtré par serveur si demandé', async () => {
    const refresh = jest.fn();
    const all = await renderHook(() => useRefreshOnServerChange(refresh));
    await act(async () => handlers.get('serveur.change')!({ serveurId: 'a', raison: 'salons' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => handlers.get('serveur.change')!(null));
    expect(refresh).toHaveBeenCalledTimes(2);
    await all.unmount();
    expect(handlers.has('serveur.change')).toBe(false);

    refresh.mockClear();
    await renderHook(() => useRefreshOnServerChange(refresh, 'mon-serveur'));
    await act(async () => handlers.get('serveur.change')!({ serveurId: 'autre' }));
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => handlers.get('serveur.change')!({ serveurId: 'mon-serveur' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ne casse pas si le canal temps réel n'est pas configuré", async () => {
    jest.mocked(subscribe).mockImplementation(() => {
      throw new Error('Session absente');
    });
    await expect(renderHook(() => useRefreshOnServerChange(jest.fn()))).resolves.toBeDefined();
  });
});

describe('useNotificationNavigation', () => {
  let opened: (tap: { id: string; conversationId: string }) => void;
  const off = jest.fn();
  beforeEach(() => {
    resetNotificationNavigationForTests();
    jest.mocked(onNotificationOpened).mockImplementation((handler) => {
      opened = handler;
      return off;
    });
    jest.mocked(getLaunchTap).mockResolvedValue(null);
  });

  it("ouvre la conversation d'une notification touchée, une seule fois par notification", async () => {
    const open = jest.fn();
    await renderHook(() => useNotificationNavigation(open));
    opened({ id: 'n1', conversationId: `dm:${OLI}` });
    opened({ id: 'n1', conversationId: `dm:${OLI}` });
    opened({ id: 'n2', conversationId: `room:${ROOM}` });
    expect(open.mock.calls).toEqual([[`dm:${OLI}`], [`room:${ROOM}`]]);
  });

  it("ouvre la conversation de la notification qui a lancé l'application", async () => {
    jest.mocked(getLaunchTap).mockResolvedValue({ id: 'cold', conversationId: `dm:${OLI}` });
    const open = jest.fn();
    await renderHook(() => useNotificationNavigation(open));
    await waitFor(() => expect(open).toHaveBeenCalledWith(`dm:${OLI}`));
  });

  it('ne fait rien après le démontage', async () => {
    let resolveLaunch: (tap: { id: string; conversationId: string }) => void = () => undefined;
    jest.mocked(getLaunchTap).mockReturnValue(new Promise((resolve) => { resolveLaunch = resolve; }));
    const open = jest.fn();
    const hook = await renderHook(() => useNotificationNavigation(open));
    await hook.unmount();
    expect(off).toHaveBeenCalled();
    await act(async () => resolveLaunch({ id: 'late', conversationId: `dm:${OLI}` }));
    opened({ id: 'late2', conversationId: `dm:${OLI}` });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('permission de notification', () => {
  let appStateListener: (state: string) => void;
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: typeof appStateListener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    }) as never);
  });

  it('lit la permission, la relit au retour des réglages et permet de la demander', async () => {
    jest.mocked(getPermission).mockResolvedValue('undetermined');
    jest.mocked(requestPermission).mockResolvedValue('granted');
    const hook = await renderHook(() => useNotificationPermission());
    await waitFor(() => expect(hook.result.current.permission).toBe('undetermined'));
    jest.mocked(getPermission).mockResolvedValue('denied');
    await act(async () => appStateListener('background'));
    expect(hook.result.current.permission).toBe('undetermined');
    await act(async () => appStateListener('active'));
    await waitFor(() => expect(hook.result.current.permission).toBe('denied'));
    await act(async () => void hook.result.current.request());
    expect(hook.result.current.permission).toBe('granted');
    expect(hook.result.current.openSettings).toBe(openSystemSettings);
  });

  it('ignore une lecture terminée après le démontage', async () => {
    let resolve: (value: 'granted') => void = () => undefined;
    jest.mocked(getPermission).mockReturnValue(new Promise((r) => { resolve = r; }));
    const hook = await renderHook(() => useNotificationPermission());
    await hook.unmount();
    await act(async () => resolve('granted'));
    expect(hook.result.current.permission).toBeNull();
  });

  it.each([
    ['granted', 'Activées', null],
    ['unavailable', 'Notifications système indisponibles dans cet environnement. Sur Android avec Expo Go, installez la version de développement Chatvardage. Les badges restent actifs.', null],
    ['undetermined', 'Non activées', 'Activer les notifications'],
    ['denied', 'Refusées : activez-les dans les réglages du système.', 'Ouvrir les réglages'],
  ] as const)('affiche la permission %s dans les préférences', async (permission, label, button) => {
    jest.mocked(getPermission).mockResolvedValue(permission);
    jest.mocked(requestPermission).mockResolvedValue('granted');
    await render(<PreferencesScreen />);
    await waitFor(() => expect(screen.getByTestId('notification-permission')).toBeTruthy());
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(/Le badge de messages non lus reste visible/)).toBeTruthy();
    if (!button) return expect(screen.queryByText(/Activer les notifications|Ouvrir les réglages/)).toBeNull();
    await userEvent.setup().press(screen.getByText(button));
    if (permission === 'undetermined') await waitFor(() => expect(screen.getByText('Activées')).toBeTruthy());
    else expect(openSystemSettings).toHaveBeenCalled();
  });
});

describe('AppServices', () => {
  const ref = { isReady: jest.fn(), navigate: jest.fn() } as never as Parameters<typeof AppServices>[0]['navigationRef'];
  let opened: (tap: { id: string; conversationId: string }) => void;

  beforeEach(() => {
    resetNotificationNavigationForTests();
    jest.mocked(configureNotifications).mockResolvedValue();
    jest.mocked(onNotificationOpened).mockImplementation((handler) => {
      opened = handler;
      return jest.fn();
    });
    jest.mocked(getLaunchTap).mockResolvedValue(null);
    jest.mocked(fetchServers).mockResolvedValue([]);
    jest.mocked(onReady).mockReturnValue(jest.fn());
    jest.mocked(ref.isReady).mockReturnValue(true);
  });

  const mount = () =>
    render(
      <UnreadProvider>
        <AppServices userId={ME} activeConversationId={null} navigationRef={ref} />
      </UnreadProvider>,
    );

  it('demande la permission une seule fois, au premier lancement', async () => {
    jest.mocked(getPermission).mockResolvedValue('undetermined');
    await mount();
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    expect(configureNotifications).toHaveBeenCalled();
  });

  it('ne redemande pas après un refus', async () => {
    jest.mocked(getPermission).mockResolvedValue('denied');
    await mount();
    await waitFor(() => expect(configureNotifications).toHaveBeenCalled());
    await act(async () => undefined);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('ouvre la bonne conversation au toucher, après validation de son identifiant', async () => {
    jest.mocked(getPermission).mockResolvedValue('denied');
    await mount();
    opened({ id: 'a', conversationId: `dm:${OLI}` });
    expect(ref.navigate).toHaveBeenCalledWith('Conversation', { conversationId: `dm:${OLI}`, title: undefined });
    jest.mocked(ref.navigate).mockClear();
    opened({ id: 'b', conversationId: 'dm:invalide' });
    expect(ref.navigate).not.toHaveBeenCalled();
    jest.mocked(ref.isReady).mockReturnValue(false);
    opened({ id: 'c', conversationId: `dm:${OLI}` });
    expect(ref.navigate).not.toHaveBeenCalled();
  });
  it('ouvre les invitations au toucher d’une notification d’invitation', async () => {
    jest.mocked(getPermission).mockResolvedValue('denied');
    await mount();
    (opened as (tap: unknown) => void)({ id: 'i1', invitations: true });
    expect(ref.navigate).toHaveBeenCalledWith('DiscoverServers', { mode: 'discover' });
    jest.mocked(ref.navigate).mockClear();
    jest.mocked(ref.isReady).mockReturnValue(false);
    (opened as (tap: unknown) => void)({ id: 'i2', invitations: true });
    expect(ref.navigate).not.toHaveBeenCalled();
  });
});

describe('useInvitationAlerts', () => {
  const SERVER = '44444444-4444-4444-8444-444444444444';
  const invitation = (serverId = SERVER) => ({ serveurId: serverId, raison: 'invitation', cibleId: ME });
  const invitations = [{ serveur: { id: SERVER, nom: 'Équipe', nombreMembres: 2, icone: null, public: false, parDefaut: false }, invitePar: OLI, inviteLe: '2026-10-08' }];
  beforeEach(() => jest.mocked(getInvitations).mockResolvedValue(invitations));

  it('ne retient que les invitations qui me visent', () => {
    expect(parseInvitation(invitation(), ME)).toBe(SERVER);
    expect(parseInvitation({ ...invitation(), cibleId: OLI }, ME)).toBeNull();
    expect(parseInvitation({ ...invitation(), raison: 'membres' }, ME)).toBeNull();
    expect(parseInvitation({ ...invitation(), serveurId: 3 }, ME)).toBeNull();
    expect(parseInvitation(null, ME)).toBeNull();
  });

  it('notifie une invitation reçue avec le nom du serveur', async () => {
    await renderHook(() => useInvitationAlerts(ME));
    await act(async () => handlers.get('serveur.change')!(invitation()));
    expect(showInvitationNotification).toHaveBeenCalledWith({ title: 'Nouvelle invitation', body: 'Vous avez reçu une invitation pour le serveur Équipe.' });
    await act(async () => handlers.get('serveur.change')!({ ...invitation(), cibleId: OLI }));
    expect(showInvitationNotification).toHaveBeenCalledTimes(1);
  });

  it('garde un texte générique si la liste des invitations est indisponible', async () => {
    jest.mocked(getInvitations).mockRejectedValueOnce(new Error('x'));
    await renderHook(() => useInvitationAlerts(ME));
    await act(async () => handlers.get('serveur.change')!(invitation()));
    expect(showInvitationNotification).toHaveBeenCalledWith({ title: 'Nouvelle invitation', body: 'Vous avez reçu une invitation pour un serveur.' });
  });

  it('respecte la permission refusée, les modes discret et aucune, et le démontage', async () => {
    jest.mocked(getPermission).mockResolvedValue('denied');
    const first = await renderHook(() => useInvitationAlerts(ME));
    await act(async () => handlers.get('serveur.change')!(invitation()));
    await first.unmount();
    for (const mode of ['discret', 'aucune']) {
      mockNotificationMode = mode;
      const hook = await renderHook(() => useInvitationAlerts(ME));
      expect(handlers.has('serveur.change')).toBe(false);
      await hook.unmount();
    }
    mockNotificationMode = 'systeme';
    jest.mocked(getPermission).mockResolvedValue('granted');
    let resolve: (value: typeof invitations) => void = () => undefined;
    jest.mocked(getInvitations).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const last = await renderHook(() => useInvitationAlerts(ME));
    await act(async () => handlers.get('serveur.change')!(invitation()));
    await last.unmount();
    await act(async () => resolve(invitations));
    expect(showInvitationNotification).not.toHaveBeenCalled();
  });

  it('survit à un canal temps réel absent', async () => {
    jest.mocked(subscribe).mockImplementation(() => { throw new Error('Session absente'); });
    await expect(renderHook(() => useInvitationAlerts(ME))).resolves.toBeDefined();
  });
});

it.each(['discret','aucune'])('ne présente pas de notification système en mode %s',async mode=>{
  mockNotificationMode=mode;
  await renderHook(()=>useMessageAlerts(ME,null),{wrapper:UnreadProvider});
  await act(async()=>handlers.get('private-message.created')!(dmEvent()));
  expect(showMessageNotification).not.toHaveBeenCalled();
});
