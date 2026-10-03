import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConversationItem, unreadLabel } from '@/components/ConversationItem';
import type { ConversationSummary } from '@/types/conversation';

const base: ConversationSummary = {
  id: 'dm:abc',
  kind: 'dm',
  title: 'alice',
  lastMessage: { id: 'm', senderId: 'u2', content: 'salut', createdAt: '2026-10-01T10:00:00Z' },
  unreadCount: 0,
};

describe('ConversationItem', () => {
  it('affiche le dernier message sans pastille quand tout est lu', async () => {
    await render(<ConversationItem conversation={base} onPress={jest.fn()} />);
    expect(screen.getByText('salut')).toBeTruthy();
    expect(screen.queryByTestId('unread-badge')).toBeNull();
  });

  it('affiche la pastille de non-lus', async () => {
    await render(<ConversationItem conversation={{ ...base, unreadCount: 4 }} onPress={jest.fn()} />);
    expect(screen.getByTestId('unread-badge')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('préfixe « Vous : » pour son propre message', async () => {
    await render(<ConversationItem conversation={base} currentUserId="u2" onPress={jest.fn()} />);
    expect(screen.getByText('Vous : salut')).toBeTruthy();
  });

  it("transmet la conversation (donc son identifiant) à l'appui", async () => {
    const onPress = jest.fn();
    await render(<ConversationItem conversation={base} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledWith(base);
  });

  it('plafonne le compteur à 99+', async () => {
    expect(unreadLabel(120)).toBe('99+');
    expect(unreadLabel(7)).toBe('7');
  });
});
