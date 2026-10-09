import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text, View, type PressableProps, type PressableStateCallbackType, type ViewStyle } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Colors } from '@/constants/theme';
import { RoomsScreen } from '@/screens/RoomsScreen';
import { useAppDialog } from '@/components/AppDialog';

// Le moteur de test ne simule pas l'état « pressé » : on appelle le style des Pressable avec cet état.
jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Actual = jest.requireActual('react-native/Libraries/Components/Pressable/Pressable').default;
  return { __esModule: true, default: jest.fn((props: PressableProps) => React.createElement(Actual, props)) };
});

type StyleFn = (state: PressableStateCallbackType) => ViewStyle;
const opacity = (style: PressableProps['style'], pressed: boolean) => (style as StyleFn)({ pressed } as PressableStateCallbackType).opacity;
const lastStyle = (label?: string) =>
  jest.mocked(Pressable).mock.calls.map(([props]) => props).findLast(props => label === undefined || props.accessibilityLabel === label)!.style;

// Couleur des icônes : relevée sur les props reçues par SymbolView.
const mockSymbols: { tintColor?: string }[] = [];
jest.mock('expo-symbols', () => ({ SymbolView: (props: { tintColor?: string }) => { mockSymbols.push(props); return null; } }));

beforeEach(() => { jest.mocked(Pressable).mockClear(); mockSymbols.length = 0; });

it('ActionButton atténue le bouton pressé ; un bouton désactivé reste plus pâle', async () => {
  const view = await render(<ActionButton label="Créer" badge={2} onPress={jest.fn()} />);
  expect([opacity(lastStyle(), false), opacity(lastStyle(), true)]).toEqual([1, 0.6]);
  await view.rerender(<ActionButton label="Créer" disabled onPress={jest.fn()} />);
  expect(opacity(lastStyle(), true)).toBe(0.4);
});

it('AppDialog atténue l’action pressée', async () => {
  function Host() {
    const { show, dialog } = useAppDialog();
    return <View><Pressable accessibilityRole="button" onPress={() => show({ title: 'Titre', actions: [{ label: 'OK' }] })}><Text>Ouvrir</Text></Pressable>{dialog}</View>;
  }
  await render(<Host />);
  await fireEvent.press(screen.getByText('Ouvrir'));
  expect([opacity(lastStyle('OK'), false), opacity(lastStyle('OK'), true)]).toEqual([1, 0.6]);
});

it('ActionButton dangereux : icône et libellé en couleur de danger', async () => {
  await render(<ActionButton label="Quitter" danger icon={{ ios: 'xmark', android: 'close', web: 'close' }} onPress={jest.fn()} />);
  expect(mockSymbols.at(-1)?.tintColor).toBe(Colors.light.danger);
  expect(screen.getByText('Quitter')).toHaveStyle({ color: Colors.light.danger });
});

it('les raccourcis de l’accueil changent de fond quand on les presse', async () => {
  await render(<RoomsScreen {...({ navigation: { navigate: jest.fn() } } as unknown as ComponentProps<typeof RoomsScreen>)} />);
  const background = (pressed: boolean) => {
    const style = lastStyle('Serveurs') as (state: PressableStateCallbackType) => ViewStyle[];
    return style({ pressed } as PressableStateCallbackType)[1].backgroundColor;
  };
  expect(background(true)).toBe(Colors.light.backgroundSelected);
  expect(background(false)).toBe(Colors.light.card);
});
