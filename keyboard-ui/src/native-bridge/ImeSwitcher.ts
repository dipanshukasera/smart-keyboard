import {NativeModules} from 'react-native';

interface ImeSwitcherNative {
  showPicker(): void;
}

const native = NativeModules.ImeSwitcherModule as ImeSwitcherNative | undefined;

export const ImeSwitcher = {
  // Fire-and-forget, same as the other native-bridge modules here - a
  // missing module or a platform-side throw should never interrupt
  // typing over what's a convenience shortcut, not a core feature.
  showPicker(): void {
    try {
      native?.showPicker();
    } catch {
      // ignore
    }
  },
};
