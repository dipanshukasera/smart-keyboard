import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {PanelSheet} from './PanelSheet';

// Android's own built-in generic type faces - every device already has
// these, so switching between them needs no bundled font files and no
// asset linking. (A genuinely custom/downloaded font, e.g. Space Grotesk,
// would need .ttf files placed under android-shell's assets and wasn't
// available to add here - see the "Keyboard Toolbar Explorations" design
// board discussion.)
const FONT_OPTIONS: {label: string; family: string | null}[] = [
  {label: 'Default', family: null},
  {label: 'Sans', family: 'sans-serif'},
  {label: 'Sans Condensed', family: 'sans-serif-condensed'},
  {label: 'Serif', family: 'serif'},
  {label: 'Monospace', family: 'monospace'},
  {label: 'Casual', family: 'casual'},
  {label: 'Cursive', family: 'cursive'},
];

export function FontPanel() {
  const {theme, keyFontFamily, setKeyFontFamily} = useKeyboardStore();

  return (
    <PanelSheet title="Font">
      {FONT_OPTIONS.map(option => {
        const selected = option.family === keyFontFamily;
        return (
          <TouchableOpacity
            key={option.label}
            style={[styles.row, {borderColor: theme.keyText + '22'}]}
            onPress={() => setKeyFontFamily(option.family)}>
            <Text
              style={{color: theme.keyText, fontSize: 16, fontFamily: option.family ?? undefined}}
              numberOfLines={1}>
              {option.label}
            </Text>
            {selected && <Icon name="check" size={20} color={theme.accent} />}
          </TouchableOpacity>
        );
      })}
    </PanelSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
