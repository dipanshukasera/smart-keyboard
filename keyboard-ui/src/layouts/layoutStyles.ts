import type {LayoutDef, KeyDef} from './types';

/**
 * QWERTY/AZERTY/QWERTZ/Dvorak/Colemak are alternate *letter arrangements*
 * for the same (Latin) alphabet, independent of spoken language - unlike
 * activeLocale (which swaps dictionaries, punctuation, and non-Latin
 * scripts like Devanagari), a layout style only remaps which letter sits
 * where. Only meaningful for en-GB today; see KeyboardLayout's usage.
 */
export type LayoutStyle = 'qwerty' | 'azerty' | 'qwertz' | 'dvorak' | 'colemak';

export const LAYOUT_STYLE_LABELS: Record<LayoutStyle, string> = {
  qwerty: 'QWERTY',
  azerty: 'AZERTY',
  qwertz: 'QWERTZ',
  dvorak: 'Dvorak',
  colemak: 'Colemak',
};

// Each style's 26 letters grouped into its own natural row shape (row
// lengths intentionally differ between styles - the flex-based key
// renderer sizes keys proportionally within a row regardless of how many
// keys that row has, so a 7-key row and a 10-key row both render at full
// width). Row 3 excludes shift/delete - those stay fixed and get added
// back in buildStyledLayout.
const LAYOUT_STYLE_LETTERS: Record<LayoutStyle, [string[], string[], string[]]> = {
  qwerty: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  ],
  azerty: [
    ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['m', 'w', 'x', 'c', 'v', 'b', 'n'],
  ],
  qwertz: [
    ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['y', 'x', 'c', 'v', 'b', 'n', 'm'],
  ],
  dvorak: [
    ['p', 'y', 'f', 'g', 'c', 'r', 'l'],
    ['a', 'o', 'e', 'u', 'i', 'd', 'h', 't', 'n', 's'],
    ['q', 'j', 'k', 'x', 'b', 'm', 'w', 'v', 'z'],
  ],
  colemak: [
    ['q', 'w', 'f', 'p', 'g', 'j', 'l', 'u', 'y'],
    ['a', 'r', 's', 't', 'd', 'h', 'n', 'e', 'i', 'o'],
    ['z', 'x', 'c', 'v', 'b', 'k', 'm'],
  ],
};

export const LAYOUT_STYLES: LayoutStyle[] = ['qwerty', 'azerty', 'qwertz', 'dvorak', 'colemak'];

// Rebuilds only the 3 letter rows of `base` (assumed to be the plain
// en-GB QWERTY layout) using `style`'s arrangement; the bottom
// punctuation/space/enter row is copied through untouched, since none of
// these styles change it.
export function buildStyledLayout(style: LayoutStyle, base: LayoutDef): LayoutDef {
  if (style === 'qwerty') return base;
  const [row1, row2, row3] = LAYOUT_STYLE_LETTERS[style];
  const toKeys = (letters: string[]): KeyDef[] => letters.map(key => ({key}));

  return {
    ...base,
    rows: [
      toKeys(row1),
      toKeys(row2),
      [
        {key: 'shift', action: 'shift', width: 1.5},
        ...toKeys(row3),
        {key: 'delete', action: 'delete', width: 1.5},
      ],
      base.rows[3],
    ],
  };
}
