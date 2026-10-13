import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {ENTER_ICON_BY_ACTION} from './KeyboardLayout';
import {HoldRepeatKeyView} from './HoldRepeatKeyView';
import {useKeyFeedback} from '../hooks/useKeyFeedback';

// Hold-to-repeat delay/interval, matching KeyboardLayout's main-keyboard
// delete key - see HoldRepeatKeyView.java for why this is a native touch
// handler rather than a JS setInterval (a plain TouchableOpacity's own
// touch heuristics can cancel a hold before the timer ever fires).
const HOLD_REPEAT_INITIAL_DELAY_MS = 400;
const HOLD_REPEAT_INTERVAL_MS = 60;

// Auto-shown instead of the letter keyboard whenever the focused field
// declares a numeric input class (TYPE_CLASS_NUMBER/PHONE/DATETIME) - a
// payment amount box, PIN field, or phone number field never wants QWERTY.
// See App.tsx's onInputFieldChanged listener and store's isNumericField.
export function NumericPanel() {
  const {theme, numericFieldAllowsDecimal, numericFieldAllowsSign, keyboardSizeScale} = useKeyboardStore();
  const keyPaddingVertical = 14 * keyboardSizeScale;
  const keyFontSize = 20 * keyboardSizeScale;
  const keyIconSize = 20 * keyboardSizeScale;
  const rowMarginVertical = 2 * keyboardSizeScale;
  const [enterIcon, setEnterIcon] = useState('keyboard-return');

  useEffect(() => {
    InputConnection.getImeAction()
      .then(action => setEnterIcon(ENTER_ICON_BY_ACTION[action]))
      .catch(() => {});
  }, []);

  // Sound/vibration on every key, same as the letter keyboard.
  const fireKeyFeedback = useKeyFeedback();
  const commit = (text: string) => {
    fireKeyFeedback();
    InputConnection.commitText(text);
  };

  // The bottom-left key is whichever of "." / "-" the field actually
  // accepts (never both - a real amount field takes one or the other, not
  // a full expression), and is left blank rather than guessing if neither
  // flag is set (e.g. a 4-digit PIN box).
  const cornerKey = numericFieldAllowsDecimal ? '.' : numericFieldAllowsSign ? '-' : null;

  const digitRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      {digitRows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, {marginVertical: rowMarginVertical}]}>
          {row.map(digit => (
            <TouchableOpacity
              key={digit}
              style={[styles.key, {backgroundColor: theme.keyBackground, paddingVertical: keyPaddingVertical}]}
              onPress={() => commit(digit)}>
              <Text style={{color: theme.keyText, fontSize: keyFontSize}}>{digit}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <View style={[styles.row, {marginVertical: rowMarginVertical}]}>
        <TouchableOpacity
          style={[
            styles.key,
            {backgroundColor: theme.keyBackground, opacity: cornerKey ? 1 : 0.3, paddingVertical: keyPaddingVertical},
          ]}
          disabled={!cornerKey}
          onPress={() => cornerKey && commit(cornerKey)}>
          {cornerKey && <Text style={{color: theme.keyText, fontSize: keyFontSize}}>{cornerKey}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.key, {backgroundColor: theme.keyBackground, paddingVertical: keyPaddingVertical}]}
          onPress={() => commit('0')}>
          <Text style={{color: theme.keyText, fontSize: keyFontSize}}>0</Text>
        </TouchableOpacity>
        <HoldRepeatKeyView
          mode="repeat"
          longPressDelayMs={HOLD_REPEAT_INITIAL_DELAY_MS}
          repeatIntervalMs={HOLD_REPEAT_INTERVAL_MS}
          onRepeatTick={() => {
            fireKeyFeedback();
            InputConnection.deleteBackward(1);
          }}
          style={[styles.key, {backgroundColor: theme.keyBackground, paddingVertical: keyPaddingVertical}]}>
          <Icon name="backspace" size={keyIconSize} color={theme.keyText} />
        </HoldRepeatKeyView>
      </View>
      <View style={[styles.row, {marginVertical: rowMarginVertical}]}>
        <TouchableOpacity
          style={[
            styles.key,
            styles.accentKey,
            {flex: 3, backgroundColor: theme.accent, paddingVertical: keyPaddingVertical},
          ]}
          onPress={() => {
            fireKeyFeedback();
            InputConnection.sendEnter();
          }}>
          <Icon name={enterIcon} size={keyIconSize} color="#FFFFFF" />
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
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentKey: {
    borderRadius: 24,
  },
});
