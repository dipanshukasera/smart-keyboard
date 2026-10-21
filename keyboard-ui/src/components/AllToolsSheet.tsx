import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {ImeSwitcher} from '../native-bridge/ImeSwitcher';
import {PanelSheet} from './PanelSheet';

interface ToolCard {
  id: string;
  label: string;
  iconName: string;
  onPress: () => void;
}

/**
 * The "•••" toolbar icon's destination - a 4-column grid of every tool,
 * not just whichever subset fits in the toolbar row itself (see the
 * "Keyboard Toolbar Explorations" reference's "All tools" screen).
 */
export function AllToolsSheet({onOpenClipboard}: {onOpenClipboard: () => void}) {
  const {theme, setActivePanel, adultGifsEnabled} = useKeyboardStore();

  const tools: ToolCard[] = [
    {id: 'gifs', label: 'GIFs', iconName: 'gif', onPress: () => setActivePanel('gif')},
    {id: 'font', label: 'Font', iconName: 'text-fields', onPress: () => setActivePanel('font')},
    {id: 'stickers', label: 'Stickers', iconName: 'auto-awesome', onPress: () => setActivePanel('stickers')},
    // Only once the user has opted in (Settings > Content) - see
    // adultGifsEnabled in the store.
    ...(adultGifsEnabled
      ? [{id: 'adult', label: '18+', iconName: 'no-adult-content', onPress: () => setActivePanel('adultGifs')}]
      : []),
    {id: 'voice', label: 'Voice typing', iconName: 'mic', onPress: () => setActivePanel('voice')},
    {id: 'clipboard', label: 'Clipboard', iconName: 'content-paste', onPress: onOpenClipboard},
    {id: 'translate', label: 'Translate', iconName: 'translate', onPress: () => setActivePanel('translate')},
    {id: 'themes', label: 'Themes', iconName: 'contrast', onPress: () => setActivePanel('themeCustomizer')},
    // Sounds and Settings both open the same real settings screen (see
    // SettingsPanel) - the reference's "Sounds" is one section within it
    // (Key sound), not a separate feature with its own state.
    {id: 'sounds', label: 'Sounds', iconName: 'music-note', onPress: () => setActivePanel('settings')},
    {id: 'settings', label: 'Settings', iconName: 'settings', onPress: () => setActivePanel('settings')},
    // Android's own keyboard picker - used to be a long-press on space,
    // which kept popping up mid-typing when a space was held a bit long.
    {id: 'switchKeyboard', label: 'Switch keyboard', iconName: 'keyboard', onPress: () => ImeSwitcher.showPicker()},
  ];

  return (
    <PanelSheet title="All tools">
      <View style={styles.grid}>
        {tools.map(tool => (
          <TouchableOpacity
            key={tool.id}
            style={[styles.card, {backgroundColor: theme.keyBackground}]}
            onPress={tool.onPress}>
            <Icon name={tool.iconName} size={26} color={theme.keyText} />
            <Text style={[styles.label, {color: theme.keyText}]} numberOfLines={1}>
              {tool.label}
            </Text>
          </TouchableOpacity>
        ))}
        {/* Invisible fillers so a part-filled last row lines up from the
            left instead of being spread apart by space-between. */}
        {Array.from({length: (4 - (tools.length % 4)) % 4}, (_, index) => (
          <View key={`filler-${index}`} style={styles.filler} />
        ))}
      </View>
    </PanelSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 6,
  },
  filler: {
    width: '23%',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
