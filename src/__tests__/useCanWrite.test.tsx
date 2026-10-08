import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCanWrite } from '@/hooks/useCanWrite';
import { getServer } from '@/services/rooms.service';
import { fetchServers } from '@/services/serversService';
jest.mock('@/services/rooms.service'); jest.mock('@/services/serversService');
const mockHandlers = new Map<string,(raw:unknown)=>void>();
const mockRealtime = { onReady: (handler:()=>void) => { mockHandlers.set('connexion.prete',handler); return () => mockHandlers.delete('connexion.prete'); }, subscribe: (event:string,handler:(raw:unknown)=>void) => { mockHandlers.set(event,handler); return () => mockHandlers.delete(event); } };
jest.mock('@/session/SessionContext',()=>({useSession:()=>({realtime:mockRealtime})}));
const room='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{jest.clearAllMocks();mockHandlers.clear();jest.mocked(fetchServers).mockResolvedValue([{id:'s',name:'S',memberCount:1,channelIds:[room],unreadCount:0}]);});
it('autorise un DM sans lire les serveurs',async()=>{const hook=await renderHook(()=>useCanWrite(`dm:${room}`));expect(hook.result.current).toBe(true);expect(fetchServers).not.toHaveBeenCalled();});
it.each([true,false])('utilise peutEcrire fourni par Room-Service (%s)',async allowed=>{jest.mocked(getServer).mockResolvedValue({salons:[{id:room,peutEcrire:allowed}]} as never);const hook=await renderHook(()=>useCanWrite(`room:${room}`));await waitFor(()=>expect(getServer).toHaveBeenCalled());expect(hook.result.current).toBe(allowed);});
it('ferme l’écriture si le salon est inaccessible ou si le réseau échoue',async()=>{jest.mocked(fetchServers).mockResolvedValue([]);const hook=await renderHook(()=>useCanWrite(`room:${room}`));await waitFor(()=>expect(fetchServers).toHaveBeenCalled());expect(hook.result.current).toBe(false);expect(getServer).not.toHaveBeenCalled();jest.mocked(fetchServers).mockRejectedValue(new Error('offline'));await act(async()=>mockHandlers.get('serveur.change')!({}));expect(hook.result.current).toBe(false);});
it('une réponse retardée ne rétablit pas les droits après révocation',async()=>{let finish!:(value:never)=>void;jest.mocked(getServer).mockReturnValue(new Promise(done=>{finish=done;}));const hook=await renderHook(()=>useCanWrite(`room:${room}`));await waitFor(()=>expect(getServer).toHaveBeenCalled());await act(async()=>{mockHandlers.get('room-message.revoked')!({roomId:room});finish({salons:[{id:room,peutEcrire:true}]} as never);});expect(hook.result.current).toBe(false);await hook.unmount();expect(mockHandlers.size).toBe(0);});

it('autorise admin avec une ancienne reponse sans peutEcrire', async () => {
  jest.mocked(getServer).mockResolvedValue({monRole:'admin',salons:[{id:room,ecriture:'moderateurs'}]} as never);
  const hook=await renderHook(()=>useCanWrite(`room:${room}`));
  await waitFor(()=>expect(hook.result.current).toBe(true));
});
it('relit les droits apres reconnexion', async () => {
  jest.mocked(getServer).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({monRole:'admin',salons:[{id:room,peutEcrire:true}]} as never);
  const hook=await renderHook(()=>useCanWrite(`room:${room}`));
  await waitFor(()=>expect(getServer).toHaveBeenCalledTimes(1));
  await act(async()=>mockHandlers.get('connexion.prete')!({}));
  await waitFor(()=>expect(hook.result.current).toBe(true));
});
