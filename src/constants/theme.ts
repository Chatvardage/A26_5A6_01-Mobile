/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0b3b36',
    background: '#cdeee3',
    backgroundElement: '#e3f6ef',
    backgroundSelected: '#f5fcf9',
    textSecondary: '#4b706a',
    tint: '#0f8a6c',
    danger: '#c93636',
    card: '#e3f6ef',
    input: '#ffffff',
    panel: '#e3f6ef',
    panelAlt: '#f5fcf9',
    bubble: '#b5e3d4',
    accent: '#15a383',
    primary: '#0f8a6c',
    authButton: '#0f8a6c',
    onPrimary: '#ffffff',
  },
  dark: {
    text: '#eef5f2',
    background: '#0a5447',
    backgroundElement: '#0d3d38',
    backgroundSelected: '#0e453e',
    textSecondary: '#9fb8b3',
    tint: '#168f70',
    danger: '#e25555',
    card: '#123f33',
    input: '#66716e',
    panel: '#0d3d38',
    panelAlt: '#0e453e',
    bubble: '#5f7475',
    accent: '#3ddc97',
    primary: '#168f70',
    authButton: '#66716e',
    onPrimary: '#ffffff',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
