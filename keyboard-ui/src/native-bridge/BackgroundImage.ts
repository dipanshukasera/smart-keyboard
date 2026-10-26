import {NativeModules} from 'react-native';

export interface PickedBackground {
  // file:// uri of the app's own resized copy.
  uri: string;
  // Most common colour, and the most vivid one covering a real part of the
  // image (absent for a near-greyscale photo), both #RRGGBB.
  dominant: string;
  vibrant?: string;
  // 0 (black) .. 1 (white), averaged over the image.
  luminance: number;
  // width / height of the saved copy (downloads only).
  aspect?: number;
}

interface BackgroundImageNative {
  pick(): Promise<PickedBackground | null>;
  remove(uri: string): void;
  download(url: string): Promise<PickedBackground>;
  systemAccent(): Promise<string | null>;
}

const native = NativeModules.BackgroundImage as BackgroundImageNative | undefined;

export const BackgroundImage = {
  // null when the user backs out of the picker. Rejects if the image
  // couldn't be read.
  async pick(): Promise<PickedBackground | null> {
    if (!native) return null;
    return native.pick();
  },

  // A gallery picture, downloaded and saved like a picked photo.
  async download(url: string): Promise<PickedBackground> {
    if (!native) throw new Error('Not available');
    return native.download(url);
  },

  // Android 12+ system accent colour, #RRGGBB, else null.
  async systemAccent(): Promise<string | null> {
    if (!native) return null;
    try {
      return await native.systemAccent();
    } catch {
      return null;
    }
  },

  remove(uri: string): void {
    try {
      native?.remove(uri);
    } catch {
      // ignore
    }
  },
};
