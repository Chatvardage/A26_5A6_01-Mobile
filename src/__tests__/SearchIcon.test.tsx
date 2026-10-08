import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { SearchIcon } from '@/components/SearchIcon';

const setPlatform = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
afterEach(() => setPlatform('ios'));

it('dessine la loupe sur Android et sur le web', async () => {
  setPlatform('android');
  await render(<SearchIcon color="#fff" />);
  expect(screen.getByTestId('search-icon-fallback')).toBeTruthy();
  setPlatform('web');
  await render(<SearchIcon color="#fff" size={30} />);
  expect(screen.getByTestId('search-icon-fallback')).toBeTruthy();
});

it('utilise le symbole système sur iOS', async () => {
  setPlatform('ios');
  await render(<SearchIcon color="#fff" />);
  expect(screen.queryByTestId('search-icon-fallback')).toBeNull();
});
