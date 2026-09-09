import {requireNativeComponent, ViewProps} from 'react-native';

/**
 * JS side of the native HoldRepeatKeyView (see
 * android-shell/.../HoldRepeatKeyView.java for why this is native rather
 * than PanResponder/TouchableOpacity - both turned out to be unreliable
 * for hold-to-repeat and long-press timing in this specific embedding).
 * Renders exactly like a plain <View> (it extends FrameLayout and accepts
 * ordinary RN children for the key's icon/text), just with extra native
 * touch events layered on top.
 */
export interface HoldRepeatPressEndEvent {
  nativeEvent: {
    dragMode: boolean;
    longPressFired: boolean;
    repeatStarted: boolean;
    movedOutside: boolean;
  };
}

export interface HoldRepeatDragMoveEvent {
  nativeEvent: {
    dx: number;
    dy: number;
  };
}

export interface HoldRepeatKeyViewProps extends ViewProps {
  // "tap": no special timing, just onPressStart/onPressEnd (movedOutside
  // in the onPressEnd payload tells the caller whether to still treat it
  // as a tap). "repeat": fires onRepeatTick immediately then repeatedly
  // while held. "longPressOnce": fires onLongPress once after the delay.
  mode: 'tap' | 'repeat' | 'longPressOnce';
  longPressDelayMs?: number;
  repeatIntervalMs?: number;
  dragThresholdDp?: number;
  onPressStart?: () => void;
  onPressEnd?: (event: HoldRepeatPressEndEvent) => void;
  onLongPress?: () => void;
  onRepeatTick?: () => void;
  onDragMove?: (event: HoldRepeatDragMoveEvent) => void;
}

export const HoldRepeatKeyView = requireNativeComponent<HoldRepeatKeyViewProps>('HoldRepeatKeyView');
