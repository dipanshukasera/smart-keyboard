import {NativeModules} from 'react-native';

// What VoiceInputModule emits as "onVoiceEvent" (see its class comment).
export type VoiceEvent =
  | {type: 'ready'}
  | {type: 'level'; level: number}
  | {type: 'language'; language: string}
  | {type: 'partial'; text: string}
  | {type: 'result'; text: string}
  | {type: 'end'}
  | {type: 'error'; code: 'no_speech' | 'permission' | 'network' | 'busy' | 'language' | 'other'}
  | {type: 'permission'; granted: boolean};

interface VoiceInputNative {
  isAvailable(): Promise<boolean>;
  hasPermission(): Promise<boolean>;
  requestPermission(): void;
  start(languages: string[]): void;
  stop(): void;
  cancel(): void;
}

const native = NativeModules.VoiceInput as VoiceInputNative | undefined;

export const VoiceInput = {
  async isAvailable(): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.isAvailable();
    } catch {
      return false;
    }
  },
  async hasPermission(): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.hasPermission();
    } catch {
      return false;
    }
  },
  requestPermission(): void {
    native?.requestPermission();
  },
  // `languages`: every language the user might speak - the recognizer
  // detects which one it hears.
  start(languages: string[]): void {
    native?.start(languages);
  },
  stop(): void {
    native?.stop();
  },
  cancel(): void {
    native?.cancel();
  },
};
