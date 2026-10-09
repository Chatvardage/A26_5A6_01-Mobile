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
it('garde la saisie ouverte pendant la relecture déclenchée par serveur.change', async () => {
  jest.mocked(getServer).mockResolvedValue({salons:[{id:room,peutEcrire:true}]} as never);
  const hook=await renderHook(()=>useCanWrite(`room:${room}`));
  await waitFor(()=>expect(hook.result.current).toBe(true));
  let finish!:(value:never)=>void;
  jest.mocked(getServer).mockReturnValueOnce(new Promise(done=>{finish=done;}));
  await act(async()=>mockHandlers.get('serveur.change')!({}));
  expect(getServer).toHaveBeenCalledTimes(2);
  expect(hook.result.current).toBe(true);
  await act(async()=>finish({salons:[{id:room,peutEcrire:false}]} as never));
  expect(hook.result.current).toBe(false);
});
it.each([
  ['un membre si le salon est ouvert à tous', 'membre', 'tous', true],
  ['un membre si le salon est réservé aux modérateurs', 'membre', 'moderateurs', false],
  ['un non-membre même si le salon est ouvert à tous', null, 'tous', false],
])('sans peutEcrire, autorise %s', async (_label, monRole, ecriture, allowed) => {
  jest.mocked(getServer).mockResolvedValue({ monRole, salons: [{ id: room, ecriture }] } as never);
  const hook = await renderHook(() => useCanWrite(`room:${room}`));
  await waitFor(() => expect(getServer).toHaveBeenCalled());
  await act(async () => undefined);
  expect(hook.result.current).toBe(allowed);
});
it('ignore une révocation d’un autre salon ou mal formée', async () => {
  jest.mocked(getServer).mockResolvedValue({ salons: [{ id: room, peutEcrire: true }] } as never);
  const hook = await renderHook(() => useCanWrite(`room:${room}`));
  await waitFor(() => expect(hook.result.current).toBe(true));
  for (const raw of [null, 'texte', {}, { roomId: 'autre' }]) await act(async () => mockHandlers.get('room-message.revoked')!(raw));
  expect(hook.result.current).toBe(true);
});
it('lit les droits sans canal temps réel et ignore une réponse arrivée après le démontage', async () => {
  const subscribe = jest.spyOn(mockRealtime, 'subscribe').mockImplementation(() => { throw new Error('non configuré'); });
  let finish!: (value: never) => void;
  jest.mocked(getServer).mockReturnValueOnce(new Promise(done => { finish = done; }));
  const pending = await renderHook(() => useCanWrite(`room:${room}`));
  await waitFor(() => expect(getServer).toHaveBeenCalled());
  await pending.unmount();
  await act(async () => finish({ salons: [{ id: room, peutEcrire: true }] } as never));
  let fail!: (error: Error) => void;
  jest.mocked(fetchServers).mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
  const failing = await renderHook(() => useCanWrite(`room:${room}`));
  await failing.unmount();
  await act(async () => fail(new Error('offline')));
  expect(failing.result.current).toBe(false);
  subscribe.mockRestore();
});
