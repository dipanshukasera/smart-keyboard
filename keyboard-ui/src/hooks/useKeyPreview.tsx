import React, {useEffect, useRef, useState} from 'react';
import {LayoutChangeEvent, StyleSheet, Text, View} from 'react-native';
import {createStore, StoreApi, useStore} from 'zustand';

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
  // Corner radius for the press highlight, when it differs from a plain
  // key's (pill and enter keys).
  radius?: number;
}

interface PreviewTheme {
  keyBackground: string;
  keyText: string;
  accent: string;
}

// What's pressed right now. Kept in its own little store rather than the
// keyboard's React state: only PressLayer subscribes to it, so a press
// re-renders that one small layer instead of every key on the keyboard -
// re-rendering all the keys on each press is what made fast typing lag.
interface PressState {
  pressedKeyId: string | null;
  // Captured at press time - typing a letter can turn shift off in the
  // same tap, which would otherwise flip the bubble to lowercase while the
  // finger is still down. null = highlight only, no bubble.
  previewLabel: string | null;
  // Replaces the bubble for a moment that isn't a plain press - a held
  // top-row key's number once its long-press fires (drawn with an accent
  // border).
  override: {keyId: string; label: string} | null;
}

/**
 * Press highlight plus a Gboard-style preview bubble above the pressed key,
 * shared by every panel that has typeable keys (main keyboard, symbols).
 *
 * Both are drawn once at the panel level by PressLayer, positioned from
 * each key's measured layout, rather than inside the keys: a key built on
 * HoldRepeatKeyView clips its children to its own bounds (so a popup inside
 * it showed as a sliver), and keys that change on every press meant every
 * key re-rendered on every press.
 *
 * Usage: `onBodyLayout` on the panel's root View, `trackRowLayout` on each
 * row, `trackKeyLayout` on each key, `pressKey` / `releaseKey` from the
 * key's press handlers, and `renderPreview(...)` as the root View's last
 * child.
 */
export function useKeyPreview() {
  const storeRef = useRef<StoreApi<PressState>>();
  if (!storeRef.current) {
    storeRef.current = createStore<PressState>(() => ({pressedKeyId: null, previewLabel: null, override: null}));
  }
  const store = storeRef.current;
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
  // highlight straight from one key to the next.
  const pressKey = (id: string, label: string | null = null) => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = null;
    store.setState({pressedKeyId: id, previewLabel: label});
  };

  const releaseKey = () => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null;
      store.setState({pressedKeyId: null, previewLabel: null});
    }, PRESS_HIGHLIGHT_MIN_MS);
  };

  // Immediately, without the minimum-visible delay (e.g. a swipe starting).
  const clearPress = () => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = null;
    store.setState({pressedKeyId: null, previewLabel: null});
  };

  const setPreviewOverride = (override: PressState['override']) => store.setState({override});

  const onBodyLayout = (e: LayoutChangeEvent) => setBodyWidth(e.nativeEvent.layout.width);

  const trackRowLayout = (row: string) => (e: LayoutChangeEvent) => {
    rowTopRef.current[row] = e.nativeEvent.layout.y;
  };

  const trackKeyLayout = (keyId: string, row: string, radius?: number) => (e: LayoutChangeEvent) => {
    const {x, width, height} = e.nativeEvent.layout;
    keyRectRef.current[keyId] = {row, x, width, height, radius};
  };

  // Every measured key's box in panel coordinates - the swipe decoder's
  // map of where each letter is.
  const keyBoxes = (): {keyId: string; x: number; y: number; width: number; height: number}[] =>
    Object.entries(keyRectRef.current).flatMap(([keyId, rect]) => {
      const top = rowTopRef.current[rect.row];
      return top == null ? [] : [{keyId, x: rect.x, y: top, width: rect.width, height: rect.height}];
    });

  // The key at (x, y) in panel coordinates, or null. Each key's box is
  // grown by `slop` on every side so a touch landing in the thin gap
  // between two keys still counts for the nearer one, instead of being
  // dropped - half the gap between neighbours (2dp key margins) never
  // reaches into the neighbouring key itself.
  const keyAt = (x: number, y: number, slop = 2): string | null => {
    for (const [keyId, rect] of Object.entries(keyRectRef.current)) {
      const top = rowTopRef.current[rect.row];
      if (top == null) continue;
      if (
        x >= rect.x - slop &&
        x < rect.x + rect.width + slop &&
        y >= top - slop &&
        y < top + rect.height + slop
      ) {
        return keyId;
      }
    }
    return null;
  };

  const renderPreview = (options: {
    theme: PreviewTheme;
    scale: number;
    fontFamily?: string | null;
    // The translucent "pressed" wash and a plain key's corner radius.
    highlightColor: string;
    radius: number;
  }): React.ReactNode => (
    <PressLayer
      store={store}
      rects={keyRectRef.current}
      rowTops={rowTopRef.current}
      bodyWidth={bodyWidth}
      {...options}
    />
  );

  return {
    pressKey,
    releaseKey,
    clearPress,
    setPreviewOverride,
    onBodyLayout,
    trackRowLayout,
    trackKeyLayout,
    keyAt,
    keyBoxes,
    renderPreview,
  };
}

function PressLayer({
  store,
  rects,
  rowTops,
  bodyWidth,
  theme,
  scale,
  fontFamily,
  highlightColor,
  radius,
}: {
  store: StoreApi<PressState>;
  rects: Record<string, KeyRect>;
  rowTops: Record<string, number>;
  bodyWidth: number;
  theme: PreviewTheme;
  scale: number;
  fontFamily?: string | null;
  highlightColor: string;
  radius: number;
}) {
  const pressedKeyId = useStore(store, state => state.pressedKeyId);
  const previewLabel = useStore(store, state => state.previewLabel);
  const override = useStore(store, state => state.override);

  const boxFor = (keyId: string | null) => {
    const rect = keyId ? rects[keyId] : undefined;
    const top = rect ? rowTops[rect.row] : undefined;
    return rect && top != null ? {rect, top} : null;
  };

  const pressed = boxFor(pressedKeyId);
  const bubbleKey = override ? override.keyId : previewLabel ? pressedKeyId : null;
  const bubbleText = override ? override.label : previewLabel;
  const bubble = bubbleText ? boxFor(bubbleKey) : null;

  let bubbleView: React.ReactNode = null;
  if (bubble) {
    const {rect, top} = bubble;
    const bubbleWidth = Math.max(rect.width * 1.35, 44 * scale);
    const bubbleHeight = rect.height * 1.3;
    const centredLeft = rect.x + rect.width / 2 - bubbleWidth / 2;
    // Kept inside the panel horizontally so edge keys don't push half the
    // bubble off-screen.
    const left = Math.min(Math.max(centredLeft, 2), Math.max(2, bodyWidth - bubbleWidth - 2));
    bubbleView = (
      <View
        pointerEvents="none"
        style={[
          styles.bubble,
          {
            left,
            // Just above the key, overlapping its top edge slightly so it
            // reads as coming out of that key - for the top row this
            // reaches up over the toolbar, as Gboard's does.
            top: top - bubbleHeight + rect.height * 0.2,
            width: bubbleWidth,
            height: bubbleHeight,
            // Opaque even on a photo theme's see-through keys, so the
            // keys under the bubble don't show through it.
            backgroundColor: theme.keyBackground.slice(0, 7),
            borderColor: override ? theme.accent : theme.keyText + '22',
          },
        ]}>
        <Text style={{color: theme.keyText, fontSize: 28 * scale, fontWeight: '500', fontFamily: fontFamily ?? undefined}}>
          {bubbleText}
        </Text>
      </View>
    );
  }

  return (
    <>
      {pressed && (
        // A translucent wash over the pressed key - visible against any
        // theme's key colour, and drawn here so the key itself never
        // changes (and never re-renders) on a press.
        <View
          pointerEvents="none"
          style={[
            styles.highlight,
            {
              left: pressed.rect.x,
              top: pressed.top,
              width: pressed.rect.width,
              height: pressed.rect.height,
              borderRadius: pressed.rect.radius ?? radius,
              backgroundColor: highlightColor,
            },
          ]}
        />
      )}
      {bubbleView}
    </>
  );
}

const styles = StyleSheet.create({
  highlight: {
    position: 'absolute',
  },
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
