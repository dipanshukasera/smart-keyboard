import React, {useEffect, useRef, useState} from 'react';
import {LayoutChangeEvent, StyleSheet, Text, View} from 'react-native';

// A quick tap's press-in and press-out land within a few dozen ms of each
// other - often inside the same render - so clearing the highlight
// immediately on release meant it never actually reached the screen. Keep
// it up at least this long after release so every tap visibly registers.
const PRESS_HIGHLIGHT_MIN_MS = 90;

interface KeyRect {
  row: string;
  x: number;
  width: number;
  height: number;
}

interface PreviewTheme {
  keyBackground: string;
  keyText: string;
  accent: string;
}

/**
 * Press highlight plus a Gboard-style preview bubble above the pressed key,
 * shared by every panel that has typeable keys (main keyboard, symbols).
 *
 * The bubble is drawn once at the panel level, positioned from each key's
 * measured layout, rather than inside the key: a key built on
 * HoldRepeatKeyView clips its children to its own bounds, so a popup
 * rendered inside it showed as nothing more than a sliver along its edge.
 *
 * Usage: spread `onBodyLayout` on the panel's root View, `trackRowLayout`
 * on each row, `trackKeyLayout` on each previewable key, call `pressKey` /
 * `releaseKey` from the key's press handlers, and render
 * `renderPreview(...)` as the root View's last child.
 */
export function useKeyPreview() {
  const [pressedKeyId, setPressedKeyId] = useState<string | null>(null);
  // Captured at press time - typing a letter can turn shift off in the
  // same tap, which would otherwise flip the bubble to lowercase while the
  // finger is still down.
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowTopRef = useRef<Record<string, number>>({});
  const keyRectRef = useRef<Record<string, KeyRect>>({});
  const [bodyWidth, setBodyWidth] = useState(0);

  useEffect(
    () => () => {
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    },
    [],
  );

  // A new press cancels any pending clear, so fast typing hands the
  // highlight straight from one key to the next. `label` null means
  // highlight only, no bubble (shift, ?123, enter, space, delete).
  const pressKey = (id: string, label: string | null = null) => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = null;
    setPressedKeyId(id);
    setPreviewLabel(label);
  };

  const releaseKey = () => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null;
      setPressedKeyId(null);
      setPreviewLabel(null);
    }, PRESS_HIGHLIGHT_MIN_MS);
  };

  const onBodyLayout = (e: LayoutChangeEvent) => setBodyWidth(e.nativeEvent.layout.width);

  const trackRowLayout = (row: string) => (e: LayoutChangeEvent) => {
    rowTopRef.current[row] = e.nativeEvent.layout.y;
  };

  const trackKeyLayout = (keyId: string, row: string) => (e: LayoutChangeEvent) => {
    const {x, width, height} = e.nativeEvent.layout;
    keyRectRef.current[keyId] = {row, x, width, height};
  };

  // `override` replaces what's shown for a moment that isn't a plain press
  // - the main keyboard uses it to swap a held top-row key's bubble to its
  // number once the long-press fires, drawn with an accent border.
  const renderPreview = ({
    theme,
    scale,
    fontFamily,
    override,
  }: {
    theme: PreviewTheme;
    scale: number;
    fontFamily?: string | null;
    override?: {keyId: string; label: string} | null;
  }): React.ReactNode => {
    const keyId = override ? override.keyId : previewLabel ? pressedKeyId : null;
    const text = override ? override.label : previewLabel;
    const rect = keyId ? keyRectRef.current[keyId] : undefined;
    const rowTop = rect ? rowTopRef.current[rect.row] : undefined;
    if (!rect || rowTop == null || !text) return null;

    const bubbleWidth = Math.max(rect.width * 1.35, 44 * scale);
    const bubbleHeight = rect.height * 1.3;
    const centredLeft = rect.x + rect.width / 2 - bubbleWidth / 2;
    // Kept inside the panel horizontally so edge keys don't push half the
    // bubble off-screen.
    const left = Math.min(Math.max(centredLeft, 2), Math.max(2, bodyWidth - bubbleWidth - 2));
    return (
      <View
        pointerEvents="none"
        style={[
          styles.bubble,
          {
            left,
            // Just above the key, overlapping its top edge slightly so it
            // reads as coming out of that key - for the top row this
            // reaches up over the toolbar, as Gboard's does.
            top: rowTop - bubbleHeight + rect.height * 0.2,
            width: bubbleWidth,
            height: bubbleHeight,
            backgroundColor: theme.keyBackground,
            borderColor: override ? theme.accent : theme.keyText + '22',
          },
        ]}>
        <Text style={{color: theme.keyText, fontSize: 28 * scale, fontWeight: '500', fontFamily: fontFamily ?? undefined}}>
          {text}
        </Text>
      </View>
    );
  };

  return {
    pressedKeyId,
    setPressedKeyId,
    pressKey,
    releaseKey,
    onBodyLayout,
    trackRowLayout,
    trackKeyLayout,
    renderPreview,
  };
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    zIndex: 20,
  },
});
