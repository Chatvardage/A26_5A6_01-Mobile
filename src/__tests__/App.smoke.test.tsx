import { render, screen } from '@testing-library/react-native';

import App from '@/App';

// SafeAreaProvider ne rend rien sans les mesures natives : on utilise le mock officiel.
jest.mock('react-native-safe-area-context', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-safe-area-context/jest/mock').default,
);

describe('App', () => {
  it("affiche l'écran de connexion sans session", async () => {
    await render(<App />);
    expect(screen.getByText('Se connecter')).toBeTruthy();
  });
});
