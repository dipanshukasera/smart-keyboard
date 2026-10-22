import {NativeModules} from 'react-native';

interface FloatingKeyboardNative {
  isFloating(): Promise<boolean>;
  setFloating(floating: boolean): void;
  setHandleColors(surfaceHex: string, gripHex: string): void;
}

const native = NativeModules.FloatingKeyboard as FloatingKeyboardNative | undefined;

// Floating mode: the keyboard becomes a card you can drag anywhere on the
// screen (see ImeService). Changes also arrive as an "onFloatingChanged"
// event - App listens and keeps the store's `floating` in step.
export const FloatingKeyboard = {
  async isFloating(): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.isFloating();
    } catch {
      return false;
    }
  },

  setFloating(floating: boolean): void {
    try {
      native?.setFloating(floating);
    } catch {
      // ignore
    }
  },

  // #RRGGBB colours for the drag handle's strip and its grip.
  setHandleColors(surfaceHex: string, gripHex: string): void {
    try {
      native?.setHandleColors(surfaceHex, gripHex);
    } catch {
      // ignore
    }
  },
};
