import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, renderHook, screen, userEvent, waitFor } from '@testing-library/react-native';

import { loadDraft } from '@/adapters/drafts.adapter';
import { subscribeToNetwork } from '@/adapters/network.adapter';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { MessageComposer } from '@/components/MessageComposer';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnection } from '@/hooks/useConnection';
import { useDraft } from '@/hooks/useDraft';
import { getRealtimeState, onConnectionState, type RealtimeState } from '@/services/websocketService';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/adapters/network.adapter');
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: jest.fn(() => 'light') }));
jest.mock('@/services/websocketService');

let setNetwork: (online: boolean) => void;
let realtime: RealtimeState;
const realtimeListeners = new Set<() => void>();
const setRealtime = (state: RealtimeState) => act(async () => {
  realtime = state;
  realtimeListeners.forEach((l) => l());
});

beforeEach(async () => {
  await AsyncStorage.clear();
  realtime = 'ready';
  realtimeListeners.clear();
  jest.mocked(subscribeToNetwork).mockImplementation((listener) => {
    setNetwork = listener;
    return () => undefined;
  });
  jest.mocked(getRealtimeState).mockImplementation(() => realtime);
  jest.mocked(onConnectionState).mockImplementation(((handler: (s: RealtimeState) => void) => {
    const listener = () => handler(realtime);
    realtimeListeners.add(listener);
    return () => realtimeListeners.delete(listener);
  }) as never);
});

describe('useConnection / ConnectionStatus', () => {
  it('suit le réseau et le canal temps réel', async () => {
    const hook = await renderHook(() => useConnection());
    expect(hook.result.current).toEqual({ status: 'online', online: true });
    await setRealtime('connecting');
    expect(hook.result.current.status).toBe('reconnecting');
    await setRealtime('disconnected');
    expect(hook.result.current.status).toBe('reconnecting');
    await act(async () => setNetwork(false));
    expect(hook.result.current).toEqual({ status: 'offline', online: false });
    await act(async () => setNetwork(true));
    await setRealtime('ready');
    expect(hook.result.current.online).toBe(true);
  });

  it("n'affiche rien en ligne, puis le bandeau hors connexion et de reconnexion", async () => {
    await render(<ConnectionStatus />);
    expect(screen.queryByTestId('connection-status')).toBeNull();
    await act(async () => setNetwork(false));
    expect(screen.getByText(/Hors connexion/)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    await act(async () => setNetwork(true));
    await setRealtime('connecting');
    expect(screen.getByText('Reconnexion en cours…')).toBeTruthy();
    await setRealtime('ready');
    expect(screen.queryByTestId('connection-status')).toBeNull();
  });
});

it('reprend les couleurs d\'état du client Web en thème sombre', async () => {
  jest.mocked(useColorScheme).mockReturnValue('dark');
  await render(<ConnectionStatus />);
  await act(async () => setNetwork(false));
  expect(screen.getByTestId('connection-status').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ backgroundColor: '#ef4444' })]),
  );
  jest.mocked(useColorScheme).mockReturnValue('light');
});

describe('useDraft', () => {
  it('restaure le brouillon enregistré et le conserve à chaque frappe', async () => {
      await AsyncStorage.setItem('chatvardage:draft:dm:a', 'texte gardé');
    const hook = await renderHook(() => useDraft('dm:a'));
    await waitFor(() => expect(hook.result.current.text).toBe('texte gardé'));
    await act(async () => hook.result.current.setText('modifié'));
    expect(await loadDraft('dm:a')).toBe('modifié');
    await act(async () => hook.result.current.clear());
    expect(hook.result.current.text).toBe('');
    expect(await loadDraft('dm:a')).toBe('');
  });

  it("n'écrase pas un texte saisi avant la fin de la lecture", async () => {
      await AsyncStorage.setItem('chatvardage:draft:dm:a', 'ancien');
    const hook = await renderHook(() => useDraft('dm:a'));
    await act(async () => hook.result.current.setText('nouveau'));
    await act(async () => undefined);
    expect(hook.result.current.text).toBe('nouveau');
  });

  it('ignore la lecture terminée après le démontage du composant', async () => {
    let resolve: (value: string) => void = () => undefined;
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const hook = await renderHook(() => useDraft('dm:a'));
    await hook.unmount();
    await act(async () => resolve('tardif'));
    expect(hook.result.current.text).toBe('');
  });
});

describe('MessageComposer', () => {
  const type = (text: string) => fireEvent.changeText(screen.getByLabelText('Message'), text);

  it('conserve le texte et affiche une erreur quand l\'envoi échoue, puis le vide au succès', async () => {
    const onSend = jest.fn().mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(undefined);
    await render(<MessageComposer conversationId="dm:a" onSend={onSend} />);
    await type(' bonjour ');
    await userEvent.setup().press(screen.getByLabelText('Envoyer'));
    expect(onSend).toHaveBeenCalledWith('bonjour');
    expect(screen.getByText('Message non envoyé. Votre texte est conservé, réessayez.')).toBeTruthy();
    expect(screen.getByLabelText('Message').props.value).toBe(' bonjour ');
    expect(await loadDraft('dm:a')).toBe(' bonjour ');

    await userEvent.setup().press(screen.getByLabelText('Envoyer'));
    await waitFor(() => expect(screen.getByLabelText('Message').props.value).toBe(''));
    expect(screen.queryByText(/non envoyé/)).toBeNull();
    expect(await loadDraft('dm:a')).toBe('');
  });

  it("retrouve le texte non envoyé après un redémarrage de l'écran", async () => {
    const onSend = jest.fn().mockRejectedValue(new Error('hors ligne'));
    const first = await render(<MessageComposer conversationId="room:b" onSend={onSend} />);
    await type('à renvoyer');
    await userEvent.setup().press(screen.getByLabelText('Envoyer'));
    await first.unmount();
    await render(<MessageComposer conversationId="room:b" onSend={onSend} />);
    await waitFor(() => expect(screen.getByLabelText('Message').props.value).toBe('à renvoyer'));
  });

  it("efface l'erreur dès qu'on retape et n'efface pas un texte modifié pendant l'envoi", async () => {
    let finish: () => void = () => undefined;
    const onSend = jest
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    await render(<MessageComposer conversationId="dm:c" onSend={onSend} />);
    await type('un');
    await userEvent.setup().press(screen.getByLabelText('Envoyer'));
    expect(screen.getByRole('alert')).toBeTruthy();
    await type('deux');
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.setup().press(screen.getByLabelText('Envoyer'));
    await type('deux et plus');
    await act(async () => finish());
    expect(screen.getByLabelText('Message').props.value).toBe('deux et plus');
  });

  it('désactive l\'envoi sans gestionnaire, sans texte ou pendant un envoi', async () => {
    const view = await render(<MessageComposer conversationId="dm:d" />);
    expect(screen.getByPlaceholderText('Envoi bientôt disponible')).toBeTruthy();
    await type('texte');
    await fireEvent.press(screen.getByLabelText('Envoyer'));
    await view.rerender(<MessageComposer conversationId="dm:d" onSend={jest.fn()} />);
    expect(screen.getByPlaceholderText('Écrire un message')).toBeTruthy();
  });

  it('accepte un gestionnaire synchrone', async () => {
    const onSend = jest.fn();
    await render(<MessageComposer conversationId="dm:e" onSend={onSend} />);
    await type('salut');
    await userEvent.setup().press(screen.getByLabelText('Envoyer'));
    expect(onSend).toHaveBeenCalledWith('salut');
    await waitFor(() => expect(screen.getByLabelText('Message').props.value).toBe(''));
  });
});
