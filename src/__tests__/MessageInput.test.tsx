import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MessageInput } from '@/components/MessageInput';
import { ApiError } from '@/services/ApiError';

const frame = { x: 0, y: 0, width: 400, height: 800 };
const insets = { top: 0, right: 0, bottom: 0, left: 0 };
const renderInput = async (props: Partial<React.ComponentProps<typeof MessageInput>> = {}) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame, insets }}>
      <MessageInput
        conversationId="input-test-default"
        onSend={jest.fn().mockResolvedValue(undefined)}
        editingMessage={null}
        onEdit={jest.fn().mockResolvedValue(undefined)}
        onCancelEdit={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );

describe('MessageInput', () => {
  it('refuse un message vide et conserve le texte en cas d’échec', async () => {
    const onSend = jest.fn().mockRejectedValue('Envoi refusé.');
    await renderInput({ conversationId: 'input-empty-failure', onSend });
    await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }));
    expect(onSend).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Message'), '  texte à garder  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Envoi refusé.');
    expect(screen.getByLabelText('Message').props.value).toBe('  texte à garder  ');
  });

  it('efface seulement après succès et garde le texte saisi pendant l’envoi', async () => {
    let resolveSend!: () => void;
    const onSend = jest.fn(() => new Promise<void>((resolve) => (resolveSend = resolve)));
    await renderInput({ conversationId: 'input-success-inflight', onSend });

    await fireEvent.changeText(screen.getByLabelText('Message'), 'envoyé');
    await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(screen.getByLabelText('Message'), 'nouveau brouillon');
    resolveSend();
    await screen.findByDisplayValue('nouveau brouillon');
    expect(screen.getByLabelText('Message').props.value).toBe('nouveau brouillon');
  });

  it('vide le champ au succès si le texte n’a pas changé', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    await renderInput({ conversationId: 'input-clear-on-success', onSend });
    await fireEvent.changeText(screen.getByLabelText('Message'), '  message  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByDisplayValue('');
    expect(onSend).toHaveBeenCalledWith('message');
  });

  it('restaure le brouillon par conversation', async () => {
    const props = { conversationId: 'input-draft-a' };
    const { rerender } = await renderInput(props);
    await fireEvent.changeText(screen.getByLabelText('Message'), 'brouillon A');
    await rerender(
      <SafeAreaProvider initialMetrics={{ frame, insets }}>
        <MessageInput conversationId="input-draft-b" onSend={jest.fn()} editingMessage={null} onEdit={jest.fn()} onCancelEdit={jest.fn()} />
      </SafeAreaProvider>,
    );
    await fireEvent.changeText(screen.getByLabelText('Message'), 'brouillon B');
    await rerender(
      <SafeAreaProvider initialMetrics={{ frame, insets }}>
        <MessageInput conversationId="input-draft-a" onSend={jest.fn()} editingMessage={null} onEdit={jest.fn()} onCancelEdit={jest.fn()} />
      </SafeAreaProvider>,
    );
    expect(screen.getByLabelText('Message').props.value).toBe('brouillon A');
  });

  it('garde le mode modification en cas d’échec et le ferme après succès', async () => {
    const onEdit = jest.fn().mockRejectedValueOnce('Modification refusée.').mockResolvedValueOnce(undefined);
    const onCancelEdit = jest.fn();
    await renderInput({
      conversationId: 'input-edit',
      editingMessage: { id: 'message-id', content: 'texte original' },
      onEdit,
      onCancelEdit,
    });
    expect(screen.getByLabelText('Modifier le message').props.value).toBe('texte original');
    await fireEvent.changeText(screen.getByLabelText('Modifier le message'), 'nouvelle version');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Modification refusée.');
    expect(onCancelEdit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(onCancelEdit).toHaveBeenCalledTimes(1));
    expect(onEdit).toHaveBeenLastCalledWith('message-id', 'nouvelle version');
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });
    it('traduit une erreur typée et conserve le texte non envoyé', async () => {
      const onSend = jest.fn().mockRejectedValue(new ApiError('rate_limited', 'x'));
      await renderInput({ conversationId: 'input-typed-error', onSend });
      await fireEvent.changeText(screen.getByLabelText('Message'), 'brouillon');
      await userEvent.setup().press(screen.getByRole('button', { name: 'Envoyer' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Vous envoyez des messages trop rapidement. Réessayez dans un instant.');
      expect(screen.getByLabelText('Message')).toHaveDisplayValue('brouillon');
    });

    it.each(['success', 'error'] as const)('termine un envoi après démontage sans perdre le brouillon requis (%s)', async (outcome) => {
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const onSend = jest.fn(() => new Promise<void>((success, failure) => { resolve = success; reject = failure; }));
      const conversationId = `input-unmount-${outcome}`;
      const view = await renderInput({ conversationId, onSend });
      await fireEvent.changeText(screen.getByLabelText('Message'), 'texte en attente');
      await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }));
      await view.unmount();
      await act(async () => {
        if (outcome === 'success') resolve();
        else reject(new ApiError('network', 'x'));
      });
      await renderInput({ conversationId });
      expect(screen.getByLabelText('Message')).toHaveDisplayValue(outcome === 'success' ? '' : 'texte en attente');
    });

    it('ne vide pas un nouveau brouillon saisi dans une autre instance pendant l’envoi', async () => {
      let resolve!: () => void;
      const onSend = jest.fn(() => new Promise<void>((done) => { resolve = done; }));
      const conversationId = 'input-reopened-pending';
      const view = await renderInput({ conversationId, onSend });
      await fireEvent.changeText(screen.getByLabelText('Message'), 'ancien texte');
      await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }));
      await view.unmount();
      await renderInput({ conversationId });
      await fireEvent.changeText(screen.getByLabelText('Message'), 'nouveau texte');
      await act(async () => resolve());
      expect(screen.getByLabelText('Message')).toHaveDisplayValue('nouveau texte');
    });
});
