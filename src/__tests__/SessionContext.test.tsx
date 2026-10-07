import { render, renderHook, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SessionProvider, useSession } from '@/session/SessionContext';
import { storage } from '@/session/storage.adapter';
jest.mock('@/session/storage.adapter', () => ({ storage: { load: jest.fn(), save: jest.fn(), clear: jest.fn() } }));
function Consumer() {
  const session = useSession();
  return <Text>{session.status}</Text>;
}
it('exposes loading until storage has completed, then signedOut', async () => {
  let resolve!: (value: null) => void;
  jest.mocked(storage.load).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = await render(
    <SessionProvider>
      <Consumer />
    </SessionProvider>,
  );
  expect(screen.getByText('loading')).toBeTruthy();
  resolve(null);
  expect(await screen.findByText('signedOut')).toBeTruthy();
  await view.unmount();
});
it('requires a provider', async () => {
  await expect(renderHook(() => useSession())).rejects.toThrow('SessionProvider');
});
