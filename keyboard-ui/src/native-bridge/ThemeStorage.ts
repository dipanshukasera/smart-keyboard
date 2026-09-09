import {NativeModules} from 'react-native';
import type {KeyboardTheme} from '../themes/themeTypes';

interface ThemeStorageNative {
  saveTheme(themeJson: string): void;
  loadTheme(): Promise<string | null>;
  saveActiveLocale(locale: string): void;
  loadActiveLocale(): Promise<string>;
  saveString(key: string, value: string): void;
  loadString(key: string): Promise<string | null>;
}

const native = NativeModules.ThemeStorageModule as ThemeStorageNative | undefined;

export const ThemeStorage = {
  saveTheme(theme: KeyboardTheme): void {
    native?.saveTheme(JSON.stringify(theme));
  },

  async loadTheme(): Promise<KeyboardTheme | null> {
    if (!native) return null;
    const json = await native.loadTheme();
    if (!json) return null;
    try {
      return JSON.parse(json) as KeyboardTheme;
    } catch {
      return null;
    }
  },

  saveActiveLocale(locale: string): void {
    native?.saveActiveLocale(locale);
  },

  async loadActiveLocale(): Promise<string> {
    if (!native) return 'en-US';
    return native.loadActiveLocale();
  },

  saveJSON(key: string, value: unknown): void {
    native?.saveString(key, JSON.stringify(value));
  },

  async loadJSON<T>(key: string, fallback: T): Promise<T> {
    if (!native) return fallback;
    const json = await native.loadString(key);
    if (!json) return fallback;
    try {
      return JSON.parse(json) as T;
    } catch {
      return fallback;
    }
  },
};
