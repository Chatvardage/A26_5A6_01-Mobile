import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useConversations } from '@/hooks/useConversations';
import { ApiError } from '@/services/ApiError';
import * as service from '@/services/conversationsService';
import type { ConversationSummary } from '@/types/conversation';

jest.mock('@/services/conversationsService');
const fetchConversations = service.fetchConversations as jest.Mock;

const conv: ConversationSummary = { id: 'dm:x', kind: 'dm', title: 'alice', lastMessage: null, unreadCount: 2 };

beforeEach(() => fetchConversations.mockReset());

describe('useConversations', () => {
  it('passe de loading à ready', async () => {
    let resolve!: (value: ConversationSummary[]) => void;
    fetchConversations.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useConversations());
    expect(result.current.state.status).toBe('loading');
    await act(async () => resolve([conv]));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', conversations: [conv] }));
  });

  it('signale une liste vide', async () => {
    fetchConversations.mockResolvedValue([]);
    const { result } = await renderHook(() => useConversations());
    await waitFor(() => expect(result.current.state.status).toBe('empty'));
  });

  it('signale une erreur puis permet de réessayer', async () => {
    fetchConversations.mockRejectedValueOnce(new ApiError('network', 'x')).mockResolvedValueOnce([conv]);
    const { result } = await renderHook(() => useConversations());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.state.status).toBe('ready');
  });

  it("garde la liste affichée si un rafraîchissement échoue", async () => {
    fetchConversations.mockResolvedValueOnce([conv]).mockRejectedValueOnce(new ApiError('network', 'x'));
    const { result } = await renderHook(() => useConversations());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state.status).toBe('ready');
    expect(result.current.refreshing).toBe(false);
  });
});
