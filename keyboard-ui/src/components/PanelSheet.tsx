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
export function PanelSheet({
  title,
  children,
  compact,
}: {
  title: string;
  children: ReactNode;
  // TranslatePanel is the one screen in this family that still has the
  // full embedded keyboard rendered below it (see App.tsx's renderPanel
  // 'translate' case) - the two stack inside the same native height
  // clamp (KeyboardReactView.java's MAX_HEIGHT_FRACTION) a plain keyboard
  // alone fits into. Every other user of PanelSheet fully replaces the
  // keyboard, so it doesn't need this.
  compact?: boolean;
}) {
  const {theme, setActivePanel} = useKeyboardStore();
  return (
    <View style={[styles.container, compact && styles.containerCompact, {backgroundColor: theme.panelBackground}]}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <Text style={[styles.title, compact && styles.titleCompact, {color: theme.keyText}]}>{title}</Text>
        <TouchableOpacity
          style={[
            styles.closeButton,
            compact && styles.closeButtonCompact,
            {backgroundColor: theme.keyBackground},
          ]}
          onPress={() => setActivePanel('keyboard')}>
          <Icon name="close" size={compact ? 15 : 18} color={theme.keyText} />
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
  containerCompact: {
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerCompact: {
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  titleCompact: {
    fontSize: 15,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonCompact: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
