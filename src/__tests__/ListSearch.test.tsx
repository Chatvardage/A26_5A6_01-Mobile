import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';

import { HeaderSearchButton } from '@/components/HeaderSearchButton';
import { NavigationContext } from '@react-navigation/native';
import type { ReactElement, ReactNode } from 'react';

import { foldText, useListFilter } from '@/hooks/useListFilter';
import { useDirectMessages } from '@/hooks/useDirectMessages';
import { useServers } from '@/hooks/useServers';
import { DirectMessagesScreen } from '@/screens/DirectMessagesScreen';
import { ServersScreen } from '@/screens/ServersScreen';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/services/rooms.service', () => ({ getInvitations: jest.fn(async () => []) }));
jest.mock('@/hooks/useServers');
jest.mock('@/hooks/useDirectMessages');
jest.mock('@/hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('@/hooks/useRefreshOnServerChange', () => ({ useRefreshOnServerChange: jest.fn() }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' }, realtime: { subscribe: () => () => undefined } }) }));

const ready = (data: unknown[]) => ({ state: { status: 'ready', data }, refreshing: false, refreshError: null, retry: jest.fn(), refresh: jest.fn() }) as never;

it('compare sans casse ni accents et filtre par nom', async () => {
  expect(foldText('Équipe Été')).toBe('equipe ete');
  const hook = await renderHook(() => useListFilter(['Équipe', 'Projet'], (name: string) => name));
  expect(hook.result.current.open).toBe(false);
  await act(async () => hook.result.current.toggle());
  await act(async () => hook.result.current.setQuery('  EQUI '));
  expect(hook.result.current.filtered).toEqual(['Équipe']);
  // Fermer la recherche efface le texte.
  await act(async () => hook.result.current.toggle());
  expect(hook.result.current.open).toBe(false);
  expect(hook.result.current.filtered).toEqual(['Équipe', 'Projet']);
});

/** Rend l'écran avec son en-tête : la loupe vient de navigation.setOptions({ headerRight }). */
async function renderWithHeader(element: (navigation: never) => ReactElement) {
  let headerRight: (() => ReactElement) | undefined;
  const navigation = { navigate: jest.fn(), setOptions: jest.fn((options: { headerRight?: () => ReactElement }) => { headerRight = options.headerRight; }) } as never;
  const view = await render(element(navigation));
  // Bouton d'en-tête (HeaderSearchButton) : ses props suffisent, l'en-tête n'est pas rendu ici.
  const header = () => headerRight!().props as { label: string; active: boolean; onPress: () => void };
  return { view, header };
}

it.each([
  ['serveurs', 'Rechercher un serveur', () => jest.mocked(useServers).mockReturnValue(ready([{ id: 'a', name: 'Équipe', memberCount: 1, channelIds: [], unreadCount: 0 }, { id: 'b', name: 'Projet', memberCount: 1, channelIds: [], unreadCount: 0 }])), (navigation: never) => <ServersScreen navigation={navigation} route={{} as never} />],
  ['messages privés', 'Rechercher une conversation', () => jest.mocked(useDirectMessages).mockReturnValue(ready([{ id: 'dm:a', kind: 'dm', title: 'Équipe', lastMessage: null, unreadCount: 0 }, { id: 'dm:b', kind: 'dm', title: 'Projet', lastMessage: null, unreadCount: 0 }])), (navigation: never) => <DirectMessagesScreen navigation={navigation} route={{} as never} />],
] as const)('la loupe de l’en-tête filtre la liste des %s', async (_name, label, setup, element) => {
  setup();
  const { header } = await renderWithHeader(element);
  expect(screen.queryByLabelText(label)).toBeNull();
  expect(header()).toMatchObject({ label, active: false });
  await act(async () => header().onPress());
  expect(header().active).toBe(true);
  await fireEvent.changeText(screen.getByLabelText(label), 'equipe');
  expect(screen.getByText('Équipe')).toBeTruthy();
  expect(screen.queryByText('Projet')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText(label), 'zzz');
  expect(screen.getByText('Aucun résultat')).toBeTruthy();
});

it('la loupe se présente comme un bouton, sélectionné quand la recherche est ouverte', async () => {
  const onPress = jest.fn();
  const view = await render(<HeaderSearchButton label="Rechercher un serveur" active onPress={onPress} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Rechercher un serveur' }));
  expect(onPress).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Rechercher un serveur' })).toBeSelected();
  await view.rerender(<HeaderSearchButton label="Rechercher un serveur" active={false} onPress={onPress} />);
  expect(screen.getByRole('button', { name: 'Rechercher un serveur' })).not.toBeSelected();
});

it('ferme et vide la recherche quand on quitte l’écran', async () => {
  let blur: () => void = () => undefined;
  const unsubscribe = jest.fn();
  const navigation = { addListener: jest.fn((event: string, listener: () => void) => { if (event === 'blur') blur = listener; return unsubscribe; }) };
  const wrapper = ({ children }: { children: ReactNode }) => <NavigationContext.Provider value={navigation as never}>{children}</NavigationContext.Provider>;
  const hook = await renderHook(() => useListFilter(['Équipe', 'Projet'], (name: string) => name), { wrapper });
  await act(async () => hook.result.current.toggle());
  await act(async () => hook.result.current.setQuery('equ'));
  expect(hook.result.current.filtered).toEqual(['Équipe']);
  await act(async () => blur());
  expect(hook.result.current.open).toBe(false);
  expect(hook.result.current.query).toBe('');
  expect(hook.result.current.filtered).toEqual(['Équipe', 'Projet']);
  await hook.unmount();
  expect(unsubscribe).toHaveBeenCalled();
});
