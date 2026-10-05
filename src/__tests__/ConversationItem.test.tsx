import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { ConversationItem } from '@/components/ConversationItem';
import { unreadLabel } from '@/components/UnreadBadge';
import type { ConversationSummary } from '@/types/conversation';

const base: ConversationSummary = {
  id: 'dm:abc',
  kind: 'dm',
  title: 'alice',
  lastMessage: { id: 'm', senderId: 'u2', content: 'salut', createdAt: '2026-10-01T10:00:00Z' },
  unreadCount: 0,
};

describe('ConversationItem', () => {
  it('affiche un sous-titre et le feedback pendant un appui réel', async () => {
    const onPress = jest.fn();
    await render(<ConversationItem conversation={{ ...base, subtitle: 'Salon public' }} onPress={onPress} />);
    expect(screen.getByText('Salon public')).toBeTruthy();
    await userEvent.setup().press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ subtitle: 'Salon public' }));
  });
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

describe('ConversationItem accessibilité', () => {
  it.each([
    [1, '1 non lu.'],
    [3, '3 non lus.'],
  ])('accorde « non lu » pour %i message(s)', async (unreadCount, expected) => {
    await render(<ConversationItem conversation={{ ...base, unreadCount }} onPress={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityLabel).toContain(expected);
  });
});
