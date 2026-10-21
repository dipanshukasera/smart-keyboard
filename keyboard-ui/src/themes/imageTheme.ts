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

// --- Framing a photo behind the keyboard ---------------------------------
// The photo is positioned inside a width x height area (the keyboard, or the
// preview of it) from three numbers the user sets: zoom, and a move from
// centred as a fraction of the area's width/height.

export const MAX_BACKGROUND_ZOOM = 4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Where the photo sits, in the area's own coordinates. Zoom 1 is "fill": the
// photo just covers the area (cropping whichever dimension is longer).
export function backgroundFrame(
  width: number,
  height: number,
  aspect: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const coverWidth = Math.max(width, height * aspect);
  const frameWidth = coverWidth * zoom;
  const frameHeight = frameWidth / aspect;
  return {
    width: frameWidth,
    height: frameHeight,
    left: (width - frameWidth) / 2 + offsetX * width,
    top: (height - frameHeight) / 2 + offsetY * height,
  };
}

// The smallest zoom that still shows the whole photo ("fit").
export function fitZoom(width: number, height: number, aspect: number): number {
  return Math.min(width, height * aspect) / Math.max(width, height * aspect);
}

// Keeps a framing in bounds: not zoomed out past "fit" or in past
// MAX_BACKGROUND_ZOOM, and not moved far enough to show a bare edge where
// the photo is bigger than the area (where it's smaller it stays centred, the
// blurred copy fills round it).
export function clampFraming(
  width: number,
  height: number,
  aspect: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const clampedZoom = clamp(zoom, fitZoom(width, height, aspect), MAX_BACKGROUND_ZOOM);
  const frame = backgroundFrame(width, height, aspect, clampedZoom, 0, 0);
  const maxX = Math.max(0, (frame.width - width) / 2) / width;
  const maxY = Math.max(0, (frame.height - height) / 2) / height;
  return {zoom: clampedZoom, offsetX: clamp(offsetX, -maxX, maxX), offsetY: clamp(offsetY, -maxY, maxY)};
}
