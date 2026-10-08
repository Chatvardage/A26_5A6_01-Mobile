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

  it('limite la largeur sur l’enfant direct de la ligne pour ne pas couper les mots', async () => {
    const sentence = 'Bonjour, voici une phrase complète qui doit se couper entre les mots.';
    const { rerender } = await render(
      <MessageBubble message={{ ...message, content: sentence }} mine showAuthor={false} onLongPress={jest.fn()} />,
    );
    expect(screen.getByTestId('message-content')).toHaveStyle({ maxWidth: '80%', flexShrink: 1 });
    expect(screen.getByTestId('message-bubble')).not.toHaveStyle({ maxWidth: '80%' });

    await rerender(<MessageBubble message={{ ...message, content: sentence }} mine={false} showAuthor={false} />);
    expect(screen.getByTestId('message-content')).toHaveStyle({ maxWidth: '80%', flexShrink: 1 });
  });

  it('identifie explicitement un auteur dont le pseudo n’a pas été résolu', async () => {
    await render(<MessageBubble message={{ ...message, senderName: undefined }} mine={false} showAuthor />);
    expect(screen.getByText('Utilisateur inconnu')).toBeTruthy();
    expect(screen.getByText('Contenu')).toBeTruthy();
  });

  it("rend le message d'un autre appuyable seulement pour la modération", async () => {
    const onLongPress = jest.fn();
    const view = await render(<MessageBubble message={message} mine={false} showAuthor moderated onLongPress={onLongPress} />);
    await fireEvent(screen.getByRole('button', { name: 'Contenu' }), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Contenu' }).props.accessibilityHint).toBe('Appui long : supprimer (modération)');
    await view.rerender(<MessageBubble message={message} mine={false} showAuthor moderated={false} onLongPress={onLongPress} />);
    expect(screen.queryByRole('button', { name: 'Contenu' })).toBeNull();
    await view.rerender(<MessageBubble message={message} mine={false} showAuthor moderated />);
    expect(screen.queryByRole('button', { name: 'Contenu' })).toBeNull();
  });
});

it('aligne l avatar au debut de la bulle plutot qu au pied des accuses', async () => {
  await render(<MessageBubble message={message} mine={false} showAuthor readerCount={3} />);
  expect(screen.getByTestId('message-row')).toHaveStyle({alignItems:'flex-start'});
});
