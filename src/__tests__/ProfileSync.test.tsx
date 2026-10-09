import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { ProfileProvider, useProfile } from '@/profile/ProfileContext';
import { getProfile, updatePresence, type Profile } from '@/services/profileService';

const handlers = new Map<string, (raw: unknown) => void>();
const off = jest.fn();
const mockRealtime = {
  subscribe: jest.fn((event: string, handler: (raw: unknown) => void) => { handlers.set(event, handler); return off; }),
  onReady: jest.fn(() => jest.fn()),
  publishPresence: jest.fn(),
  publishProfile: jest.fn(),
};
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ status: 'signedIn', user: { id: 'alice' }, realtime: mockRealtime }) }));
jest.mock('@/services/profileService');

const profile: Profile = { idUtilisateur: 'alice', alias: 'Ari', avatar: null, theme: 'sombre', langue: 'fr', statutPresence: 'enLigne', modeNotification: 'systeme' };
beforeEach(() => {
  jest.clearAllMocks();
  handlers.clear();
  jest.mocked(getProfile).mockResolvedValue(profile);
  jest.mocked(updatePresence).mockResolvedValue({ ...profile, statutPresence: 'horsLigne' });
});

it('relit mon profil quand il change sur un autre appareil, pas pour celui des autres', async () => {
  const hook = await renderHook(() => useProfile(), { wrapper: ProfileProvider });
  await waitFor(() => expect(hook.result.current.profile).toEqual(profile));
  jest.mocked(getProfile).mockResolvedValue({ ...profile, alias: 'Nouvel alias', avatar: 'data:image/png;base64,AA', statutPresence: 'horsLigne' });
  await act(async () => handlers.get('profil.changed')!({ userId: 'bob' }));
  await act(async () => handlers.get('profil.changed')!(null));
  expect(getProfile).toHaveBeenCalledTimes(1);
  await act(async () => handlers.get('profil.changed')!({ userId: 'alice' }));
  expect(hook.result.current.profile).toMatchObject({ alias: 'Nouvel alias', avatar: 'data:image/png;base64,AA', statutPresence: 'horsLigne' });
  await hook.unmount();
  expect(off).toHaveBeenCalled();
});

it('annonce un changement de présence à mes autres appareils', async () => {
  const hook = await renderHook(() => useProfile(), { wrapper: ProfileProvider });
  await waitFor(() => expect(hook.result.current.profile).toEqual(profile));
  await act(async () => hook.result.current.presence('horsLigne'));
  expect(mockRealtime.publishPresence).toHaveBeenCalledWith('hors-ligne');
  expect(mockRealtime.publishProfile).toHaveBeenCalled();
});

it('se passe du canal temps réel s’il n’est pas prêt', async () => {
  mockRealtime.subscribe.mockImplementationOnce(() => { throw new Error('non configuré'); });
  const hook = await renderHook(() => useProfile(), { wrapper: ProfileProvider });
  await waitFor(() => expect(hook.result.current.profile).toEqual(profile));
});

it('publie la présence choisie et la présence enregistrée à chaque connexion prête', async () => {
  let ready!: () => void;
  mockRealtime.onReady.mockImplementationOnce(((handler: () => void) => { ready = handler; return jest.fn(); }) as never);
  const hook = await renderHook(() => useProfile(), { wrapper: ProfileProvider });
  await waitFor(() => expect(hook.result.current.profile).toEqual(profile));
  await act(async () => ready());
  expect(mockRealtime.publishPresence).toHaveBeenLastCalledWith('en-ligne');
  jest.mocked(updatePresence).mockResolvedValueOnce(profile);
  await act(async () => hook.result.current.presence('enLigne'));
  expect(mockRealtime.publishPresence).toHaveBeenLastCalledWith('en-ligne');
  await act(async () => hook.result.current.presence('horsLigne'));
  expect(mockRealtime.publishPresence).toHaveBeenLastCalledWith('hors-ligne');
  await act(async () => ready());
  expect(mockRealtime.publishPresence).toHaveBeenLastCalledWith('hors-ligne');
});

it('un signe de vie refusé par le serveur reste silencieux ; le passage en arrière-plan ne relit rien', async () => {
  jest.useFakeTimers();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  const listen = jest.spyOn(AppState, 'addEventListener');
  const hook = await renderHook(() => useProfile(), { wrapper: ProfileProvider });
  await act(async () => undefined);
  expect(hook.result.current.profile).toEqual(profile);
  jest.mocked(updatePresence).mockRejectedValueOnce(new Error('offline'));
  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(updatePresence).toHaveBeenCalledWith('enLigne');
  expect(hook.result.current.error).toBeNull();
  const onChange = listen.mock.calls.find(([event]) => event === 'change')![1];
  await act(async () => onChange('background'));
  expect(getProfile).toHaveBeenCalledTimes(1);
  await hook.unmount();
  listen.mockRestore();
  jest.useRealTimers();
});

it('hors d’un ProfileProvider, le contexte par défaut ne fait rien', async () => {
  const hook = await renderHook(() => useProfile());
  expect(hook.result.current).toMatchObject({ profile: null, loading: false, error: null });
  await act(async () => {
    await hook.result.current.reload();
    await hook.result.current.save({ langue: 'en' });
    await hook.result.current.presence('enLigne');
  });
  expect(getProfile).not.toHaveBeenCalled();
});
