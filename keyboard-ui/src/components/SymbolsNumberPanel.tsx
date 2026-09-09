import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {PILL_BACKGROUND, PILL_TEXT} from './KeyboardLayout';
import {HoldRepeatKeyView} from './HoldRepeatKeyView';

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
  const {theme, setActivePanel, keyboardSizeScale} = useKeyboardStore();
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

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      {active.rows.slice(0, 2).map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, {marginVertical: rowMarginVertical}]}>
          {row.map(symbol => (
            <TouchableOpacity
              key={symbol}
              style={[styles.key, {backgroundColor: theme.keyBackground, paddingVertical: keyPaddingVertical}]}
              onPress={() => commit(symbol)}>
              <Text style={{color: theme.keyText, fontSize: keyFontSize}}>{symbol}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <View style={[styles.row, {marginVertical: rowMarginVertical}]}>
        <TouchableOpacity
          style={[
            styles.key,
            styles.pillKey,
            {flex: 1.5, backgroundColor: PILL_BACKGROUND, paddingVertical: keyPaddingVertical},
          ]}
          onPress={() => setPage(page === 'one' ? 'two' : 'one')}>
          <Text style={{color: PILL_TEXT, fontSize: 13 * keyboardSizeScale}}>{active.togglePill}</Text>
        </TouchableOpacity>
        {active.rows[2].map(symbol => (
          <TouchableOpacity
            key={symbol}
            style={[styles.key, {backgroundColor: theme.keyBackground, paddingVertical: keyPaddingVertical}]}
            onPress={() => commit(symbol)}>
            <Text style={{color: theme.keyText, fontSize: keyFontSize}}>{symbol}</Text>
          </TouchableOpacity>
        ))}
        <HoldRepeatKeyView
          mode="repeat"
          longPressDelayMs={HOLD_REPEAT_INITIAL_DELAY_MS}
          repeatIntervalMs={HOLD_REPEAT_INTERVAL_MS}
          onRepeatTick={() => InputConnection.deleteBackward(1)}
          style={[styles.key, {flex: 1.5, backgroundColor: theme.keyBackground, paddingVertical: keyPaddingVertical}]}>
          <Icon name="backspace" size={keyIconSize} color={theme.keyText} />
        </HoldRepeatKeyView>
      </View>

      <View style={[styles.row, {marginVertical: rowMarginVertical}]}>
        <TouchableOpacity
          style={[
            styles.key,
            styles.pillKey,
            {flex: 1.5, backgroundColor: PILL_BACKGROUND, paddingVertical: keyPaddingVertical},
          ]}
          onPress={() => setActivePanel('keyboard')}>
          <Text style={{color: PILL_TEXT, fontSize: 13 * keyboardSizeScale}}>ABC</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.key, {backgroundColor: theme.keyBackground, paddingVertical: keyPaddingVertical}]}
          onPress={() => commit(active.bottomLeftPunct)}>
          <Text style={{color: theme.keyText, fontSize: keyFontSize}}>{active.bottomLeftPunct}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.key, {flex: 4, backgroundColor: theme.keyBackground, paddingVertical: keyPaddingVertical}]}
          onPress={() => commit(' ')}
        />
        <TouchableOpacity
          style={[styles.key, {backgroundColor: theme.keyBackground, paddingVertical: keyPaddingVertical}]}
          onPress={() => commit(active.bottomRightPunct)}>
          <Text style={{color: theme.keyText, fontSize: keyFontSize}}>{active.bottomRightPunct}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.key,
            styles.accentKey,
            {flex: 1.5, backgroundColor: theme.accent, paddingVertical: keyPaddingVertical},
          ]}
          onPress={() => InputConnection.sendEnter()}>
          <Icon name="keyboard-return" size={keyIconSize} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
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
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillKey: {
    borderRadius: 20,
  },
  accentKey: {
    borderRadius: 24,
  },
});
