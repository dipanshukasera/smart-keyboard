import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {PILL_BACKGROUND, PILL_TEXT} from './KeyboardLayout';
import {HoldRepeatKeyView} from './HoldRepeatKeyView';
import {useKeyPreview} from '../hooks/useKeyPreview';
import {keyDecor} from '../themes/keyStyle';

// Hold-to-repeat delay/interval, matching KeyboardLayout's main-keyboard
// delete key - see HoldRepeatKeyView.java for why this is a native touch
// handler rather than a JS setInterval (a plain TouchableOpacity's own
// touch heuristics can cancel a hold before the timer ever fires).
const HOLD_REPEAT_INITIAL_DELAY_MS = 400;
const HOLD_REPEAT_INTERVAL_MS = 60;

// Mirrors Gboard's two symbol pages: "123" opens PAGE_ONE, whose "=\<" key
// flips to PAGE_TWO (more obscure symbols), whose "?123" key flips back.
const PAGE_ONE = {
  rows: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['@', '#', '$', '_', '&', '-', '+', '(', ')', '/'],
    ['*', '"', "'", ':', ';', '!', '?'],
  ],
  togglePill: '=\\<',
  bottomLeftPunct: ',',
  bottomRightPunct: '.',
};

const PAGE_TWO = {
  rows: [
    ['~', '`', '|', '•', '√', 'π', '÷', '×', '¶', 'Δ'],
    ['£', '¢', '€', '¥', '^', '°', '=', '{', '}', '\\'],
    ['%', '©', '®', '™', '✓', '[', ']'],
  ],
  togglePill: '?123',
  bottomLeftPunct: '<',
  bottomRightPunct: '>',
};

export function SymbolsNumberPanel() {
  const {theme, setActivePanel, keyboardSizeScale, keyStyle} = useKeyboardStore();
  // Same key shape/outline/3D/bold as the letter keyboard.
  const decor = keyDecor(keyStyle, theme);
  const [page, setPage] = useState<'one' | 'two'>('one');
  const active = page === 'one' ? PAGE_ONE : PAGE_TWO;

  // Same base values (and the same keyboardSizeScale factor) as
  // KeyboardLayout's main keyboard - this panel used to render at a fixed,
  // unscaled size regardless of keyboardSizeScale, so its content height
  // never matched the main keyboard's. App.tsx reports content height to
  // native on every layout to resize the IME window to fit, so that
  // mismatch made the window visibly jump every time you switched between
  // the main keyboard and this one.
  const keyPaddingVertical = 10 * keyboardSizeScale;
  const keyFontSize = 15 * keyboardSizeScale;
  const keyIconSize = 20 * keyboardSizeScale;
  const rowMarginVertical = 2 * keyboardSizeScale;

  const commit = (text: string) => InputConnection.commitText(text);

  // Same press feedback as the main keyboard: a highlight on every key,
  // plus the preview bubble on keys that type a character.
  const {pressedKeyId, pressKey, releaseKey, onBodyLayout, trackRowLayout, trackKeyLayout, renderPreview} =
    useKeyPreview();
  const pressOverlayColor = theme.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';

  const pressOverlay = (id: string, extraStyle?: object) =>
    pressedKeyId === id ? (
      <View
        pointerEvents="none"
        style={[styles.pressOverlay, {borderRadius: decor.radius}, extraStyle, {backgroundColor: pressOverlayColor}]}
      />
    ) : null;

  // A key that types `symbol`. Commits on press-in (not on release, which
  // is what onPress does) to match the main keyboard - typing there
  // registers the instant a key is touched.
  const symbolKey = (id: string, row: string, symbol: string) => (
    <TouchableOpacity
      key={id}
      // activeOpacity 1: the default fade to 20% hid the highlight and
      // bubble on the light theme - see KeyboardLayout.
      activeOpacity={1}
      onLayout={trackKeyLayout(id, row)}
      style={[
        styles.key,
        decor.key,
        {
          backgroundColor: pressedKeyId === id ? theme.keyPressedBackground : theme.keyBackground,
          paddingVertical: keyPaddingVertical,
        },
      ]}
      onPressIn={() => {
        pressKey(id, symbol);
        commit(symbol);
      }}
      onPressOut={releaseKey}>
      <Text style={{color: theme.keyText, fontSize: keyFontSize, fontWeight: decor.labelWeight}}>{symbol}</Text>
      {pressOverlay(id)}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]} onLayout={onBodyLayout}>
      {active.rows.slice(0, 2).map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[styles.row, {marginVertical: rowMarginVertical}]}
          onLayout={trackRowLayout(String(rowIndex))}>
          {row.map((symbol, keyIndex) => symbolKey(`${rowIndex}-${keyIndex}`, String(rowIndex), symbol))}
        </View>
      ))}

      <View style={[styles.row, {marginVertical: rowMarginVertical}]} onLayout={trackRowLayout('2')}>
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.key,
            decor.key,
            {borderRadius: decor.pillRadius},
            {flex: 1.5, backgroundColor: PILL_BACKGROUND, paddingVertical: keyPaddingVertical},
          ]}
          onPressIn={() => pressKey('pageToggle')}
          onPressOut={releaseKey}
          onPress={() => setPage(page === 'one' ? 'two' : 'one')}>
          <Text style={{color: PILL_TEXT, fontSize: 13 * keyboardSizeScale}}>{active.togglePill}</Text>
          {pressOverlay('pageToggle', {borderRadius: decor.pillRadius})}
        </TouchableOpacity>
        {active.rows[2].map((symbol, keyIndex) => symbolKey(`2-${keyIndex}`, '2', symbol))}
        <HoldRepeatKeyView
          mode="repeat"
          longPressDelayMs={HOLD_REPEAT_INITIAL_DELAY_MS}
          repeatIntervalMs={HOLD_REPEAT_INTERVAL_MS}
          onPressStart={() => pressKey('delete')}
          onRepeatTick={() => InputConnection.deleteBackward(1)}
          onPressEnd={releaseKey}
          style={[
            styles.key,
            decor.key,
            {
              flex: 1.5,
              backgroundColor: pressedKeyId === 'delete' ? theme.keyPressedBackground : theme.keyBackground,
              paddingVertical: keyPaddingVertical,
            },
          ]}>
          <Icon name="backspace" size={keyIconSize} color={theme.keyText} />
          {pressOverlay('delete')}
        </HoldRepeatKeyView>
      </View>

      <View style={[styles.row, {marginVertical: rowMarginVertical}]} onLayout={trackRowLayout('3')}>
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.key,
            decor.key,
            {borderRadius: decor.pillRadius},
            {flex: 1.5, backgroundColor: PILL_BACKGROUND, paddingVertical: keyPaddingVertical},
          ]}
          onPressIn={() => pressKey('abc')}
          onPressOut={releaseKey}
          onPress={() => setActivePanel('keyboard')}>
          <Text style={{color: PILL_TEXT, fontSize: 13 * keyboardSizeScale}}>ABC</Text>
          {pressOverlay('abc', {borderRadius: decor.pillRadius})}
        </TouchableOpacity>
        {symbolKey('3-left', '3', active.bottomLeftPunct)}
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.key,
            decor.key,
            {
              flex: 4,
              backgroundColor: pressedKeyId === 'space' ? theme.keyPressedBackground : theme.keyBackground,
              paddingVertical: keyPaddingVertical,
            },
          ]}
          onPressIn={() => {
            pressKey('space');
            commit(' ');
          }}
          onPressOut={releaseKey}>
          {pressOverlay('space')}
        </TouchableOpacity>
        {symbolKey('3-right', '3', active.bottomRightPunct)}
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.key,
            decor.key,
            {borderRadius: decor.accentRadius},
            {flex: 1.5, backgroundColor: theme.accent, paddingVertical: keyPaddingVertical},
          ]}
          onPressIn={() => pressKey('enter')}
          onPressOut={releaseKey}
          onPress={() => InputConnection.sendEnter()}>
          <Icon name="keyboard-return" size={keyIconSize} color="#FFFFFF" />
          {pressOverlay('enter', {borderRadius: decor.accentRadius})}
        </TouchableOpacity>
      </View>

      {renderPreview({theme, scale: keyboardSizeScale})}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 3,
  },
  key: {
    flex: 1,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 6,
  },
});
