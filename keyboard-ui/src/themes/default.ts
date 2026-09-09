import type {KeyboardTheme} from './themeTypes';

// Palette matches Gboard's default light/dark themes (white/near-white keys
// on a light gray tray, Google-blue accent) so this keyboard reads as a
// standard Android IME rather than a custom-branded one.
export const lightTheme: KeyboardTheme = {
  id: 'light',
  name: 'Light',
  keyBackground: '#FFFFFF',
  keyPressedBackground: '#E8EAED',
  keyText: '#202124',
  panelBackground: '#EEEEF0',
  accent: '#1A73E8',
  isDark: false,
};

export const darkTheme: KeyboardTheme = {
  id: 'dark',
  name: 'Dark',
  keyBackground: '#3C4043',
  keyPressedBackground: '#4E5155',
  keyText: '#E8EAED',
  panelBackground: '#25272B',
  accent: '#8AB4F8',
  isDark: true,
};

export const defaultTheme = lightTheme;
