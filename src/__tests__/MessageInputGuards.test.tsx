import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, type GestureResponderEvent, type PressableProps } from 'react-native';

import { MessageInput } from '@/components/MessageInput';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Actual = jest.requireActual('react-native/Libraries/Components/Pressable/Pressable').default;
  return { __esModule: true, default: jest.fn((props: PressableProps) => React.createElement(Actual, props)) };
});

it('refuse les déclenchements programmatiques vides ou pendant un envoi, même hors du contrôle disabled', async () => {
  let resolve!: () => void;
  const onSend = jest.fn(() => new Promise<void>((done) => { resolve = done; }));
  await render(
    <MessageInput conversationId="input-guards" draftStore={new Map()} onSend={onSend} editingMessage={null} onEdit={jest.fn()} onCancelEdit={jest.fn()} />,
  );
  const press = async () => {
    const props = jest.mocked(Pressable).mock.lastCall![0];
    await act(async () => props.onPress?.({} as GestureResponderEvent));
  };
  await press();
  expect(onSend).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Message'), '   ');
  await press();
  expect(onSend).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'texte');
  const sameRender = jest.mocked(Pressable).mock.lastCall![0];
  await act(async () => {
    sameRender.onPress?.({} as GestureResponderEvent);
    sameRender.onPress?.({} as GestureResponderEvent);
  });
  await press();
  await press();
  expect(onSend).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
  expect(screen.getByLabelText('Message')).toHaveDisplayValue('');
});
