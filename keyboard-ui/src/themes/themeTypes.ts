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
  // How the user framed the photo (BackgroundAdjust): zoom as a multiple of
  // "fill" (1 = covers the keyboard exactly, smaller shows the whole photo),
  // and the move from centred as a fraction of the keyboard's width/height.
  // backgroundAspect is the photo's width / height. Absent on photo themes
  // made before framing existed - those keep the whole photo, fitted.
  backgroundZoom?: number;
  backgroundOffsetX?: number;
  backgroundOffsetY?: number;
  backgroundAspect?: number;
}
