import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  DeviceEventEmitter,
  findNodeHandle,
  GestureResponderEvent,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useShallow} from 'zustand/react/shallow';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {ENTER_ICON_BY_ACTION, PILL_BACKGROUND, PILL_TEXT} from './KeyboardLayout';
import {keyDecor} from '../themes/keyStyle';
import {HoldRepeatKeyView} from './HoldRepeatKeyView';
import {useKeyFeedback} from '../hooks/useKeyFeedback';
import {useKeyPreview} from '../hooks/useKeyPreview';

// Same hold-to-repeat timing as the other delete keys.
const HOLD_REPEAT_INITIAL_DELAY_MS = 400;
const HOLD_REPEAT_INTERVAL_MS = 60;

// Column widths, as flex weights, so the three digit rows and the bottom row
// line up: [operators] [1 2 3] [side keys].
const OPERATOR_FLEX = 1.6;
const DIGIT_FLEX = 2.65;
const SIDE_FLEX = 1.63;

const OPERATORS = ['+', '-', '*', '/'];

/**
 * The full numeric keypad, reached from the "1234" key on the symbols panel
 * (a real number field gets the plainer NumericPanel instead): a column of
 * + - * / on the left, big digits in the middle, % space and delete on the
 * right, and a bottom row of ABC , !?# 0 = . and the action key.
 *
 * The digits, % and the bottom row are typed the instant a finger lands (one
 * touch handler with hit-testing, as on the letter keyboard). The operator
 * column spans three rows, which that hit-testing can't describe, so those
 * four are ordinary touchables laid over the empty cells on the left.
 */
export function NumberKeypad() {
  const {theme, keyboardSizeScale, keyStyle, keyFontFamily, setActivePanel} = useKeyboardStore(
    useShallow(state => ({
      theme: state.theme,
      keyboardSizeScale: state.keyboardSizeScale,
      keyStyle: state.keyStyle,
      keyFontFamily: state.keyFontFamily,
      setActivePanel: state.setActivePanel,
    })),
  );
  const decor = useMemo(() => keyDecor(keyStyle, theme), [keyStyle, theme]);
  const keyPaddingVertical = 9 * keyboardSizeScale;
  const rowMarginVertical = 3 * keyboardSizeScale;
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

  const fireKeyFeedback = useKeyFeedback();
  const {pressKey, releaseKey, onBodyLayout, trackRowLayout, trackKeyLayout, keyAt, renderPreview} = useKeyPreview();
  const pressOverlayColor = theme.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
  // The quieter, tinted keys (operators, %, space, delete, comma, =, period).
  const tint = theme.accent + '2E';

  // --- Where the operator column goes ---------------------------------------
  // It sits over the empty cells at the left of the three digit rows, sized
  // from where those rows and cells actually laid out.
  const [operatorBox, setOperatorBox] = useState<{left: number; top: number; width: number; height: number} | null>(null);
  const measured = useRef({left: 0, width: 0, top: -1, bottom: -1});
  const placeOperators = () => {
    const m = measured.current;
    if (m.width > 0 && m.top >= 0 && m.bottom > m.top) {
      setOperatorBox({left: m.left, top: m.top, width: m.width, height: m.bottom - m.top});
    }
  };

  // --- Typing -------------------------------------------------------------------
  const typeKey = (id: string) => {
    fireKeyFeedback();
    switch (id) {
      case 'enter':
        InputConnection.sendEnter();
        return;
      case 'abc':
        setActivePanel('keyboard');
        return;
      case 'sym':
        setActivePanel('symbols');
        return;
      case 'space':
        InputConnection.commitText(' ');
        return;
      default:
        InputConnection.commitText(id);
    }
  };

  const activeTouchesRef = useRef(new Set<string>());
  const containerRef = useRef<View>(null);
  const handleTouchStart = (event: GestureResponderEvent) => {
    const container = findNodeHandle(containerRef.current);
    for (const touch of event.nativeEvent.changedTouches) {
      // Keys pass touches through, so one lands on the panel itself and
      // locationX/Y are panel coordinates. Delete and the operator column
      // handle their own touches.
      if (Number(touch.target) !== container) continue;
      const keyId = keyAt(touch.locationX, touch.locationY);
      if (!keyId || keyId === 'delete') continue;
      activeTouchesRef.current.add(String(touch.identifier));
      const typesIt = keyId !== 'abc' && keyId !== 'sym' && keyId !== 'enter';
      pressKey(keyId, typesIt && keyId !== 'space' ? keyId : null);
      typeKey(keyId);
    }
  };
  const handleTouchEnd = (event: GestureResponderEvent) => {
    for (const touch of event.nativeEvent.changedTouches) {
      if (activeTouchesRef.current.delete(String(touch.identifier))) releaseKey();
    }
  };

  // --- Drawing ----------------------------------------------------------------
  const keyBox = (id: string, row: string, flex: number, background: string, content: React.ReactNode, radius?: number) => (
    <View
      key={id}
      pointerEvents="none"
      onLayout={trackKeyLayout(id, row, radius)}
      style={[
        styles.key,
        decor.key,
        {flex, backgroundColor: background, paddingVertical: keyPaddingVertical},
        radius != null && {borderRadius: radius},
      ]}>
      {content}
    </View>
  );
  const text = (value: string, size: number, color = theme.keyText, weight?: '600') => (
    <Text style={{color, fontSize: size * keyboardSizeScale, fontWeight: weight ?? decor.labelWeight, fontFamily: keyFontFamily ?? undefined}}>
      {value}
    </Text>
  );
  const digit = (value: string, row: string) => keyBox(value, row, DIGIT_FLEX, theme.keyBackground, text(value, 28));

  const mainRows: {row: string; digits: string[]; side: React.ReactNode}[] = [
    {row: '0', digits: ['1', '2', '3'], side: keyBox('%', '0', SIDE_FLEX, tint, text('%', 20))},
    {
      row: '1',
      digits: ['4', '5', '6'],
      side: keyBox('space', '1', SIDE_FLEX, tint, <Icon name="space-bar" size={24 * keyboardSizeScale} color={theme.keyText} />),
    },
    {
      row: '2',
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
          onLayout={trackKeyLayout('delete', '2')}
          style={[styles.key, decor.key, {flex: SIDE_FLEX, backgroundColor: tint, paddingVertical: keyPaddingVertical}]}>
          <Icon name="backspace" size={22 * keyboardSizeScale} color={theme.keyText} />
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
      {mainRows.map(({row, digits, side}) => (
        <View
          key={row}
          pointerEvents="box-none"
          style={[styles.row, {marginVertical: rowMarginVertical}]}
          onLayout={(event: LayoutChangeEvent) => {
            trackRowLayout(row)(event);
            const {y, height} = event.nativeEvent.layout;
            if (row === '0') measured.current.top = y;
            if (row === '2') measured.current.bottom = y + height;
            placeOperators();
          }}>
          {/* Empty cell: the operator column is laid over these. */}
          <View
            pointerEvents="none"
            style={[styles.key, {flex: OPERATOR_FLEX}]}
            onLayout={
              row === '0'
                ? (event: LayoutChangeEvent) => {
                    measured.current.left = event.nativeEvent.layout.x;
                    measured.current.width = event.nativeEvent.layout.width;
                    placeOperators();
                  }
                : undefined
            }
          />
          {digits.map(d => digit(d, row))}
          {side}
        </View>
      ))}

      <View pointerEvents="box-none" style={[styles.row, {marginVertical: rowMarginVertical}]} onLayout={trackRowLayout('3')}>
        {keyBox('abc', '3', OPERATOR_FLEX, PILL_BACKGROUND, text('ABC', 15, PILL_TEXT, '600'), decor.pillRadius)}
        {keyBox(',', '3', 1.0, tint, text(',', 20))}
        {keyBox('sym', '3', 1.42, theme.keyBackground, text('!?#', 15, theme.keyText, '600'))}
        {keyBox('0', '3', DIGIT_FLEX, theme.keyBackground, text('0', 28))}
        {keyBox('=', '3', 1.4, tint, text('=', 20))}
        {keyBox('.', '3', 1.0, tint, text('.', 20))}
        {keyBox('enter', '3', SIDE_FLEX, theme.accent, <Icon name={enterIcon} size={22 * keyboardSizeScale} color="#FFFFFF" />, decor.accentRadius)}
      </View>

      {operatorBox && (
        <View style={[styles.operatorColumn, operatorBox]}>
          {OPERATORS.map(symbol => (
            <TouchableOpacity
              key={symbol}
              activeOpacity={0.5}
              style={[styles.operator, decor.key, {backgroundColor: tint}]}
              onPressIn={() => typeKey(symbol)}>
              {text(symbol, 22)}
            </TouchableOpacity>
          ))}
        </View>
      )}

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
  row: {
    flexDirection: 'row',
    paddingHorizontal: 6,
  },
  key: {
    marginHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorColumn: {
    position: 'absolute',
    justifyContent: 'space-between',
  },
  operator: {
    flex: 1,
    marginVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
