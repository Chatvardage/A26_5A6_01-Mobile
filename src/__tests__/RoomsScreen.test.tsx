import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { RoomsScreen } from '@/screens/RoomsScreen';

it('l’accueil donne accès aux serveurs, messages privés, recherche et paramètres', async () => {
  const navigate = jest.fn();
  const props = { navigation: { navigate } } as unknown as ComponentProps<typeof RoomsScreen>;
  await render(<RoomsScreen {...props} />);
  const labels = ['Serveurs', 'Messages priv\u00e9s', 'Recherche', 'Param\u00e8tres'];
  const routes = ['Servers', 'DirectMessages', 'Search', 'Preferences'];
  for (const [index, label] of labels.entries()) {
    await fireEvent.press(screen.getByRole('button', { name: label }));
    expect(navigate).toHaveBeenLastCalledWith(routes[index]);
  }
});
