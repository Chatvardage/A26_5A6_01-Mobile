import { apiFetch } from '@/services/httpClient';
import { getProfile, updateProfile, updatePresence } from '@/services/profileService';
jest.mock('@/services/httpClient');
it('lit, met à jour les paramètres et retire l’avatar avec la chaîne vide contractuelle', async () => {
  await getProfile(); await updateProfile({ alias: 'Ari', langue:'fr', theme:'clair', modeNotification:'aucune' }); await updateProfile({ avatar:null }); await updatePresence('horsLigne');
  expect(jest.mocked(apiFetch).mock.calls).toEqual([
    ['/api/config-utilisateur'],
    ['/api/config-utilisateur',{method:'PATCH',body:'{"alias":"Ari","langue":"fr","theme":"clair","modeNotification":"aucune"}'}],
    ['/api/config-utilisateur',{method:'PATCH',body:'{"avatar":""}'}],
    ['/api/config-utilisateur/presence',{method:'PUT',body:'{"statut":"horsLigne"}'}],
  ]);
});
