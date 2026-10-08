import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ContentFrame } from '@/components/ContentFrame';
import { MaxContentWidth } from '@/constants/theme';

const withInsets = (left: number, right: number, node: React.ReactNode) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 800, height: 400 }, insets: { top: 0, bottom: 0, left, right } }}>
    {node}
  </SafeAreaProvider>
);

describe('ContentFrame', () => {
  it('limite et centre la largeur, et respecte les marges latérales de la zone sûre en paysage', async () => {
    await render(
      withInsets(44, 34, <ContentFrame testID="frame" style={{ backgroundColor: 'red' }}><Text>contenu</Text></ContentFrame>),
    );
    const frame = screen.getByTestId('frame');
    const flat = Object.assign({}, ...[frame.props.style].flat(Infinity).filter(Boolean));
    expect(flat).toMatchObject({
      flex: 1,
      width: '100%',
      maxWidth: MaxContentWidth,
      alignSelf: 'center',
      paddingLeft: 44,
      paddingRight: 34,
      backgroundColor: 'red',
    });
  });

  it("n'ajoute pas de marges latérales quand un parent les applique déjà", async () => {
    await render(withInsets(44, 34, <ContentFrame testID="frame" insets={false}><Text>contenu</Text></ContentFrame>));
    const frame = screen.getByTestId('frame');
    const flat = Object.assign({}, ...[frame.props.style].flat(Infinity).filter(Boolean));
    expect(flat.paddingLeft).toBeUndefined();
    expect(flat.paddingRight).toBeUndefined();
    expect(flat.maxWidth).toBe(MaxContentWidth);
  });
});
