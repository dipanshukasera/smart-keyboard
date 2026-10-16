export interface KeyboardTheme {
  id: string;
  name: string;
  keyBackground: string;
  keyPressedBackground: string;
  keyText: string;
  panelBackground: string;
  accent: string;
  isDark: boolean;
  // Photo themes (themes/imageTheme.ts): a file:// image drawn behind the
  // whole keyboard, the wash over it, and its main colour (shown while it
  // loads, and for the swatch).
  backgroundImage?: string;
  backgroundScrim?: string;
  backgroundBase?: string;
}
