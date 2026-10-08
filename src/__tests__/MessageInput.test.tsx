import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MessageInput } from '@/components/MessageInput';
import { ApiError } from '@/services/ApiError';

const frame = { x: 0, y: 0, width: 400, height: 800 };
const insets = { top: 0, right: 0, bottom: 0, left: 0 };
let draftStore: Map<string, string>;
beforeEach(() => {
  draftStore = new Map();
});
const renderInput = async (props: Partial<React.ComponentProps<typeof MessageInput>> = {}) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame, insets }}>
      <MessageInput
        conversationId="input-test-default"
        draftStore={draftStore}
        onSend={jest.fn().mockResolvedValue(undefined)}
        editingMessage={null}
        onEdit={jest.fn().mockResolvedValue(undefined)}
        onCancelEdit={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );

describe('MessageInput', () => {
  it.each(['unmount', 'new-edit'] as const)('ne ferme pas une modification plus récente après un succès tardif (%s)', async (outcome) => {
    let resolve!: () => void;
    const onEdit = jest.fn(() => new Promise<void>((done) => { resolve = done; }));
    const onCancelEdit = jest.fn();
    const view = await renderInput({
      conversationId: 'late-edit',
      editingMessage: { id: 'old', content: 'ancien texte' },
      onEdit,
      onCancelEdit,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
    if (outcome === 'unmount') await view.unmount();
    else await view.rerender(
      <SafeAreaProvider initialMetrics={{ frame, insets }}>
        <MessageInput conversationId="late-edit" draftStore={draftStore} editingMessage={{ id: 'new', content: 'nouvelle modification' }}
          onEdit={onEdit} onCancelEdit={onCancelEdit} onSend={jest.fn()} />
      </SafeAreaProvider>,
    );
    await act(async () => resolve());
    expect(onEdit).toHaveBeenCalledWith('old', 'ancien texte');
    expect(onCancelEdit).not.toHaveBeenCalled();
    if (outcome === 'new-edit') expect(screen.getByLabelText('Modifier le message')).toHaveDisplayValue('nouvelle modification');
  });

  it('vide le champ après un envoi réussi même si son brouillon a été évincé entre-temps', async () => {
    let resolve!: () => void;
    const onSend = jest.fn(() => new Promise<void>((done) => { resolve = done; }));
    await renderInput({ conversationId: 'evicted-pending', onSend });
    await fireEvent.changeText(screen.getByLabelText('Message'), 'texte envoyé');
    await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }));
    draftStore.delete('evicted-pending');
    await act(async () => resolve());
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('texte envoyé');
    expect(draftStore.has('evicted-pending')).toBe(false);
  });

  it('limite les brouillons à 100 et protège celui récemment rouvert contre l’éviction', async () => {
    for (let index = 0; index < 100; index++) draftStore.set(`draft-${index}`, `texte-${index}`);
    const reopened = await renderInput({ conversationId: 'draft-0' });
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('texte-0');
    expect(draftStore.size).toBe(100);
    expect([...draftStore.keys()].at(-1)).toBe('draft-0');
    await reopened.unmount();

    const added = await renderInput({ conversationId: 'draft-100' });
    await fireEvent.changeText(screen.getByLabelText('Message'), 'nouveau brouillon');
    expect(draftStore.size).toBe(100);
    expect(draftStore.has('draft-1')).toBe(false);
    expect(draftStore.get('draft-0')).toBe('texte-0');
    expect(draftStore.get('draft-100')).toBe('nouveau brouillon');
    await added.unmount();
    await renderInput({ conversationId: 'draft-1' });
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('');
  });

  it('actualise la priorité à la modification et supprime les brouillons vides ou uniquement composés d’espaces', async () => {
    for (let index = 0; index < 100; index++) draftStore.set(`draft-${index}`, `texte-${index}`);
    const edited = await renderInput({ conversationId: 'draft-0' });
    await fireEvent.changeText(screen.getByLabelText('Message'), 'nouveau texte');
    expect([...draftStore.keys()].at(-1)).toBe('draft-0');
    expect(draftStore.get('draft-0')).toBe('nouveau texte');
    expect(draftStore.size).toBe(100);
    await fireEvent.changeText(screen.getByLabelText('Message'), '   ');
    expect(draftStore.has('draft-0')).toBe(false);
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('   ');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'nouveau texte');
    await fireEvent.changeText(screen.getByLabelText('Message'), '');
    expect(draftStore.has('draft-0')).toBe(false);
    expect(draftStore.size).toBe(99);
    await edited.unmount();
    await renderInput({ conversationId: 'draft-0' });
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('');
  });

  it('ne modifie pas le store ni sa priorité en mode modification de message', async () => {
    draftStore.set('editing-draft', 'brouillon de composition');
    draftStore.set('other', 'autre brouillon');
    const snapshot = [...draftStore.entries()];
    await renderInput({ conversationId: 'editing-draft', editingMessage: { id: 'one', content: 'original' } });
    await fireEvent.changeText(screen.getByLabelText('Modifier le message'), 'corrigé');
    expect([...draftStore.entries()]).toEqual(snapshot);
  });

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
        <MessageInput conversationId="input-draft-b" draftStore={draftStore} onSend={jest.fn()} editingMessage={null} onEdit={jest.fn()} onCancelEdit={jest.fn()} />
      </SafeAreaProvider>,
    );
    await fireEvent.changeText(screen.getByLabelText('Message'), 'brouillon B');
    await rerender(
      <SafeAreaProvider initialMetrics={{ frame, insets }}>
        <MessageInput conversationId="input-draft-a" draftStore={draftStore} onSend={jest.fn()} editingMessage={null} onEdit={jest.fn()} onCancelEdit={jest.fn()} />
      </SafeAreaProvider>,
    );
    expect(screen.getByLabelText('Message').props.value).toBe('brouillon A');
  });

  it('isole deux stores qui utilisent le même identifiant de conversation', async () => {
    const firstStore = new Map<string, string>();
    const secondStore = new Map<string, string>();
    const first = await renderInput({ conversationId: 'same-id', draftStore: firstStore });
    await fireEvent.changeText(screen.getByLabelText('Message'), 'brouillon privé au premier store');
    await first.unmount();
    const second = await renderInput({ conversationId: 'same-id', draftStore: secondStore });
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'second brouillon');
    await second.unmount();
    await renderInput({ conversationId: 'same-id', draftStore: firstStore });
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('brouillon privé au premier store');
    expect(secondStore.get('same-id')).toBe('second brouillon');
  });

  it('conserve le brouillon de production par défaut entre deux montages', async () => {
    const first = await renderInput({ conversationId: 'default-store', draftStore: undefined });
    await fireEvent.changeText(screen.getByLabelText('Message'), 'brouillon partagé');
    await first.unmount();
    await renderInput({ conversationId: 'default-store', draftStore: undefined });
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('brouillon partagé');
    await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }));
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('');
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
