import {NativeModules} from 'react-native';

/**
 * Thin typed wrapper around the InputConnectionBridge native module
 * (android-shell/.../InputConnectionBridge.java). Keep method names and
 * signatures in sync with docs/IME_BRIDGE_PROTOCOL.md.
 */
export type ImeAction = 'search' | 'send' | 'go' | 'done' | 'next' | 'unspecified';

interface InputConnectionBridgeNative {
  commitText(text: string): void;
  deleteBackward(count: number): void;
  replaceBefore(count: number, text: string): void;
  sendEnter(): void;
  getTextBeforeCursor(length: number): Promise<string>;
  setSelection(start: number, end: number): void;
  getImeAction(): Promise<ImeAction>;
  getCursorPosition(): Promise<number>;
  deleteSelection(): void;
  moveCursor(direction: number): void;
  isPasswordField(): Promise<boolean>;
  getFieldInfo(): Promise<FieldInfo>;
}

export interface FieldInfo {
  isPasswordField: boolean;
  isNumericField: boolean;
  allowDecimal: boolean;
  allowSign: boolean;
}

const native = NativeModules.InputConnectionBridge as InputConnectionBridgeNative | undefined;

function requireNative(): InputConnectionBridgeNative {
  if (!native) {
    throw new Error(
      'InputConnectionBridge native module is not linked. Are you running outside the IME host?',
    );
  }
  return native;
}

export const InputConnection = {
  commitText(text: string): void {
    requireNative().commitText(text);
  },

  deleteBackward(count: number = 1): void {
    requireNative().deleteBackward(count);
  },

  sendEnter(): void {
    requireNative().sendEnter();
  },

  async getTextBeforeCursor(length: number): Promise<string> {
    return requireNative().getTextBeforeCursor(length);
  },

  setSelection(start: number, end: number): void {
    requireNative().setSelection(start, end);
  },

  async getImeAction(): Promise<ImeAction> {
    if (!native) return 'unspecified';
    try {
      return await native.getImeAction();
    } catch {
      return 'unspecified';
    }
  },

  // Cursor offset relative to up to 1000 characters before it (see the
  // native side) - used to turn a drag distance into an absolute
  // setSelection() range for the hold-backspace-to-select gesture.
  async getCursorPosition(): Promise<number> {
    if (!native) return 0;
    try {
      return await native.getCursorPosition();
    } catch {
      return 0;
    }
  },

  deleteSelection(): void {
    requireNative().deleteSelection();
  },

  // Swaps the last `count` characters for `text` in one step.
  replaceBefore(count: number, text: string): void {
    requireNative().replaceBefore(count, text);
  },

  // direction < 0 moves left, > 0 moves right - backs spacebar-drag cursor
  // control.
  moveCursor(direction: number): void {
    requireNative().moveCursor(direction);
  },

  async isPasswordField(): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.isPasswordField();
    } catch {
      return false;
    }
  },

  async getFieldInfo(): Promise<FieldInfo | null> {
    if (!native) return null;
    try {
      return await native.getFieldInfo();
    } catch {
      return null;
    }
  },
};
