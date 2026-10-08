import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import { useAppDialog } from '@/components/AppDialog';

const onDelete = jest.fn(); const onEdit = jest.fn();
function Host() {
  const { show, dialog } = useAppDialog();
  return <View><Pressable accessibilityRole="button" onPress={() => show({ title: 'Titre', message: 'Détail', quote: 'Citation', actions: [{ label: 'Supprimer', kind: 'danger', onPress: onDelete }, { label: 'Annuler', kind: 'cancel' }, { label: 'Modifier', onPress: onEdit }] })}><Text>Ouvrir</Text></Pressable>{dialog}</View>;
}
beforeEach(() => jest.clearAllMocks());

it('place Annuler à gauche et garde l’ordre des autres actions à droite', async () => {
  await render(<Host />);
  expect(screen.queryByTestId('app-dialog')).toBeNull();
  await fireEvent.press(screen.getByText('Ouvrir'));
  const dialog = within(screen.getByTestId('app-dialog'));
  expect(dialog.getByRole('header')).toHaveTextContent('Titre');
  expect(dialog.getByText('Détail')).toBeTruthy(); expect(dialog.getByText('Citation')).toBeTruthy();
  expect(dialog.getAllByRole('button').map(button => button.props.accessibilityLabel)).toEqual(['Annuler', 'Supprimer', 'Modifier']);
  await fireEvent.press(dialog.getByRole('button', { name: 'Supprimer' }));
  expect(onDelete).toHaveBeenCalledTimes(1); expect(screen.queryByTestId('app-dialog')).toBeNull();
});

it('se ferme sans action avec le retour Android', async () => {
  await render(<Host />);
  await fireEvent.press(screen.getByText('Ouvrir'));
  // L'événement remonte jusqu'au `onRequestClose` du Modal.
  await fireEvent(screen.getByTestId('app-dialog'), 'requestClose');
  expect(screen.queryByTestId('app-dialog')).toBeNull();
  expect(onDelete).not.toHaveBeenCalled(); expect(onEdit).not.toHaveBeenCalled();
});
