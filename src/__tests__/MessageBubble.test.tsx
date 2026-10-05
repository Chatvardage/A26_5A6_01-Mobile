import { fireEvent, render, screen } from '@testing-library/react-native';

import { MessageBubble } from '@/components/MessageBubble';
import type { ChatMessage } from '@/types/conversation';

const message: ChatMessage = {
  id: 'message-id',
  senderId: 'user-id',
  senderName: 'Alice',
  content: 'Contenu',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

describe('MessageBubble', () => {
  it('affiche « modifié » seulement si les instants diffèrent', async () => {
    const { rerender } = await render(<MessageBubble message={message} mine showAuthor={false} />);
    expect(screen.queryByText(/modifié/)).toBeNull();

    await rerender(<MessageBubble message={{ ...message, updatedAt: '2026-10-01T06:00:00-04:00' }} mine showAuthor={false} />);
    expect(screen.queryByText(/modifié/)).toBeNull();

    await rerender(<MessageBubble message={{ ...message, updatedAt: '2026-10-01T10:00:01.000Z' }} mine showAuthor={false} />);
    expect(screen.getByText(/modifié/)).toBeTruthy();
    expect(screen.getByLabelText(/modifié/)).toBeTruthy();
  });

  it('propose l’appui long uniquement pour son propre message', async () => {
    const onLongPress = jest.fn();
    const { rerender } = await render(<MessageBubble message={message} mine showAuthor={false} onLongPress={onLongPress} />);
    await fireEvent(screen.getByRole('button', { name: 'Contenu' }), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);

    await rerender(<MessageBubble message={message} mine={false} showAuthor onLongPress={onLongPress} />);
    expect(screen.queryByRole('button', { name: 'Contenu' })).toBeNull();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('identifie explicitement un auteur dont le pseudo n’a pas été résolu', async () => {
    await render(<MessageBubble message={{ ...message, senderName: undefined }} mine={false} showAuthor />);
    expect(screen.getByText('Utilisateur inconnu')).toBeTruthy();
    expect(screen.getByText('Contenu')).toBeTruthy();
  });
});
