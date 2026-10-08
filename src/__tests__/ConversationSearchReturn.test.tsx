import { act, render, screen, waitFor } from '@testing-library/react-native';
import { FlatList } from 'react-native';

import { ConversationScreen } from '@/screens/ConversationScreen';
import { fetchHistory } from '@/services/messagesService';
import type { ChatMessage } from '@/types/conversation';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 40 }));
jest.mock('@/hooks/usePublicProfiles', () => ({ usePublicProfiles: () => ({}) }));
jest.mock('@/hooks/useReadReceipts', () => ({ useReadReceipts: () => [] }));
jest.mock('@/hooks/useCanWrite', () => ({ useCanWrite: () => true }));
jest.mock('@/hooks/useCanModerate', () => ({ useCanModerate: () => false }));
jest.mock('@/services/receipts.service', () => ({ confirmDelivery: jest.fn(async () => undefined) }));
jest.mock('@/services/usersService', () => ({ lookupPseudos: jest.fn(async () => ({})) }));
jest.mock('@/services/messagesService', () => ({
  ...jest.requireActual('@/services/messagesService'),
  fetchHistory: jest.fn(),
}));
const mockRealtime = {
  getRealtimeState: () => 'ready',
  joinRoom: async () => undefined,
  leaveRoom: async () => undefined,
  onConnectionState: () => () => undefined,
  onReady: () => () => undefined,
  subscribe: () => () => undefined,
};
jest.mock('@/session/SessionContext', () => ({
  useSession: () => ({ user: { id: 'me' }, drafts: new Map(), realtime: mockRealtime }),
}));
const ID = '22222222-2222-4222-8222-222222222222';
const TARGET = '44444444-4444-4444-8444-444444444444';
const message = (id: string): ChatMessage => ({
  id, senderId: ID, content: `texte ${id}`,
  createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
});
const props = (kind: string, messageId?: string, focusToken?: number) => ({
  route: { params: { conversationId: `${kind}:${ID}`, messageId, focusToken } },
}) as unknown as Parameters<typeof ConversationScreen>[0];

it.each(['dm', 'room'])('ouvre un résultat dans la conversation %s déjà montée sans rester en chargement', async (kind) => {
  jest.mocked(fetchHistory).mockReset().mockResolvedValueOnce([message('recent')]);
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
  try {
    const view = await render(<ConversationScreen {...props(kind)} />);
    await waitFor(() => expect(screen.getByText('texte recent')).toBeTruthy());
    let resolve!: (messages: ChatMessage[]) => void;
    jest.mocked(fetchHistory).mockImplementation(() => new Promise(done => { resolve = done; }));
    await view.rerender(<ConversationScreen {...props(kind, TARGET, 1)} />);
    await act(async () => resolve([message(TARGET)]));
    await waitFor(() => expect(screen.getByText(`texte ${TARGET}`)).toBeTruthy());
    expect(screen.queryByText('Chargement des messages…')).toBeNull();
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    expect(fetchHistory).toHaveBeenLastCalledWith(`${kind}:${ID}`, 50, undefined, { around: TARGET });
    expect(scroll).toHaveBeenCalledWith({ index: 0, viewPosition: 0.5, animated: false });
    await view.rerender(<ConversationScreen {...props(kind, TARGET, 2)} />);
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    await view.unmount();
  } finally {
    scroll.mockRestore();
  }
});
