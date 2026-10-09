import { fireEvent, render, screen } from '@testing-library/react-native';

import { UserAvatar } from '@/components/UserAvatar';

it('affiche la photo, puis l’initiale si elle ne se charge pas, avec la présence', async () => {
  const view = await render(<UserAvatar avatar="https://exemple.test/a.png" name="alice" online />);
  expect(screen.getByLabelText('alice, En ligne')).toBeTruthy();
  const photo = screen.getByLabelText('alice');
  expect(photo.props.source).toEqual({ uri: 'https://exemple.test/a.png' });
  await fireEvent(photo, 'error');
  expect(screen.queryByLabelText('alice')).toBeNull();
  expect(screen.getByTestId('presence-dot')).toHaveStyle({ backgroundColor: '#29bb77' });
  // Une nouvelle adresse est de nouveau tentée.
  await view.rerender(<UserAvatar avatar="https://exemple.test/b.png" name="alice" />);
  expect(screen.getByLabelText('alice').props.source).toEqual({ uri: 'https://exemple.test/b.png' });
  expect(screen.getByLabelText('alice, Hors ligne')).toBeTruthy();
  expect(screen.getByTestId('presence-dot')).not.toHaveStyle({ backgroundColor: '#29bb77' });
});
