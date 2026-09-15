import React, {ReactNode} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';

/**
 * Shared chrome for the newer full-panel screens (All tools, Font,
 * Settings, Toolbar order, Translate) - a title on the left and a close
 * (X) button on the right that returns to the plain keyboard, matching
 * the "Keyboard Toolbar Explorations" reference screenshots. Older panels
 * (GifStickerPanel, ThemeCustomizer, ClipboardPanel) predate this and have
 * their own already-tuned headers - not retrofitted here to avoid
 * regressing something that already works.
 */
export function PanelSheet({title, children}: {title: string; children: ReactNode}) {
  const {theme, setActivePanel} = useKeyboardStore();
  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      <View style={styles.header}>
        <Text style={[styles.title, {color: theme.keyText}]}>{title}</Text>
        <TouchableOpacity
          style={[styles.closeButton, {backgroundColor: theme.keyBackground}]}
          onPress={() => setActivePanel('keyboard')}>
          <Icon name="close" size={18} color={theme.keyText} />
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
