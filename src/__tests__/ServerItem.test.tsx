import { render, screen, userEvent } from '@testing-library/react-native';

import { ServerItem } from '@/components/ServerItem';
import type { ServerSummary } from '@/types/server';

it.each([0, 1, 3])('affiche les compteurs et leur accord avec %i non-lus', async (unreadCount) => {
  const server: ServerSummary = {
    id: 'server', name: 'Équipe', memberCount: unreadCount > 1 ? 2 : 1,
    channelIds: unreadCount > 1 ? ['one', 'two'] : ['one'], unreadCount,
  };
  const onPress = jest.fn();
  await render(<ServerItem server={server} onPress={onPress} />);
  const details = unreadCount > 1 ? '2 membres · 2 salons' : '1 membre · 1 salon';
  const suffix = unreadCount ? `, ${unreadCount} non lu${unreadCount > 1 ? 's' : ''}` : '';
  expect(screen.getByRole('button').props.accessibilityLabel).toBe(`Équipe, ${details}${suffix}`);
  expect(screen.getByText(details)).toBeTruthy();
  await userEvent.setup().press(screen.getByRole('button'));
  expect(onPress).toHaveBeenCalledWith(server);
});
