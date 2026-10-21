import React, {useEffect, useState} from 'react';
import {DeviceEventEmitter, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {ENTER_ICON_BY_ACTION, PILL_BACKGROUND, PILL_TEXT} from './KeyboardLayout';
import {HoldRepeatKeyView} from './HoldRepeatKeyView';
import {useKeyPreview} from '../hooks/useKeyPreview';
import {useKeyFeedback} from '../hooks/useKeyFeedback';
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

const DEVANAGARI_DIGITS = ['१', '२', '३', '४', '५', '६', '७', '८', '९', '०'];

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
  const {theme, setActivePanel, keyboardSizeScale, keyStyle, keyFontFamily, activeLocale} = useKeyboardStore();
  // Same key shape/outline/3D/bold as the letter keyboard.
  const decor = keyDecor(keyStyle, theme);
  const [page, setPage] = useState<'one' | 'two'>('one');
  // Send/search/next/newline to match the field, as on the letter keyboard.
  const [enterIcon, setEnterIcon] = useState('keyboard-return');
  useEffect(() => {
    const refresh = () => {
      InputConnection.getImeAction()
        .then(action => setEnterIcon(ENTER_ICON_BY_ACTION[action]))
        .catch(() => {});
    };
    refresh();
    const subscription = DeviceEventEmitter.addListener('onInputFieldChanged', refresh);
    return () => subscription.remove();
  }, []);
  const active = page === 'one' ? PAGE_ONE : PAGE_TWO;
  // While typing Hindi the digit row is Devanagari (१ २ ३…); in every other
  // language it's 1 2 3…. Everything else on this panel is the same.
  const rows = page === 'one' && activeLocale === 'hi-IN' ? [DEVANAGARI_DIGITS, ...active.rows.slice(1)] : active.rows;

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
  // Sound/vibration on every key, same as the letter keyboard.
  const fireKeyFeedback = useKeyFeedback();

  // Same press feedback as the main keyboard: a highlight on every key,
  // plus the preview bubble on keys that type a character.
  const {pressKey, releaseKey, onBodyLayout, trackRowLayout, trackKeyLayout, renderPreview} =
    useKeyPreview();
  const pressOverlayColor = theme.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';


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
          backgroundColor: theme.keyBackground,
          paddingVertical: keyPaddingVertical,
        },
      ]}
      onPressIn={() => {
        pressKey(id, symbol);
        fireKeyFeedback();
        commit(symbol);
      }}
      onPressOut={releaseKey}>
      <Text style={{color: theme.keyText, fontSize: keyFontSize, fontWeight: decor.labelWeight, fontFamily: keyFontFamily ?? undefined}}>
        {symbol}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]} onLayout={onBodyLayout}>
      {rows.slice(0, 2).map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[styles.row, {marginVertical: rowMarginVertical}]}
          onLayout={trackRowLayout(String(rowIndex))}>
          {/* The second row is inset half a key on each side, like the
              letter keyboard's (a-l under q-p). */}
          {rowIndex === 1 && <View style={styles.rowInset} />}
          {row.map((symbol, keyIndex) => symbolKey(`${rowIndex}-${keyIndex}`, String(rowIndex), symbol))}
          {rowIndex === 1 && <View style={styles.rowInset} />}
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
          onPressIn={() => {
            pressKey('pageToggle');
            fireKeyFeedback();
          }}
          onPressOut={releaseKey}
          onLayout={trackKeyLayout('pageToggle', '2', decor.pillRadius)}
          onPress={() => setPage(page === 'one' ? 'two' : 'one')}>
          <Text style={{color: PILL_TEXT, fontSize: 13 * keyboardSizeScale}}>{active.togglePill}</Text>
        </TouchableOpacity>
        {rows[2].map((symbol, keyIndex) => symbolKey(`2-${keyIndex}`, '2', symbol))}
        <HoldRepeatKeyView
          mode="repeat"
          longPressDelayMs={HOLD_REPEAT_INITIAL_DELAY_MS}
          repeatIntervalMs={HOLD_REPEAT_INTERVAL_MS}
          onPressStart={() => pressKey('delete')}
          onRepeatTick={() => {
            fireKeyFeedback();
            InputConnection.deleteBackward(1);
          }}
          onPressEnd={releaseKey}
          onLayout={trackKeyLayout('delete', '2')}
          style={[
            styles.key,
            decor.key,
            {
              flex: 1.5,
              backgroundColor: theme.keyBackground,
              paddingVertical: keyPaddingVertical,
            },
          ]}>
          <Icon name="backspace" size={keyIconSize} color={theme.keyText} />
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
          onPressIn={() => {
            pressKey('abc');
            fireKeyFeedback();
          }}
          onPressOut={releaseKey}
          onLayout={trackKeyLayout('abc', '3', decor.pillRadius)}
          onPress={() => setActivePanel('keyboard')}>
          <Text style={{color: PILL_TEXT, fontSize: 13 * keyboardSizeScale}}>ABC</Text>
        </TouchableOpacity>
        {symbolKey('3-left', '3', active.bottomLeftPunct)}
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.key,
            decor.key,
            {
              flex: 4,
              backgroundColor: theme.keyBackground,
              paddingVertical: keyPaddingVertical,
            },
          ]}
          onPressIn={() => {
            pressKey('space');
            fireKeyFeedback();
            commit(' ');
          }}
          onPressOut={releaseKey}
          onLayout={trackKeyLayout('space', '3')}>
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
          onPressIn={() => {
            pressKey('enter');
            fireKeyFeedback();
          }}
          onPressOut={releaseKey}
          onLayout={trackKeyLayout('enter', '3', decor.accentRadius)}
          onPress={() => InputConnection.sendEnter()}>
          <Icon name={enterIcon} size={keyIconSize} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {renderPreview({theme, scale: keyboardSizeScale, highlightColor: pressOverlayColor, radius: decor.radius})}
    </View>
  );
}

const styles = StyleSheet.create({
  rowInset: {
    flex: 0.5,
  },
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
});
