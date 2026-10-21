export interface KeyDef {
  key: string;
  // 'page' flips a layout with several pages (see LayoutDef.extraPages).
  action?: 'shift' | 'delete' | 'space' | 'enter' | 'symbols' | 'emoji' | 'page';
  width?: number;
  // What the key shows when that isn't what it types (a combining mark
  // drawn on a dotted circle, the language name on the space bar).
  label?: string;
  // Drawn in a quieter shade, for the less-used keys of a layout.
  dim?: boolean;
}

export interface LayoutDef {
  locale: string;
  displayName: string;
  rows: KeyDef[][];
  // More pages for a layout that needs them (Hindi's "1/4" key): each is
  // the rows that replace all of `rows` but the last, which every page
  // shares. `rows` itself is page one.
  extraPages?: KeyDef[][][];
  // false: no small hold-for-digit hints on the top row's keys.
  numberHints?: boolean;
}
