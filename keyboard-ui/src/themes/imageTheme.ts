import type {KeyboardTheme} from './themeTypes';
import type {PickedBackground} from '../native-bridge/BackgroundImage';

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// `amount` of the way from `hex` to `target`.
function mix(hex: string, target: string, amount: number): string {
  const a = rgb(hex);
  const b = rgb(target);
  return toHex([0, 1, 2].map(i => a[i] + (b[i] - a[i]) * amount) as [number, number, number]);
}

function luminanceOf(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * A theme built around a photo: the photo fills the keyboard, the keys are
 * see-through tints of its main colour (so the photo shows through them),
 * the text is white or near-black to suit how bright the photo is, and the
 * accent (enter key, highlights) takes its most vivid colour.
 */
export function themeFromImage(picked: PickedBackground): KeyboardTheme {
  const isDark = picked.luminance < 0.55;
  const base = picked.dominant;
  // Keys: a lighter (dark photo) or paler (light photo) shade of the main
  // colour at ~70% opacity - 8-digit #RRGGBBAA.
  const keyBackground = (isDark ? mix(base, '#FFFFFF', 0.18) : mix(base, '#FFFFFF', 0.6)) + 'B3';
  const keyPressedBackground = (isDark ? mix(base, '#FFFFFF', 0.4) : mix(base, '#000000', 0.15)) + 'D9';
  // The enter key's icon is white, so keep the accent dark enough for it.
  let accent = picked.vibrant ?? (isDark ? mix(base, '#FFFFFF', 0.45) : mix(base, '#000000', 0.35));
  while (luminanceOf(accent) > 0.6) accent = mix(accent, '#000000', 0.2);
  return {
    id: `photo-${Date.now()}`,
    name: 'Photo',
    keyBackground,
    keyPressedBackground,
    keyText: isDark ? '#FFFFFF' : '#1A1A1A',
    // Panels let the photo show through; App draws a light/dark wash over
    // it (backgroundScrim) so text stays readable.
    panelBackground: 'transparent',
    accent,
    isDark,
    backgroundImage: picked.uri,
    backgroundScrim: isDark ? '#00000059' : '#FFFFFF59',
    backgroundBase: base,
  };
}
