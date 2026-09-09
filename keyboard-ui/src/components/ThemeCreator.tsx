import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {CREATOR_PALETTE} from '../themes/presets';
import type {KeyboardTheme} from '../themes/themeTypes';

interface ThemeCreatorProps {
  onDone: () => void;
}

type FieldKey = 'keyBackground' | 'keyText' | 'panelBackground' | 'accent';

const FIELDS: {key: FieldKey; label: string}[] = [
  {key: 'panelBackground', label: 'Tray background'},
  {key: 'keyBackground', label: 'Key background'},
  {key: 'keyText', label: 'Key text'},
  {key: 'accent', label: 'Accent'},
];

// Simple luminance check so a theme built from arbitrary swatch picks
// still gets a reasonable isDark flag (used elsewhere to pick white vs.
// near-black icon/text colors on accent-colored keys).
function isDarkColor(hex: string): boolean {
  const value = hex.replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// Gboard-style DIY theme creator: no hue wheel or hex entry (this is a
// keyboard's own UI - it can't pop up a real text input for a hex code
// without another keyboard on top of itself), just curated swatches per
// field with a live preview, which covers the same "make your own theme"
// need with far less gesture complexity.
export function ThemeCreator({onDone}: ThemeCreatorProps) {
  const {theme, addCustomTheme, customThemes} = useKeyboardStore();
  const [keyBackground, setKeyBackground] = useState('#FFFFFF');
  const [keyText, setKeyText] = useState('#202124');
  const [panelBackground, setPanelBackground] = useState('#EEEEF0');
  const [accent, setAccent] = useState('#1A73E8');

  const values: Record<FieldKey, string> = {keyBackground, keyText, panelBackground, accent};
  const setters: Record<FieldKey, (color: string) => void> = {
    keyBackground: setKeyBackground,
    keyText: setKeyText,
    panelBackground: setPanelBackground,
    accent: setAccent,
  };

  const save = () => {
    const custom: KeyboardTheme = {
      id: `custom-${Date.now()}`,
      name: `Custom ${customThemes.length + 1}`,
      keyBackground,
      keyPressedBackground: accent + '33',
      keyText,
      panelBackground,
      accent,
      isDark: isDarkColor(panelBackground),
    };
    addCustomTheme(custom);
    onDone();
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      <View style={styles.header}>
        <Text style={{color: theme.keyText, fontWeight: '600'}}>Create Theme</Text>
        <TouchableOpacity onPress={onDone}>
          <Icon name="close" size={18} color={theme.keyText + '99'} />
        </TouchableOpacity>
      </View>

      <View style={[styles.preview, {backgroundColor: panelBackground}]}>
        {['A', 'B', 'C'].map(letter => (
          <View key={letter} style={[styles.previewKey, {backgroundColor: keyBackground}]}>
            <Text style={{color: keyText}}>{letter}</Text>
          </View>
        ))}
        <View style={[styles.previewKey, {backgroundColor: accent}]}>
          <Icon name="keyboard-return" size={16} color="#FFFFFF" />
        </View>
      </View>

      <ScrollView>
        {FIELDS.map(field => (
          <View key={field.key} style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, {color: theme.keyText + '99'}]}>{field.label}</Text>
            <View style={styles.swatchRow}>
              {CREATOR_PALETTE.map(color => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.swatch,
                    {backgroundColor: color},
                    values[field.key] === color && {borderColor: theme.accent, borderWidth: 2},
                  ]}
                  onPress={() => setters[field.key](color)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={[styles.saveButton, {backgroundColor: accent}]} onPress={save}>
        <Text style={styles.saveText}>Save Theme</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 320,
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  preview: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  previewKey: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  fieldBlock: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#00000022',
  },
  saveButton: {
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
