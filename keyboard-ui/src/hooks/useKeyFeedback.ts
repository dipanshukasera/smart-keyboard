import {Vibration} from 'react-native';
import {KeySound} from '../native-bridge/SoundModule';
import {useKeyboardStore} from '../store';

/**
 * The click sound and short vibration for a key press, per the "Key sound"
 * and "Haptic feedback" settings. Shared by every panel with typeable keys
 * (letters, ?123 symbols, the number pad) - it used to live only in the
 * letter keyboard, so symbol and number keys were silent with sound on.
 */
export function useKeyFeedback(): () => void {
  // Just these two settings - subscribing to the whole store re-rendered
  // every keyboard using this hook on each letter typed.
  const hapticFeedbackEnabled = useKeyboardStore(state => state.hapticFeedbackEnabled);
  const keySoundEnabled = useKeyboardStore(state => state.keySoundEnabled);
  return () => {
    if (hapticFeedbackEnabled) Vibration.vibrate(8);
    if (keySoundEnabled) KeySound.playKeyClick();
  };
}
