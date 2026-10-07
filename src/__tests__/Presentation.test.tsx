import { render, screen, fireEvent, userEvent } from '@testing-library/react-native';
import { MessageComposer } from '@/components/MessageComposer';
import { MessageBubble } from '@/components/MessageBubble';
import { ServerItem } from '@/components/ServerItem';
import { ThemedText } from '@/components/themed-text';
import { LoadingState } from '@/components/StateViews';
import { formatMessageTime } from '@/utils/formatTime';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
it('garde le champ utilisable mais désactive l’envoi sans gestionnaire', async () => {
  await render(<MessageComposer />);
  const input = screen.getByPlaceholderText('Envoi bientôt disponible');
  await fireEvent.changeText(input, 'bonjour');
  await fireEvent.press(screen.getByLabelText('Envoyer'));
  expect(input.props.value).toBe('bonjour');
  expect(screen.getByLabelText('Envoyer')).toBeDisabled();
});

it('envoie le texte nettoyé et vide le champ, sans permettre les espaces seuls', async () => {
  const onSend = jest.fn();
  await render(<MessageComposer onSend={onSend} />);
  await fireEvent.changeText(screen.getByLabelText('Message'), '   ');
  await fireEvent.press(screen.getByLabelText('Envoyer'));
  expect(onSend).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Message'), ' bonjour ');
  await userEvent.setup().press(screen.getByLabelText('Envoyer'));
  expect(onSend).toHaveBeenCalledWith('bonjour');
  expect(screen.getByLabelText('Message').props.value).toBe('');
});
it.each([0, 1, 3])('affiche les accords et transmet le serveur avec %s non-lus', async (unreadCount) => {
  const server = {
    id: 's',
    name: 'Équipe',
    channelIds: unreadCount === 3 ? ['a', 'b'] : ['a'],
    memberCount: unreadCount,
    unreadCount,
  };
  const onPress = jest.fn();
  await render(<ServerItem server={server} onPress={onPress} />);
  const button = screen.getByRole('button');
  expect(button.props.accessibilityLabel).toContain(
    unreadCount === 3 ? '3 membres · 2 salons' : `${unreadCount} membre · 1 salon`,
  );
  await userEvent.setup().press(button);
  expect(onPress).toHaveBeenCalledWith(server);
});
it.each([
  [false, true, undefined, true],
  [false, true, 'alice', false],
  [true, true, 'alice', false],
  [false, false, 'alice', false],
])('affiche auteur et modification selon le message (%s,%s,%s,%s)', async (mine, showAuthor, senderName, edited) => {
  const createdAt = '2026-10-01T10:00:00Z';
  await render(
    <MessageBubble
      mine={mine}
      showAuthor={showAuthor}
      message={{
        id: 'm',
        senderId: 'u',
        senderName,
        content: 'Bonjour',
        createdAt,
        updatedAt: edited ? '2026-10-02T10:00:00Z' : createdAt,
      }}
    />,
  );
  expect(screen.getByText('Bonjour')).toBeTruthy();
  if (showAuthor && !mine) expect(screen.getByText(senderName ?? 'Utilisateur inconnu')).toBeTruthy();
  else expect(screen.queryByText('alice')).toBeNull();
  expect(Boolean(screen.queryByText(/modifié/))).toBe(edited);
});
it('affiche toutes les variantes de texte et le chargement par défaut', async () => {
  await render(
    <>
      <LoadingState />
      {(['default', 'title', 'small', 'smallBold', 'subtitle', 'link', 'linkPrimary', 'code'] as const).map((type) => (
        <ThemedText key={type} type={type}>
          {type}
        </ThemedText>
      ))}
    </>,
  );
  expect(screen.getByLabelText('Chargement…')).toBeTruthy();
  expect(screen.getByText('code')).toBeTruthy();
});
it('formate une date invalide, le jour courant et une autre année', () => {
  const now = new Date(2026, 9, 5, 12, 0);
  expect(formatMessageTime('invalid', now)).toBe('');
  expect(formatMessageTime(new Date(2026, 9, 5, 9, 3).toISOString(), now)).toBe('09:03');
  expect(formatMessageTime(new Date(2025, 9, 5).toISOString(), now)).toBe('05/10');
});
