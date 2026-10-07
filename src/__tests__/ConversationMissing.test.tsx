import { act, render } from '@testing-library/react-native';
import { FlatList } from 'react-native';

import { ConversationScreen } from '@/screens/ConversationScreen';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 40 }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' } }) }));
jest.mock('@/hooks/useConversationHistory', () => ({
  useConversationHistory: () => ({
    state: {
      status: 'ready',
      data: [{ id: 'a', senderId: 'u', content: 'x', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' }],
    },
    retry: jest.fn(),
    jumpTo: jest.fn(async () => true),
  }),
}));

it("ne défile pas si le message trouvé n'est plus dans la liste affichée", async () => {
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
  const props = {
    route: { params: { conversationId: 'dm:22222222-2222-4222-8222-222222222222', messageId: '44444444-4444-4444-8444-444444444444' } },
  } as unknown as Parameters<typeof ConversationScreen>[0];
  await render(<ConversationScreen {...props} />);
  await act(async () => undefined);
  expect(scroll).not.toHaveBeenCalled();
  scroll.mockRestore();
});
