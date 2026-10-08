import { apiFetch } from '@/services/httpClient';
import { confirmDelivery, getReaders, hasRead, type Reader } from '@/services/receipts.service';
jest.mock('@/services/httpClient');
const room = '11111111-1111-4111-8111-111111111111';
const reader: Reader = {userId:'bob',lastReadAt:'2026-10-08T10:00:00Z',lastReadMessageId:'m2'};
beforeEach(() => jest.clearAllMocks());
it('confirme la reception par l app via la route authentifiee', async () => {
  await confirmDelivery('m/a');
  expect(apiFetch).toHaveBeenCalledWith('/api/messages/m%2Fa/delivered',{method:'PUT'});
});
it('propage le refus d une confirmation', async () => {
  const failure = new Error('403'); jest.mocked(apiFetch).mockRejectedValueOnce(failure);
  await expect(confirmDelivery('m')).rejects.toBe(failure);
});
it('lit les etats du destinataire et des membres du salon', async () => {
  jest.mocked(apiFetch).mockResolvedValueOnce(reader).mockResolvedValueOnce({lecteurs:[reader]});
  expect(await getReaders('dm:'+room)).toEqual([reader]);
  expect(await getReaders('room:'+room)).toEqual([reader]);
  expect(apiFetch).toHaveBeenLastCalledWith('/api/messages/rooms/'+room+'/read-states');
});
it('refuse une conversation invalide sans requete', async () => {
  await expect(getReaders('invalid')).rejects.toMatchObject({kind:'not_found'});
  expect(apiFetch).not.toHaveBeenCalled();
});
it('compare date et identifiant sans confondre les messages simultanes', () => {
  expect(hasRead(reader,{id:'m1',createdAt:reader.lastReadAt!})).toBe(true);
  expect(hasRead(reader,{id:'m3',createdAt:reader.lastReadAt!})).toBe(false);
  expect(hasRead(reader,{id:'m4',createdAt:'2026-10-08T09:59:00Z'})).toBe(true);
  expect(hasRead(reader,{id:'m0',createdAt:'2026-10-08T10:01:00Z'})).toBe(false);
  expect(hasRead({...reader,lastReadMessageId:null},{id:'m3',createdAt:reader.lastReadAt!})).toBe(true);
  expect(hasRead({...reader,lastReadAt:null},{id:'m1',createdAt:reader.lastReadAt!})).toBe(false);
});
