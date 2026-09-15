import {NativeModules} from 'react-native';

interface SoundModuleNative {
  playKeyClick(): void;
}

const native = NativeModules.SoundModule as SoundModuleNative | undefined;

export const KeySound = {
  // Fire-and-forget: a missing native module (e.g. mid-development JS-only
  // testing) or a synchronous throw from the platform call should never
  // interrupt typing over a sound effect.
  playKeyClick(): void {
    try {
      native?.playKeyClick();
    } catch {
      // ignore
    }
  },
};
