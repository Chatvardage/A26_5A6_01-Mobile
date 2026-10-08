import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { useMessages } from '@/hooks/useMessages';
import { ConversationScreen } from '@/screens/ConversationScreen';
import { ApiError } from '@/services/ApiError';
import type { ChatMessage } from '@/types/conversation';
jest.mock('@/hooks/usePublicProfiles', () => ({ usePublicProfiles: () => ({}) }));
jest.mock('@/hooks/useReadReceipts', () => ({ useReadReceipts: () => [] }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/hooks/useCanWrite', () => ({ useCanWrite: () => true }));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 40 }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' }, drafts: new Map() }) }));
let mockCanModerate = false;
jest.mock('@/hooks/useCanModerate', () => ({ useCanModerate: () => mockCanModerate }));
jest.mock('@/hooks/useMessages', () => ({ useMessages: jest.fn() }));

const OLI = '22222222-2222-4222-8222-222222222222';
const mine: ChatMessage = { id: 'mine', senderId: 'me', content: 'Mon message', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };
const theirs: ChatMessage = { ...mine, id: 'theirs', senderId: OLI, content: 'Son message' };

let remove: jest.Mock;
const props = { route: { params: { conversationId: `dm:${OLI}` } } } as unknown as Parameters<typeof ConversationScreen>[0];

const mockMessages = (messages: ChatMessage[]) =>
  jest.mocked(useMessages).mockReturnValue({
    messages,
    status: 'ready',
    errorMessage: null,
    accessError: null,
    hasOlder: false,
    loadingOlder: false,
    olderError: null,
    connection: 'ready',
    retry: jest.fn(),
    loadOlder: jest.fn(),
    jumpTo: jest.fn(async () => true),
    send: jest.fn(),
    edit: jest.fn(),
    remove,
  } as unknown as ReturnType<typeof useMessages>);

beforeEach(() => {
  mockCanModerate = false;
  remove = jest.fn(async () => undefined);
  mockMessages([mine, theirs]);
});
// Dialogue au style de l'app : titre, puis boutons dans l'ordre affiché (Annuler à gauche, Supprimer à droite).
const dialog = () => within(screen.getByTestId('app-dialog'));
const title = () => dialog().getByRole('header').props.children;
const labels = () => dialog().getAllByRole('button').map((button) => button.props.accessibilityLabel);
const press = (label: string) => fireEvent.press(dialog().getByRole('button', { name: label }));

describe('Appui long sur un message : modifier ou supprimer', () => {
  it('propose Annuler à gauche, puis Modifier et Supprimer à droite sur ses propres messages', async () => {
    await render(<ConversationScreen {...props} />);
    await fireEvent(screen.getByRole('button', { name: 'Mon message' }), 'longPress');
    expect(title()).toBe('Que faire de votre message ?');
    expect(dialog().getByText('Vous pouvez le modifier ou le supprimer pour tout le monde.')).toBeTruthy();
    expect(dialog().getByText('Mon message')).toBeTruthy();
    expect(labels()).toEqual(['Annuler', 'Modifier', 'Supprimer']);
    expect(screen.getByRole('button', { name: 'Mon message' }).props.accessibilityHint).toBe('Appui long : modifier ou supprimer');
  });

  it("n'offre aucune action sur le message d'un autre", async () => {
    await render(<ConversationScreen {...props} />);
    expect(screen.queryByRole('button', { name: 'Son message' })).toBeNull();
    expect(screen.queryByTestId('app-dialog')).toBeNull();
  });

  it('demande confirmation avant de supprimer, puis supprime le message', async () => {
    await render(<ConversationScreen {...props} />);
    await fireEvent(screen.getByRole('button', { name: 'Mon message' }), 'longPress');
    await press('Supprimer');
    expect(title()).toBe('Supprimer ce message ?');
    expect(dialog().getByText(/définitive/)).toBeTruthy();
    expect(labels()).toEqual(['Annuler', 'Supprimer']);
    expect(remove).not.toHaveBeenCalled();
    await press('Supprimer');
    expect(remove).toHaveBeenCalledWith('mine');
    expect(screen.queryByTestId('app-dialog')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ne supprime rien quand on annule, au menu ou à la confirmation', async () => {
    await render(<ConversationScreen {...props} />);
    await fireEvent(screen.getByRole('button', { name: 'Mon message' }), 'longPress');
    await press('Annuler');
    expect(screen.queryByTestId('app-dialog')).toBeNull();
    await fireEvent(screen.getByRole('button', { name: 'Mon message' }), 'longPress');
    await press('Supprimer');
    await press('Annuler');
    expect(screen.queryByTestId('app-dialog')).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it('affiche la raison de l’échec et garde le message', async () => {
    remove.mockRejectedValueOnce(new ApiError('forbidden', 'HTTP 403', 403));
    await render(<ConversationScreen {...props} />);
    await fireEvent(screen.getByRole('button', { name: 'Mon message' }), 'longPress');
    await press('Supprimer');
    await press('Supprimer');
    expect(screen.getByRole('alert')).toHaveTextContent('Vous n’avez pas accès à cette conversation.');
    expect(screen.getByText('Mon message')).toBeTruthy();
    // Une nouvelle tentative réussie efface l'erreur.
    await fireEvent(screen.getByRole('button', { name: 'Mon message' }), 'longPress');
    await press('Supprimer');
    await press('Supprimer');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('quitte la modification quand le message modifié est supprimé, mais pas pour un autre', async () => {
    const other = { ...mine, id: 'other', content: 'Autre à moi' };
    mockMessages([mine, other]);
    await render(<ConversationScreen {...props} />);
    // Modification de « mine », puis suppression de « other » : la modification continue.
    await fireEvent(screen.getByRole('button', { name: 'Mon message' }), 'longPress');
    await press('Modifier');
    expect(screen.getByLabelText('Modifier le message')).toBeTruthy();
    await fireEvent(screen.getByRole('button', { name: 'Autre à moi' }), 'longPress');
    await press('Supprimer');
    await press('Supprimer');
    expect(remove).toHaveBeenLastCalledWith('other');
    expect(screen.getByLabelText('Modifier le message')).toBeTruthy();
    // Suppression du message en cours de modification : retour à la saisie normale.
    await fireEvent(screen.getByRole('button', { name: 'Mon message' }), 'longPress');
    await press('Supprimer');
    await press('Supprimer');
    expect(remove).toHaveBeenLastCalledWith('mine');
    expect(screen.queryByLabelText('Modifier le message')).toBeNull();
    expect(screen.getByLabelText('Message')).toBeTruthy();
  });
});

describe("Modération : supprimer le message d'un autre", () => {
  it("propose seulement Annuler et Supprimer sur le message d'un autre, avec un libellé de modération", async () => {
    mockCanModerate = true;
    await render(<ConversationScreen {...props} />);
    const bubble = screen.getByRole('button', { name: 'Son message' });
    expect(bubble.props.accessibilityHint).toBe('Appui long : supprimer (modération)');
    await fireEvent(bubble, 'longPress');
    expect(title()).toBe('Modérer ce message ?');
    expect(dialog().getByText(/écrit par quelqu’un d’autre/)).toBeTruthy();
    expect(labels()).toEqual(['Annuler', 'Supprimer']);
  });

  it('confirme avec un texte de modération, puis supprime le message de l\'autre', async () => {
    mockCanModerate = true;
    await render(<ConversationScreen {...props} />);
    await fireEvent(screen.getByRole('button', { name: 'Son message' }), 'longPress');
    await press('Supprimer');
    expect(title()).toBe('Supprimer ce message ?');
    expect(dialog().getByText(/en tant que modérateur/i)).toBeTruthy();
    await press('Supprimer');
    expect(remove).toHaveBeenCalledWith('theirs');
  });

  it('garde Modifier sur ses propres messages, même pour un modérateur', async () => {
    mockCanModerate = true;
    await render(<ConversationScreen {...props} />);
    await fireEvent(screen.getByRole('button', { name: 'Mon message' }), 'longPress');
    expect(title()).toBe('Que faire de votre message ?');
    expect(labels()).toEqual(['Annuler', 'Modifier', 'Supprimer']);
    expect(screen.getByRole('button', { name: 'Mon message' }).props.accessibilityHint).toBe('Appui long : modifier ou supprimer');
  });

  it("n'offre rien sur le message d'un autre sans droit de modération", async () => {
    mockCanModerate = false;
    await render(<ConversationScreen {...props} />);
    expect(screen.queryByRole('button', { name: 'Son message' })).toBeNull();
  });

  it("affiche la raison quand le serveur refuse la modération (droit retiré entre-temps)", async () => {
    mockCanModerate = true;
    remove.mockRejectedValueOnce(new ApiError('forbidden', 'HTTP 403', 403));
    await render(<ConversationScreen {...props} />);
    await fireEvent(screen.getByRole('button', { name: 'Son message' }), 'longPress');
    await press('Supprimer');
    await press('Supprimer');
    expect(screen.getByRole('alert')).toHaveTextContent('Vous n’avez pas accès à cette conversation.');
    expect(screen.getByText('Son message')).toBeTruthy();
  });
});

