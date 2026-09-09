export interface KeyDef {
  key: string;
  action?: 'shift' | 'delete' | 'space' | 'enter' | 'symbols' | 'emoji';
  width?: number;
}

export interface LayoutDef {
  locale: string;
  displayName: string;
  rows: KeyDef[][];
}
