import {NativeModules} from 'react-native';

interface EmojiSupportNative {
  filterSupported(emojis: string[]): Promise<boolean[]>;
}

const native = NativeModules.EmojiSupport as EmojiSupportNative | undefined;

export const EmojiSupport = {
  // One boolean per emoji: can this phone's emoji font draw it? Everything
  // counts as drawable if the native side isn't there (nothing is hidden
  // on a guess).
  async filterSupported(emojis: string[]): Promise<boolean[]> {
    if (!native) return emojis.map(() => true);
    try {
      return await native.filterSupported(emojis);
    } catch {
      return emojis.map(() => true);
    }
  },
};
