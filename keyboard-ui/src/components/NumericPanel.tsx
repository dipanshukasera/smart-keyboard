import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useShallow} from 'zustand/react/shallow';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {ENTER_ICON_BY_ACTION} from './KeyboardLayout';
import {keyDecor} from '../themes/keyStyle';
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
  const {theme, numericFieldAllowsDecimal, numericFieldAllowsSign, keyboardSizeScale, keyStyle, keyFontFamily} =
    useKeyboardStore(
      useShallow(state => ({
        theme: state.theme,
        numericFieldAllowsDecimal: state.numericFieldAllowsDecimal,
        numericFieldAllowsSign: state.numericFieldAllowsSign,
        keyboardSizeScale: state.keyboardSizeScale,
        keyStyle: state.keyStyle,
        keyFontFamily: state.keyFontFamily,
      })),
    );
  // Same key shape/outline/3D/bold as the letter keyboard (Themes > Key style).
  const decor = useMemo(() => keyDecor(keyStyle, theme), [keyStyle, theme]);
  const keyPaddingVertical = 14 * keyboardSizeScale;
  const keyFontSize = 22 * keyboardSizeScale;
  const keyIconSize = 22 * keyboardSizeScale;
  const rowMarginVertical = 3 * keyboardSizeScale;
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

  // Whichever of "." / "-" the field actually accepts (never both - a real
  // amount field takes one or the other, not a full expression); left out
  // entirely if neither flag is set (e.g. a 4-digit PIN box).
  const cornerKey = numericFieldAllowsDecimal ? '.' : numericFieldAllowsSign ? '-' : null;

  const digitRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];

  const keyStyleFor = (backgroundColor: string, extra?: object) => [
    styles.key,
    decor.key,
    {backgroundColor, paddingVertical: keyPaddingVertical},
    extra,
  ];

  const label = (text: string) => (
    <Text
      style={{
        color: theme.keyText,
        fontSize: keyFontSize,
        fontWeight: decor.labelWeight,
        fontFamily: keyFontFamily ?? undefined,
      }}>
      {text}
    </Text>
  );

  // Typed on press-in, not release, like the letter keyboard - fast PIN
  // entry shouldn't wait for each finger to lift.
  const digitKey = (text: string, flex = 1) => (
    <TouchableOpacity
      key={text}
      activeOpacity={0.6}
      style={keyStyleFor(theme.keyBackground, {flex})}
      onPressIn={() => commit(text)}>
      {label(text)}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      {digitRows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, {marginVertical: rowMarginVertical}]}>
          {row.map(digit => digitKey(digit))}
        </View>
      ))}
      {/* Delete, 0, enter - with "." / "-" ahead of them when the field
          takes one, so delete always sits just before 0 and enter just
          after it. */}
      <View style={[styles.row, {marginVertical: rowMarginVertical}]}>
        {cornerKey && digitKey(cornerKey, 0.6)}
        <HoldRepeatKeyView
          mode="repeat"
          longPressDelayMs={HOLD_REPEAT_INITIAL_DELAY_MS}
          repeatIntervalMs={HOLD_REPEAT_INTERVAL_MS}
          onRepeatTick={() => {
            fireKeyFeedback();
            InputConnection.deleteBackward(1);
          }}
          style={keyStyleFor(theme.keyBackground)}>
          <Icon name="backspace" size={keyIconSize} color={theme.keyText} />
        </HoldRepeatKeyView>
        {digitKey('0')}
        <TouchableOpacity
          activeOpacity={0.6}
          style={keyStyleFor(theme.accent, {borderRadius: decor.accentRadius})}
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
    marginHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
