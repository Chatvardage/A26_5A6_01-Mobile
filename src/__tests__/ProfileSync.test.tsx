import { act, renderHook, waitFor } from '@testing-library/react-native';

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
