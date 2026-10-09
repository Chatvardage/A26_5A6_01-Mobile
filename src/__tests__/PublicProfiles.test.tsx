import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { usePublicProfiles } from '@/hooks/usePublicProfiles';
import { useReadReceipts } from '@/hooks/useReadReceipts';
import { apiFetch } from '@/services/httpClient';
import { getPublicProfiles, type PublicProfile } from '@/services/publicProfiles.service';
import { getReaders } from '@/services/receipts.service';

jest.mock('@/services/httpClient');
jest.mock('@/services/receipts.service', () => ({ getReaders: jest.fn() }));
jest.mock('@/services/publicProfiles.service', () => {
  const actual = jest.requireActual('@/services/publicProfiles.service');
  return { ...actual, getPublicProfiles: jest.fn(actual.getPublicProfiles) };
});

type Handler = (raw?: unknown) => void;
const handlers = new Map<string, Handler>();
const offs = { ready: jest.fn(), subscribe: jest.fn() };
let mockRealtime: Record<string, unknown> | undefined;
const fullRealtime = () => ({
  followPresence: jest.fn().mockResolvedValue(['alice']),
  onReady: jest.fn((handler: Handler) => { handlers.set('ready', handler); return offs.ready; }),
  subscribe: jest.fn((event: string, handler: Handler) => { handlers.set(event, handler); return offs.subscribe; }),
});
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ realtime: mockRealtime }) }));

const profile = (id: string, actif = true): PublicProfile => ({ idUtilisateur: id, alias: id.toUpperCase(), avatar: null, actif });
const realFetch = jest.requireActual('@/services/publicProfiles.service').getPublicProfiles;

beforeEach(() => {
  jest.clearAllMocks();
  handlers.clear();
  mockRealtime = fullRealtime();
  jest.mocked(getPublicProfiles).mockImplementation(realFetch);
  jest.mocked(apiFetch).mockResolvedValue([profile('alice'), profile('bob'), profile('carol', false)]);
});

describe('getPublicProfiles', () => {
  it('déduplique, ignore les identifiants vides et découpe par lots de 100', async () => {
    jest.mocked(apiFetch).mockImplementation(async (path: string) => [profile(String(path.split('=')[1].split(',').length))]);
    const ids = Array.from({ length: 150 }, (_, i) => `u${i}`);
    const values = await getPublicProfiles([...ids, 'u0', '', 'a/b']);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(jest.mocked(apiFetch).mock.calls[1][0]).toContain('a%2Fb');
    // 151 identifiants uniques non vides : un lot de 100 puis un de 51.
    expect(values.map(v => v.idUtilisateur)).toEqual(['100', '51']);
  });
});

describe('usePublicProfiles', () => {
  it('ne charge rien sans identifiant', async () => {
    const hook = await renderHook(() => usePublicProfiles([]));
    expect(hook.result.current).toEqual({});
    expect(getPublicProfiles).not.toHaveBeenCalled();
  });

  it('combine profil actif et présence suivie, puis applique les changements de présence', async () => {
    const hook = await renderHook(() => usePublicProfiles(['bob', 'alice', 'carol', 'alice']));
    await waitFor(() => expect(hook.result.current.alice?.online).toBe(true));
    // Suivi actif (réponse au tour suivant) : seul alice est en ligne ; carol est inactive.
    await waitFor(() => expect(hook.result.current.bob.online).toBe(false));
    expect(hook.result.current.carol.online).toBe(false);
    await act(async () => handlers.get('presence.changed')!({ userId: 'bob', statut: 'en-ligne' }));
    expect(hook.result.current.bob.online).toBe(true);
    await act(async () => handlers.get('presence.changed')!({ userId: 'alice', statut: 'hors-ligne' }));
    expect(hook.result.current.alice.online).toBe(false);
    const calls = jest.mocked(getPublicProfiles).mock.calls.length;
    // Événements ignorés : sans relecture.
    for (const raw of [null, 'texte', { userId: 1, statut: 'en-ligne' }, { userId: 'zoe', statut: 'en-ligne' }, { userId: 'bob', statut: 'absent' }]) {
      await act(async () => handlers.get('presence.changed')!(raw));
    }
    expect(getPublicProfiles).toHaveBeenCalledTimes(calls);
    await act(async () => handlers.get('profil.changed')!());
    await act(async () => handlers.get('ready')!());
    expect(jest.mocked(getPublicProfiles).mock.calls.length).toBeGreaterThan(calls);
    await hook.unmount();
    expect(offs.ready).toHaveBeenCalledTimes(1);
    expect(offs.subscribe).toHaveBeenCalledTimes(2);
  });

  it('sans suivi de présence, se fie aux événements hors ligne et au profil actif', async () => {
    mockRealtime = { ...fullRealtime(), followPresence: undefined };
    const hook = await renderHook(() => usePublicProfiles(['alice', 'bob']));
    await waitFor(() => expect(hook.result.current.alice?.online).toBe(true));
    await act(async () => handlers.get('presence.changed')!({ userId: 'alice', statut: 'hors-ligne' }));
    expect(hook.result.current.alice.online).toBe(false);
    await act(async () => handlers.get('presence.changed')!({ userId: 'alice', statut: 'en-ligne' }));
    expect(hook.result.current.alice.online).toBe(true);
  });

  it('reste disponible sans canal temps réel, si le canal lève ou si les appels échouent', async () => {
    mockRealtime = undefined;
    const bare = await renderHook(() => usePublicProfiles(['alice']));
    await waitFor(() => expect(bare.result.current.alice?.online).toBe(true));
    mockRealtime = { followPresence: jest.fn().mockRejectedValue(new Error('offline')), onReady: () => { throw new Error('non configuré'); } };
    jest.mocked(getPublicProfiles).mockRejectedValue(new Error('offline'));
    const failing = await renderHook(() => usePublicProfiles(['alice']));
    await act(async () => undefined);
    expect(failing.result.current).toEqual({});
    mockRealtime = {};
    const empty = await renderHook(() => usePublicProfiles(['bob']));
    await act(async () => undefined);
    expect(empty.result.current).toEqual({});
  });

  it('ignore une réponse ancienne et une présence arrivée après le démontage', async () => {
    let resolveFollow!: (ids: string[]) => void;
    const followPresence = jest.fn(() => new Promise<string[]>(done => { resolveFollow = done; }));
    mockRealtime = { ...fullRealtime(), followPresence };
    let first!: (values: PublicProfile[]) => void;
    jest.mocked(getPublicProfiles)
      .mockImplementationOnce(() => new Promise(done => { first = done; }))
      .mockResolvedValueOnce([profile('alice', false)]);
    const hook = await renderHook(() => usePublicProfiles(['alice']));
    await act(async () => handlers.get('profil.changed')!());
    await act(async () => first([profile('alice')]));
    expect(hook.result.current.alice.actif).toBe(false);
    // Demande de présence regroupée au tour suivant : envoyée avant le démontage.
    await waitFor(() => expect(followPresence).toHaveBeenCalled());
    await hook.unmount();
    await act(async () => resolveFollow(['alice']));
    expect(getPublicProfiles).toHaveBeenCalledTimes(2);
  });

  it('relit toutes les 30 s seulement au premier plan', async () => {
    jest.useFakeTimers();
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    const hook = await renderHook(() => usePublicProfiles(['alice']));
    await act(async () => undefined);
    const calls = jest.mocked(getPublicProfiles).mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(getPublicProfiles).toHaveBeenCalledTimes(calls);
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(getPublicProfiles).toHaveBeenCalledTimes(calls + 1);
    await hook.unmount();
    jest.useRealTimers();
  });
});

describe('suivi de présence partagé entre écrans', () => {
  // Le serveur ne garde qu'un `presence.suivre` par connexion (le dernier remplace les autres) et refuse
  // deux demandes à moins d'une seconde : un seul suivi, l'union de tous les écrans montés.
  afterEach(() => jest.useRealTimers());

  it('une seule demande pour deux écrans, puis de nouveau à chaque changement, espacée d’au moins 1,1 s', async () => {
    jest.useFakeTimers();
    const followPresence = jest.fn().mockResolvedValue(['alice']);
    mockRealtime = { ...fullRealtime(), followPresence };
    const liste = await renderHook(() => usePublicProfiles(['alice', 'bob']));
    const fiche = await renderHook(() => usePublicProfiles(['alice', 'carol']));
    await act(async () => { jest.advanceTimersByTime(0); });
    expect(followPresence).toHaveBeenCalledTimes(1);
    expect([...followPresence.mock.calls[0][0]].sort()).toEqual(['alice', 'bob', 'carol']);
    // Les deux écrans voient la même présence.
    expect(liste.result.current.alice.online).toBe(true);
    expect(fiche.result.current.alice.online).toBe(true);
    expect(liste.result.current.bob.online).toBe(false);

    // Fermer la fiche : la liste reste suivie, mais pas avant l'intervalle imposé par le serveur.
    await fiche.unmount();
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(followPresence).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(followPresence).toHaveBeenCalledTimes(2);
    expect([...followPresence.mock.calls[1][0]].sort()).toEqual(['alice', 'bob']);
    // Un événement concerne tous les écrans qui affichent la personne.
    await act(async () => handlers.get('presence.changed')!({ userId: 'bob', statut: 'en-ligne' }));
    expect(liste.result.current.bob.online).toBe(true);
    await liste.unmount();
    expect(offs.ready).toHaveBeenCalledTimes(1);
  });

  it('dernier écran fermé avant la demande : rien n’est envoyé, et un nouvel écran repart de zéro', async () => {
    jest.useFakeTimers();
    const followPresence = jest.fn().mockResolvedValue(['alice']);
    mockRealtime = { ...fullRealtime(), followPresence };
    const ephemere = await renderHook(() => usePublicProfiles(['alice']));
    await ephemere.unmount();
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(followPresence).not.toHaveBeenCalled();
    const ecran = await renderHook(() => usePublicProfiles(['alice']));
    await act(async () => { jest.advanceTimersByTime(0); });
    expect(followPresence).toHaveBeenCalledWith(['alice']);
    expect(ecran.result.current.alice.online).toBe(true);
    await ecran.unmount();
  });
});

describe('useReadReceipts', () => {
  const reader = { userId: 'bob', lastReadAt: null, lastReadMessageId: null };
  let appStateHandler: (value: string) => void;
  const remove = jest.fn();
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      appStateHandler = handler as (value: string) => void;
      return { remove } as never;
    });
    jest.mocked(getReaders).mockResolvedValue([reader]);
  });
  afterEach(() => jest.restoreAllMocks());

  it('lit les accusés puis les relit sur événement, reconnexion et retour au premier plan', async () => {
    const hook = await renderHook(() => useReadReceipts('dm:bob'));
    await waitFor(() => expect(hook.result.current).toEqual([reader]));
    await act(async () => handlers.get('read-state.updated')!());
    await act(async () => handlers.get('ready')!());
    await act(async () => appStateHandler('background'));
    expect(getReaders).toHaveBeenCalledTimes(3);
    await act(async () => appStateHandler('active'));
    expect(getReaders).toHaveBeenCalledTimes(4);
    await hook.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(offs.ready).toHaveBeenCalledTimes(1);
    expect(offs.subscribe).toHaveBeenCalledTimes(1);
  });

  it('ne montre aucun lecteur en cas d’échec, de réponse ancienne ou d’autre conversation', async () => {
    jest.mocked(getReaders).mockRejectedValueOnce(new Error('offline'));
    mockRealtime = undefined;
    const failing = await renderHook(() => useReadReceipts('dm:bob'));
    await act(async () => undefined);
    expect(failing.result.current).toEqual([]);

    mockRealtime = { subscribe: () => { throw new Error('non configuré'); } };
    let first!: (value: never) => void;
    jest.mocked(getReaders).mockImplementationOnce(() => new Promise(done => { first = done; }));
    const hook = await renderHook(({ id }: { id: string }) => useReadReceipts(id), { initialProps: { id: 'dm:bob' } });
    await act(async () => appStateHandler('active'));
    await act(async () => first([{ ...reader, userId: 'ancien' }] as never));
    expect(hook.result.current).toEqual([reader]);
    jest.mocked(getReaders).mockImplementationOnce(() => new Promise(() => undefined));
    await hook.rerender({ id: 'dm:carol' });
    expect(hook.result.current).toEqual([]);
  });
});
