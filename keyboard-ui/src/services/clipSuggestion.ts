import {NativeModules} from 'react-native';

const {ClipboardModule} = NativeModules;

// The latest thing the user copied, for the "paste" chip in the suggestion
// tray - or null when there's nothing worth offering (nothing copied, not
// text, put there by the keyboard itself, or marked sensitive by the app that
// copied it: see ClipboardModule.getClipboardInfo). `key` identifies this
// particular copy, so copying the same words again counts as new.
export async function readLatestCopy(): Promise<{text: string; key: string} | null> {
  try {
    const info = await ClipboardModule?.getClipboardInfo?.();
    if (!info || typeof info.text !== 'string' || !info.text.trim()) return null;
    return {text: info.text.trim(), key: `${info.timestamp}:${info.text.trim()}`};
  } catch {
    return null;
  }
}
