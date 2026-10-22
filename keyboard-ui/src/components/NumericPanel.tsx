import React, {useEffect, useMemo, useRef, useState} from 'react';
import {DeviceEventEmitter, findNodeHandle, GestureResponderEvent, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useShallow} from 'zustand/react/shallow';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {ENTER_ICON_BY_ACTION} from './KeyboardLayout';
import {keyDecor} from '../themes/keyStyle';
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
  // Compact keys (they used to be ~57dp tall and nearly the full width).
  const keyPaddingVertical = 9 * keyboardSizeScale;
  const keyFontSize = 20 * keyboardSizeScale;
  const keyIconSize = 20 * keyboardSizeScale;
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

  // Whichever of "." / "-" the field actually accepts (never both - a real
  // amount field takes one or the other, not a full expression); left out
  // entirely if neither flag is set (e.g. a 4-digit PIN box).
  const cornerKey = numericFieldAllowsDecimal ? '.' : numericFieldAllowsSign ? '-' : null;

  const digitRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];

  // --- One touch handler for the whole pad ---------------------------
  // Like the letter keyboard: each finger types its key the instant it
  // lands, found by hit-testing the measured key boxes. With a touchable
  // per key, a second finger landing before the first lifted (fast PIN
  // or OTP entry) could be swallowed by the first key's gesture and lost.
  // Delete keeps its own native hold-to-repeat view.
  const activeTouchesRef = useRef(new Set<string>());
  const containerRef = useRef<View>(null);
  const handleTouchStart = (event: GestureResponderEvent) => {
    const container = findNodeHandle(containerRef.current);
    for (const touch of event.nativeEvent.changedTouches) {
      // Tap keys pass touches through (pointerEvents none), so a touch on
      // one targets this panel and locationX/Y are panel coordinates. A
      // touch on delete targets that view instead (it handles itself).
      if (Number(touch.target) !== container) continue;
      const keyId = keyAt(touch.locationX, touch.locationY);
      if (!keyId || keyId === 'delete') continue;
      activeTouchesRef.current.add(String(touch.identifier));
      fireKeyFeedback();
      if (keyId === 'enter') {
        pressKey('enter');
        InputConnection.sendEnter();
      } else {
        pressKey(keyId, keyId);
        InputConnection.commitText(keyId);
      }
    }
  };
  const handleTouchEnd = (event: GestureResponderEvent) => {
    for (const touch of event.nativeEvent.changedTouches) {
      if (activeTouchesRef.current.delete(String(touch.identifier))) releaseKey();
    }
  };

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

  // A key's id is what it types (digits, "." / "-"), or "enter".
  const tapKey = (id: string, row: string, content: React.ReactNode, options: {flex?: number; accent?: boolean} = {}) => (
    <View
      key={id}
      pointerEvents="none"
      onLayout={trackKeyLayout(id, row, options.accent ? decor.accentRadius : undefined)}
      style={[
        styles.key,
        decor.key,
        {
          flex: options.flex ?? 1,
          backgroundColor: options.accent ? theme.accent : theme.keyBackground,
          paddingVertical: keyPaddingVertical,
        },
        options.accent && {borderRadius: decor.accentRadius},
      ]}>
      {content}
    </View>
  );

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
          {row.map(digit => tapKey(digit, String(rowIndex), label(digit)))}
        </View>
      ))}
      {/* Delete, 0, enter - with "." / "-" ahead of them when the field
          takes one, so delete always sits just before 0 and enter just
          after it. */}
      <View pointerEvents="box-none" style={[styles.row, {marginVertical: rowMarginVertical}]} onLayout={trackRowLayout('3')}>
        {cornerKey && tapKey(cornerKey, '3', label(cornerKey), {flex: 0.6})}
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
          onLayout={trackKeyLayout('delete', '3')}
          style={[styles.key, decor.key, {backgroundColor: theme.keyBackground, paddingVertical: keyPaddingVertical}]}>
          <Icon name="backspace" size={keyIconSize} color={theme.keyText} />
        </HoldRepeatKeyView>
        {tapKey('0', '3', label('0'))}
        {tapKey('enter', '3', <Icon name={enterIcon} size={keyIconSize} color="#FFFFFF" />, {accent: true})}
      </View>
      {renderPreview({
        theme,
        scale: keyboardSizeScale,
        fontFamily: keyFontFamily,
        highlightColor: pressOverlayColor,
        radius: decor.radius,
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
    alignItems: 'flex-start',
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
    // Side room, so the keys don't run edge to edge.
    paddingHorizontal: 16,
  },
  key: {
    flex: 1,
    marginHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
