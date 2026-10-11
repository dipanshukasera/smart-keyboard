import React from 'react';
import {FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore, ClipboardEntry} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {PanelSheet} from './PanelSheet';

// Gboard's clipboard tool: recent copies you can paste again, individually
// dismiss, or clear entirely. Entries are captured whenever this panel
// opens (see App.tsx) rather than via a live clipboard listener, which
// would need a persistent native broadcast receiver - a reasonable
// trade-off for a keyboard that's only briefly in the foreground anyway.
export function ClipboardPanel() {
  const {theme, clipboardHistory, removeClipboardEntry, clearClipboardHistory, setActivePanel} = useKeyboardStore();

  const paste = (entry: ClipboardEntry) => {
    InputConnection.commitText(entry.text);
    setActivePanel('keyboard');
  };

  return (
    <PanelSheet
      title="Clipboard"
      headerAction={
        clipboardHistory.length > 0 ? (
          <TouchableOpacity onPress={clearClipboardHistory}>
            <Text style={{color: theme.accent, fontSize: 13, fontWeight: '600'}}>Clear all</Text>
          </TouchableOpacity>
        ) : null
      }>
      <View style={styles.body}>

      {clipboardHistory.length === 0 ? (
        <Text style={[styles.empty, {color: theme.keyText + '99'}]}>Nothing copied yet</Text>
      ) : (
        <FlatList
          style={styles.list}
          data={clipboardHistory}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <View style={[styles.row, {backgroundColor: theme.keyBackground}]}>
              <TouchableOpacity style={styles.rowText} onPress={() => paste(item)}>
                <Text style={{color: theme.keyText}} numberOfLines={2}>
                  {item.text}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rowDelete} onPress={() => removeClipboardEntry(item.id)}>
                <Icon name="close" size={16} color={theme.keyText + '99'} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
      </View>
    </PanelSheet>
  );
}

const styles = StyleSheet.create({
  // PanelSheet adds ~70dp of padding and header, keeping the panel close
  // to its old 260dp total.
  body: {
    height: 196,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  rowText: {
    flex: 1,
  },
  rowDelete: {
    paddingLeft: 10,
  },
});
