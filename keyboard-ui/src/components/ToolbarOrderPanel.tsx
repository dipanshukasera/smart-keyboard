import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore, ToolId} from '../store';
import {PanelSheet} from './PanelSheet';
import {PillToggle} from './SettingsPanel';

const TOOL_META: Record<ToolId, {label: string; iconName: string}> = {
  gif: {label: 'GIFs', iconName: 'gif'},
  translate: {label: 'Translate', iconName: 'translate'},
  clipboard: {label: 'Clipboard', iconName: 'content-paste'},
  themes: {label: 'Themes', iconName: 'contrast'},
  brightness: {label: 'Brightness', iconName: 'wb-sunny'},
  emoji: {label: 'Emoji', iconName: 'mood'},
  voice: {label: 'Voice typing', iconName: 'mic'},
};

// Reorders the toolbar row via up/down buttons rather than drag handles -
// no drag-and-drop list component is installed, and adding one for a
// single 6-item list isn't worth a new dependency. Real, persisted
// reordering either way; just a different interaction than a drag handle.
export function ToolbarOrderPanel() {
  const {theme, toolbarOrder, setToolbarOrder, hiddenTools, setToolHidden} = useKeyboardStore();

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= toolbarOrder.length) return;
    const next = [...toolbarOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setToolbarOrder(next);
  };

  return (
    <PanelSheet title="Toolbar tools">
      <Text style={{color: theme.keyText + '99', fontSize: 12, marginBottom: 6}}>
        Switch a tool off to take it off the toolbar - it stays in All tools. Use the arrows to reorder.
      </Text>
      {toolbarOrder.map((id, index) => {
        const meta = TOOL_META[id];
        const shown = !hiddenTools.includes(id);
        return (
          <View key={id} style={[styles.row, {borderColor: theme.keyText + '22'}]}>
            <Icon name={meta.iconName} size={20} color={theme.keyText} style={[styles.rowIcon, {opacity: shown ? 1 : 0.4}]} />
            <Text style={{color: theme.keyText, fontSize: 15, flex: 1, opacity: shown ? 1 : 0.4}}>{meta.label}</Text>
            <TouchableOpacity onPress={() => setToolHidden(id, shown)} style={styles.toggle}>
              <PillToggle value={shown} accent={theme.accent} trackOff={theme.keyText + '33'} />
            </TouchableOpacity>
            <TouchableOpacity
              disabled={index === 0}
              onPress={() => move(index, -1)}
              style={[styles.arrowButton, {opacity: index === 0 ? 0.3 : 1}]}>
              <Icon name="keyboard-arrow-up" size={22} color={theme.keyText} />
            </TouchableOpacity>
            <TouchableOpacity
              disabled={index === toolbarOrder.length - 1}
              onPress={() => move(index, 1)}
              style={[styles.arrowButton, {opacity: index === toolbarOrder.length - 1 ? 0.3 : 1}]}>
              <Icon name="keyboard-arrow-down" size={22} color={theme.keyText} />
            </TouchableOpacity>
          </View>
        );
      })}
    </PanelSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    marginRight: 12,
  },
  toggle: {
    marginHorizontal: 8,
    padding: 4,
  },
  arrowButton: {
    paddingHorizontal: 6,
  },
});
