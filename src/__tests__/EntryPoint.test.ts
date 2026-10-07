import { registerRootComponent } from 'expo';
import App from '@/App';
import '../../index';

jest.mock('expo', () => ({ registerRootComponent: jest.fn() }));
it('registers the actual app component with Expo', () => {
  expect(registerRootComponent).toHaveBeenCalledTimes(1);
  expect(registerRootComponent).toHaveBeenCalledWith(App);
});
