import type {KeyboardTheme} from './themeTypes';

// How keys are drawn, independent of the colour theme - any combination
// of these works with any theme (see ThemeCustomizer's "Key style").
export type KeyShape = 'rounded' | 'square' | 'bubble';

export interface KeyStyle {
  shape: KeyShape;
  // A thin border around every key - reads well on themes where keys and
  // tray are close in colour.
  outline: boolean;
  // A darker bottom edge, like a physical keycap.
  raised: boolean;
  boldLabels: boolean;
}

export const DEFAULT_KEY_STYLE: KeyStyle = {
  shape: 'rounded',
  outline: false,
  raised: false,
  boldLabels: false,
};

const RADIUS: Record<KeyShape, {key: number; pill: number; accent: number}> = {
  rounded: {key: 13, pill: 20, accent: 24},
  square: {key: 4, pill: 6, accent: 6},
  // Large enough to round a key's short side fully, so ordinary keys come
  // out as pills/circles.
  bubble: {key: 999, pill: 999, accent: 999},
};

export interface KeyDecor {
  // Spread onto a key's style, after styles.key.
  key: object;
  pillRadius: number;
  accentRadius: number;
  // For the pressed-key overlay, so it matches the key's corners.
  radius: number;
  labelWeight: '400' | '700';
}

export function keyDecor(style: KeyStyle, theme: KeyboardTheme): KeyDecor {
  const radius = RADIUS[style.shape];
  const key: Record<string, unknown> = {borderRadius: radius.key};
  if (style.outline) {
    key.borderWidth = 1;
    key.borderColor = theme.keyText + '40';
  }
  if (style.raised) {
    key.borderBottomWidth = 3;
    key.borderBottomColor = theme.isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.18)';
  }
  return {
    key,
    pillRadius: radius.pill,
    accentRadius: radius.accent,
    radius: radius.key,
    labelWeight: style.boldLabels ? '700' : '400',
  };
}
