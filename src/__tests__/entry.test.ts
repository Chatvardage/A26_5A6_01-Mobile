import { registerRootComponent } from 'expo';
import App from '@/App';

jest.mock('expo', () => ({ registerRootComponent: jest.fn() }));

it('enregistre App comme point d’entrée Expo', () => {
  jest.requireActual('../../index');
  expect(registerRootComponent).toHaveBeenCalledWith(App);
});
