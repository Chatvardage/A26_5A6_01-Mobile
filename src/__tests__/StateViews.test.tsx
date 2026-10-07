import { render, screen, userEvent } from '@testing-library/react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';

describe('StateViews', () => {
  it('rend un état vide défilable avec tirer-pour-rafraîchir quand `refresh` est fourni', async () => {
    const onRefresh = jest.fn();
    await render(<EmptyState title="Aucun message privé" refresh={{ refreshing: false, onRefresh }} />);
    expect(screen.getByText('Aucun message privé')).toBeTruthy();
    const scroll = screen.getByTestId('refreshable-state');
    expect(scroll.props.refreshControl.props.onRefresh).toBe(onRefresh);
  });

  it('reste une simple vue sans `refresh`', async () => {
    await render(<EmptyState title="Vide" />);
    expect(screen.queryByTestId('refreshable-state')).toBeNull();
  });

  it('propose Réessayer et le rafraîchissement sur une erreur', async () => {
    await render(<ErrorState message="Panne" onRetry={jest.fn()} refresh={{ refreshing: false, onRefresh: jest.fn() }} />);
    expect(screen.getByText('Panne')).toBeTruthy();
    expect(screen.getByText('Réessayer')).toBeTruthy();
    expect(screen.getByTestId('refreshable-state')).toBeTruthy();
  });

  it('utilise le libellé de chargement par défaut', async () => {
    await render(<LoadingState />);
    expect(screen.getByLabelText('Chargement…')).toBeTruthy();
    expect(screen.getByText('Chargement…')).toBeTruthy();
  });

  it('déclenche le réessai par un appui complet', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState message="Panne réseau" onRetry={onRetry} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
