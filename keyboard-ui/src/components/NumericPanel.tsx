import React, {useEffect, useRef, useState} from 'react';
import {DeviceEventEmitter, findNodeHandle, GestureResponderEvent, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useShallow} from 'zustand/react/shallow';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {ENTER_ICON_BY_ACTION} from './KeyboardLayout';
import {HoldRepeatKeyView} from './HoldRepeatKeyView';
import {useKeyFeedback} from '../hooks/useKeyFeedback';
import {useKeyPreview} from '../hooks/useKeyPreview';

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
// Copied text the number pad offers to paste: digits and the few symbols a
// phone number, amount or code has. Anything with letters would just be
// refused by the field.
const NUMBER_LIKE = /^[\d\s+\-().,]{1,40}$/;

// The letters printed on a phone-style number pad.
const LETTERS: Record<string, string> = {
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
};
// Holding these types the second character instead (0 -> +, * -> #).
const HOLD_CHARACTER: Record<string, string> = {'0': '+', '*': '#'};
const HOLD_TYPE_DELAY_MS = 420;
const PILL = 40;

export function NumericPanel() {
  const {theme, keyboardSizeScale, keyFontFamily} = useKeyboardStore(
    useShallow(state => ({
      theme: state.theme,
      keyboardSizeScale: state.keyboardSizeScale,
      keyFontFamily: state.keyFontFamily,
    })),
  );
  const keyPaddingVertical = 12 * keyboardSizeScale;
  const rowMarginVertical = 3 * keyboardSizeScale;
  const [enterIcon, setEnterIcon] = useState('keyboard-return');
  // The latest copy, when it's number-like: a chip in the tray above the keys
  // (gone once pasted or the keyboard closes - see the store).
  const clipSuggestion = useKeyboardStore(state => state.clipSuggestion);
  const numberClip = clipSuggestion && NUMBER_LIKE.test(clipSuggestion.text) ? clipSuggestion : null;
  const pasteClip = () => {
    if (!numberClip) return;
    fireKeyFeedback();
    InputConnection.commitText(numberClip.text);
    useKeyboardStore.getState().finishClipSuggestion();
  };

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

  // Sound/vibration on every key, same as the letter keyboard.
  const fireKeyFeedback = useKeyFeedback();
  // Press highlight + preview bubble, and the key boxes for hit-testing.
  const {pressKey, releaseKey, onBodyLayout, trackRowLayout, trackKeyLayout, keyAt, renderPreview} = useKeyPreview();
  const pressOverlayColor = theme.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';

  // The quieter right-hand column: light accent for - and space, a soft
  // violet for delete, the accent itself for the action key.
  const tint = theme.accent + '2E';
  const deleteTint = theme.isDark ? '#4A4458' : '#E8DEF8';

  // --- One touch handler for the whole pad ---------------------------
  // Like the letter keyboard: each finger types its key the instant it
  // lands, found by hit-testing the measured key boxes. With a touchable
  // per key, a second finger landing before the first lifted (fast PIN
  // or OTP entry) could be swallowed by the first key's gesture and lost.
  // Delete keeps its own native hold-to-repeat view.
  const activeTouchesRef = useRef(new Set<string>());
  const holdTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const containerRef = useRef<View>(null);
  const typeKey = (keyId: string) => {
    switch (keyId) {
      case 'enter':
        InputConnection.sendEnter();
        return;
      case 'space':
        InputConnection.commitText(' ');
        return;
      case 'dash':
        InputConnection.commitText('-');
        return;
      default:
        InputConnection.commitText(keyId);
    }
  };
  const handleTouchStart = (event: GestureResponderEvent) => {
    const container = findNodeHandle(containerRef.current);
    for (const touch of event.nativeEvent.changedTouches) {
      // Tap keys pass touches through (pointerEvents none), so a touch on
      // one targets this panel and locationX/Y are panel coordinates. A
      // touch on delete targets that view instead (it handles itself).
      if (Number(touch.target) !== container) continue;
      const keyId = keyAt(touch.locationX, touch.locationY);
      if (!keyId || keyId === 'delete') continue;
      const id = String(touch.identifier);
      activeTouchesRef.current.add(id);
      fireKeyFeedback();
      const typesCharacter = keyId !== 'enter' && keyId !== 'space';
      pressKey(keyId, typesCharacter ? (keyId === 'dash' ? '-' : keyId) : null);
      typeKey(keyId);
      const hold = HOLD_CHARACTER[keyId];
      if (hold) {
        holdTimersRef.current.set(
          id,
          setTimeout(() => {
            holdTimersRef.current.delete(id);
            // Swap what the touch-down typed for the held character.
            InputConnection.deleteBackward(1);
            InputConnection.commitText(hold);
            fireKeyFeedback();
          }, HOLD_TYPE_DELAY_MS),
        );
      }
    }
  };
  const handleTouchEnd = (event: GestureResponderEvent) => {
    for (const touch of event.nativeEvent.changedTouches) {
      const id = String(touch.identifier);
      const timer = holdTimersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        holdTimersRef.current.delete(id);
      }
      if (activeTouchesRef.current.delete(id)) releaseKey();
    }
  };
  useEffect(
    () => () => {
      holdTimersRef.current.forEach(timer => clearTimeout(timer));
    },
    [],
  );

  const digitContent = (digit: string) => (
    <View style={styles.digitContent}>
      <Text style={{color: theme.keyText, fontSize: 28 * keyboardSizeScale, fontFamily: keyFontFamily ?? undefined}}>{digit}</Text>
      {LETTERS[digit] && (
        <Text style={{color: theme.keyText + 'CC', fontSize: 12 * keyboardSizeScale, fontFamily: keyFontFamily ?? undefined}}>
          {LETTERS[digit]}
        </Text>
      )}
    </View>
  );
  const symbolContent = (main: string, hold?: string) => (
    <View style={styles.digitContent}>
      <Text style={{color: theme.keyText, fontSize: (hold ? 24 : 28) * keyboardSizeScale, fontFamily: keyFontFamily ?? undefined}}>{main}</Text>
      {hold && <Text style={{color: theme.keyText, fontSize: 18 * keyboardSizeScale}}>{hold}</Text>}
    </View>
  );

  // A key's id is what it types (digits, * . ), or dash / space / enter.
  const tapKey = (id: string, row: string, content: React.ReactNode, background: string) => (
    <View
      key={id}
      pointerEvents="none"
      onLayout={trackKeyLayout(id, row, PILL)}
      style={[styles.key, {backgroundColor: background, paddingVertical: keyPaddingVertical}]}>
      {content}
    </View>
  );
  const iconFor = (name: string) => (name === 'arrow-forward' ? 'keyboard-tab' : name);

  const digitRows = [
    {digits: ['1', '2', '3'], side: tapKey('dash', '0', <Text style={{color: theme.keyText, fontSize: 28 * keyboardSizeScale}}>–</Text>, tint)},
    {
      digits: ['4', '5', '6'],
      side: tapKey('space', '1', <Icon name="space-bar" size={26 * keyboardSizeScale} color={theme.keyText} />, tint),
    },
    {
      digits: ['7', '8', '9'],
      side: (
        <HoldRepeatKeyView
          key="delete"
          mode="repeat"
          longPressDelayMs={HOLD_REPEAT_INITIAL_DELAY_MS}
          repeatIntervalMs={HOLD_REPEAT_INTERVAL_MS}
          onPressStart={() => pressKey('delete')}
          onRepeatTick={() => {
            fireKeyFeedback();
            InputConnection.deleteBackward(1);
          }}
          onPressEnd={releaseKey}
          onLayout={trackKeyLayout('delete', '2', PILL)}
          style={[styles.key, {backgroundColor: deleteTint, paddingVertical: keyPaddingVertical}]}>
          <Icon name="backspace" size={24 * keyboardSizeScale} color={theme.keyText} />
        </HoldRepeatKeyView>
      ),
    },
  ];

  return (
    <View
      ref={containerRef}
      style={[styles.container, {backgroundColor: theme.panelBackground}]}
      onLayout={onBodyLayout}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}>
      {/* The tray: always this tall, so the pad doesn't jump when the chip
          appears or goes. */}
      <View style={styles.tray}>
        {numberClip && (
          <TouchableOpacity
            style={[styles.clipChip, {backgroundColor: theme.keyBackground}]}
            onPress={pasteClip}
            accessibilityLabel={`Paste ${numberClip.text}`}>
            <Icon name="content-paste" size={16} color={theme.accent} />
            <Text style={{color: theme.keyText, fontSize: 15, fontWeight: '600', flexShrink: 1}} numberOfLines={1}>
              {numberClip.text.replace(/\s+/g, ' ')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {digitRows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          pointerEvents="box-none"
          style={[styles.row, {marginVertical: rowMarginVertical}]}
          onLayout={trackRowLayout(String(rowIndex))}>
          {row.digits.map(digit => tapKey(digit, String(rowIndex), digitContent(digit), theme.keyBackground))}
          {row.side}
        </View>
      ))}
      <View pointerEvents="box-none" style={[styles.row, {marginVertical: rowMarginVertical}]} onLayout={trackRowLayout('3')}>
        {tapKey('*', '3', symbolContent('*', '#'), theme.keyBackground)}
        {tapKey('0', '3', symbolContent('0', '+'), theme.keyBackground)}
        {tapKey('.', '3', symbolContent('.'), theme.keyBackground)}
        {tapKey('enter', '3', <Icon name={iconFor(enterIcon)} size={26 * keyboardSizeScale} color="#FFFFFF" />, theme.accent)}
      </View>
      {renderPreview({
        theme,
        scale: keyboardSizeScale,
        fontFamily: keyFontFamily,
        highlightColor: pressOverlayColor,
        radius: PILL,
        keepInside: true,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
  },
  tray: {
    height: 38,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clipChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 6,
  },
  key: {
    flex: 1,
    marginHorizontal: 3,
    borderRadius: PILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
});
