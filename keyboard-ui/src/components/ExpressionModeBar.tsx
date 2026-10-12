import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore, PanelType} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {HoldRepeatKeyView} from './HoldRepeatKeyView';

// The slim icon row Gboard keeps at the bottom of its emoji/GIF panels for
// switching between "expression" modes without leaving the panel area.
const MODES: {panel: PanelType; iconName: string}[] = [{panel: 'emoji', iconName: 'mood'}];

// Hold-to-repeat delay/interval, matching KeyboardLayout's main-keyboard
// delete key - see HoldRepeatKeyView.java for why this is a native touch
// handler rather than a JS setInterval (a plain TouchableOpacity's own
// touch heuristics can cancel a hold before the timer ever fires).
const HOLD_REPEAT_INITIAL_DELAY_MS = 400;
const HOLD_REPEAT_INTERVAL_MS = 60;

interface ExpressionModeBarProps {
  // 'none' for the Stickers and 18+ panels, which have no button here.
  active: 'emoji' | 'gif' | 'none';
  // Emoji has no local text buffer, so its delete acts on the real focused
  // field; GifStickerPanel's fake search box overrides this to edit its
  // own local query string instead (see the "no keyboard for a keyboard"
  // note in KeyboardLayout.tsx).
  onDelete?: () => void;
}

export function ExpressionModeBar({active, onDelete}: ExpressionModeBarProps) {
  const {theme, setActivePanel} = useKeyboardStore();

  return (
    <View style={[styles.bar, {borderTopColor: theme.keyPressedBackground}]}>
      <TouchableOpacity style={styles.item} onPress={() => setActivePanel('keyboard')}>
        <Text style={{color: theme.keyText, fontSize: 12, fontWeight: '600'}}>ABC</Text>
      </TouchableOpacity>
      {MODES.map(mode => (
        <TouchableOpacity
          key={mode.panel}
          style={[styles.item, active === mode.panel && {backgroundColor: theme.accent + '33'}]}
          onPress={() => setActivePanel(mode.panel)}>
          <Icon name={mode.iconName} size={18} color={active === mode.panel ? theme.accent : theme.keyText} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={[styles.item, active === 'gif' && {backgroundColor: theme.accent + '33'}]}
        onPress={() => setActivePanel('gif')}>
        <Text style={{color: active === 'gif' ? theme.accent : theme.keyText, fontSize: 11, fontWeight: '600'}}>
          GIF
        </Text>
      </TouchableOpacity>
      <HoldRepeatKeyView
        mode="repeat"
        longPressDelayMs={HOLD_REPEAT_INITIAL_DELAY_MS}
        repeatIntervalMs={HOLD_REPEAT_INTERVAL_MS}
        onRepeatTick={() => (onDelete ? onDelete() : InputConnection.deleteBackward(1))}
        style={styles.item}>
        <Icon name="backspace" size={18} color={theme.keyText} />
      </HoldRepeatKeyView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 2,
  },
});
