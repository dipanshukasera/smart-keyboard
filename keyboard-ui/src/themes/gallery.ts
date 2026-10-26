import type {KeyboardTheme} from './themeTypes';
import {lightTheme, darkTheme} from './default';
import {BUILT_IN_THEMES} from './presets';

// The theme gallery (Themes screen): the system-following defaults, a grid of
// colours, and downloadable pictures - landscapes (public-domain CC0 photos
// from Wikimedia Commons, see docs/themes/landscapes/credits.json) and
// light/dark gradients. The pictures live on the project's website and are
// downloaded when tapped, then kept on the phone.
export const GALLERY_BASE = 'https://dipanshukasera.github.io/smart-keyboard/themes';

export type GalleryGroup = 'landscapes' | 'light' | 'dark';
export interface GalleryItem {
  // "<group>/<file>" - the path under GALLERY_BASE, without the extension.
  id: string;
  name: string;
  group: GalleryGroup;
}

export const galleryThumbUrl = (item: GalleryItem) => `${GALLERY_BASE}/${item.id}_t.jpg`;
export const galleryImageUrl = (item: GalleryItem) => `${GALLERY_BASE}/${item.id}.jpg`;

export const LANDSCAPES: GalleryItem[] = [
  {id: 'landscapes/beach-sunset', name: 'Beach sunset', group: 'landscapes'},
  {id: 'landscapes/waterfall', name: 'Waterfall', group: 'landscapes'},
  {id: 'landscapes/sandstone', name: 'Sandstone', group: 'landscapes'},
  {id: 'landscapes/alpine-lake', name: 'Alpine lake', group: 'landscapes'},
  {id: 'landscapes/foggy-forest', name: 'Foggy forest', group: 'landscapes'},
  {id: 'landscapes/sea-cliffs', name: 'Sea cliffs', group: 'landscapes'},
  {id: 'landscapes/snow-peaks', name: 'Snow peaks', group: 'landscapes'},
  {id: 'landscapes/autumn-lane', name: 'Autumn lane', group: 'landscapes'},
  {id: 'landscapes/aurora', name: 'Aurora', group: 'landscapes'},
  {id: 'landscapes/rice-terraces', name: 'Rice terraces', group: 'landscapes'},
];

export const LIGHT_GRADIENTS: GalleryItem[] = [
  {id: 'light/rose-sky', name: 'Rose sky', group: 'light'},
  {id: 'light/sage-mist', name: 'Sage mist', group: 'light'},
  {id: 'light/dusty-rose', name: 'Dusty rose', group: 'light'},
  {id: 'light/cloud-grey', name: 'Cloud grey', group: 'light'},
  {id: 'light/candy-pink', name: 'Candy pink', group: 'light'},
  {id: 'light/peach-ice', name: 'Peach ice', group: 'light'},
  {id: 'light/lemon-lilac', name: 'Lemon lilac', group: 'light'},
  {id: 'light/mint-blush', name: 'Mint blush', group: 'light'},
  {id: 'light/apricot', name: 'Apricot', group: 'light'},
  {id: 'light/lavender-mist', name: 'Lavender mist', group: 'light'},
  {id: 'light/seafoam', name: 'Seafoam', group: 'light'},
  {id: 'light/buttercream', name: 'Buttercream', group: 'light'},
  {id: 'light/sky-lilac', name: 'Sky lilac', group: 'light'},
  {id: 'light/blush-gold', name: 'Blush gold', group: 'light'},
  {id: 'light/pearl', name: 'Pearl', group: 'light'},
  {id: 'light/coral-cream', name: 'Coral cream', group: 'light'},
  {id: 'light/aqua-ice', name: 'Aqua ice', group: 'light'},
  {id: 'light/rosewater', name: 'Rosewater', group: 'light'},
];

export const DARK_GRADIENTS: GalleryItem[] = [
  {id: 'dark/midnight-orchid', name: 'Midnight orchid', group: 'dark'},
  {id: 'dark/graphite', name: 'Graphite', group: 'dark'},
  {id: 'dark/espresso', name: 'Espresso', group: 'dark'},
  {id: 'dark/slate-steel', name: 'Slate steel', group: 'dark'},
  {id: 'dark/deep-teal', name: 'Deep teal', group: 'dark'},
  {id: 'dark/royal-blue', name: 'Royal blue', group: 'dark'},
  {id: 'dark/navy-night', name: 'Navy night', group: 'dark'},
  {id: 'dark/charcoal-blue', name: 'Charcoal blue', group: 'dark'},
  {id: 'dark/mocha-ash', name: 'Mocha ash', group: 'dark'},
  {id: 'dark/plum-dusk', name: 'Plum dusk', group: 'dark'},
  {id: 'dark/forest-night', name: 'Forest night', group: 'dark'},
  {id: 'dark/crimson-ember', name: 'Crimson ember', group: 'dark'},
  {id: 'dark/ocean-deep', name: 'Ocean deep', group: 'dark'},
  {id: 'dark/indigo-void', name: 'Indigo void', group: 'dark'},
  {id: 'dark/copper-night', name: 'Copper night', group: 'dark'},
  {id: 'dark/violet-haze', name: 'Violet haze', group: 'dark'},
  {id: 'dark/steel-teal', name: 'Steel teal', group: 'dark'},
  {id: 'dark/rose-noir', name: 'Rose noir', group: 'dark'},
];

// --- Defaults that follow the phone ---------------------------------------

function mixHex(a: string, b: string, amount: number): string {
  const parse = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [pa, pb] = [parse(a), parse(b)];
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * amount).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export const SYSTEM_AUTO_THEME: KeyboardTheme = {...lightTheme, id: 'system-auto', name: 'System Auto', auto: 'system'};
export const DYNAMIC_COLOR_THEME: KeyboardTheme = {...lightTheme, id: 'dynamic-color', name: 'Dynamic Color', auto: 'dynamic'};

// Light or dark (per the phone's setting), and for Dynamic Color tinted with
// the phone's accent colour.
export function resolveAutoTheme(theme: KeyboardTheme, dark: boolean, systemAccent: string | null): KeyboardTheme {
  const base = dark ? darkTheme : lightTheme;
  if (theme.auto === 'dynamic') {
    const accent = systemAccent ?? (dark ? '#8AB4F8' : '#5BAEDC');
    return {
      ...base,
      id: theme.id,
      name: theme.name,
      auto: 'dynamic',
      keyBackground: dark ? mixHex('#2E3236', accent, 0.12) : mixHex('#FFFFFF', accent, 0.06),
      keyPressedBackground: dark ? mixHex('#3E4348', accent, 0.2) : mixHex('#E4E6EA', accent, 0.2),
      panelBackground: dark ? mixHex('#1E2023', accent, 0.1) : mixHex('#D4D4D6', accent, 0.1),
      accent: dark ? mixHex(accent, '#FFFFFF', 0.35) : accent,
    };
  }
  return {...base, id: theme.id, name: theme.name, auto: 'system'};
}

// --- Colours ----------------------------------------------------------------

const solid = (id: string, name: string, key: string, text: string, panel: string, accent: string, isDark: boolean): KeyboardTheme => ({
  id,
  name,
  keyBackground: key,
  keyPressedBackground: mixHex(key, isDark ? '#FFFFFF' : '#000000', 0.14),
  keyText: text,
  panelBackground: panel,
  accent,
  isDark,
});

// The first nine are the grid's first screen; the existing presets follow
// under "Show more".
export const COLOR_THEMES: KeyboardTheme[] = [
  solid('color-mist', 'Mist', '#F7F9FA', '#1F2933', '#ECEFF1', '#4DB6AC', false),
  solid('color-slate', 'Slate', '#37474F', '#ECEFF1', '#263238', '#80CBC4', true),
  solid('color-snow', 'Snow', '#FFFFFF', '#202124', '#F8F9FA', '#1A73E8', false),
  solid('color-graphite', 'Graphite', '#4A4E55', '#F1F3F4', '#35383D', '#6C9BFF', true),
  solid('color-red', 'Red', '#E53935', '#FFFFFF', '#C62828', '#FF5252', true),
  solid('color-green', 'Green', '#66BB6A', '#0B2A0F', '#43A047', '#2E7D32', false),
  solid('color-pine', 'Pine', '#00796B', '#E0F2F1', '#00695C', '#4DB6AC', true),
  solid('color-blue', 'Blue', '#1E6FD0', '#FFFFFF', '#1565C0', '#2E8BFF', true),
  solid('color-cyan', 'Cyan', '#B2EBF2', '#00363D', '#80DEEA', '#00ACC1', false),
  ...BUILT_IN_THEMES.filter(t => t.id !== lightTheme.id && t.id !== darkTheme.id),
];
