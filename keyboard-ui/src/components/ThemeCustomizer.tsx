import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {BUILT_IN_THEMES} from '../themes/presets';
import {ThemeCreator} from './ThemeCreator';

// Themes only: built-in presets, custom themes, and creating a new one.
// Every other preference (layout, size, one-handed, privacy, content) is
// in SettingsPanel.
export function ThemeCustomizer() {
  const {theme, setTheme, customThemes, deleteCustomTheme, setActivePanel} = useKeyboardStore();
  const [showCreator, setShowCreator] = useState(false);

  if (showCreator) {
    return <ThemeCreator onDone={() => setShowCreator(false)} />;
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      <ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {BUILT_IN_THEMES.map(preset => (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.swatch,
                {
                  backgroundColor: preset.keyBackground,
                  borderColor: preset.id === theme.id ? preset.accent : 'transparent',
                },
              ]}
              onPress={() => setTheme(preset)}>
              <Text style={{color: preset.keyText}}>{preset.name}</Text>
            </TouchableOpacity>
          ))}
          {customThemes.map(custom => (
            <TouchableOpacity
              key={custom.id}
              style={[
                styles.swatch,
                {
                  backgroundColor: custom.keyBackground,
                  borderColor: custom.id === theme.id ? custom.accent : 'transparent',
                },
              ]}
              onPress={() => setTheme(custom)}
              onLongPress={() => deleteCustomTheme(custom.id)}>
              <Text style={{color: custom.keyText}} numberOfLines={1}>
                {custom.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.swatch, styles.createSwatch, {borderColor: theme.keyText + '33'}]}
            onPress={() => setShowCreator(true)}>
            <Icon name="add" size={20} color={theme.keyText + '99'} />
          </TouchableOpacity>
        </ScrollView>
        {customThemes.length > 0 && (
          <Text style={[styles.hint, {color: theme.keyText + '77'}]}>Long-press a custom theme to delete it</Text>
        )}

      </ScrollView>

      <TouchableOpacity style={styles.doneButton} onPress={() => setActivePanel('keyboard')}>
        <Text style={{color: theme.accent}}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
  swatch: {
    width: 90,
    height: 90,
    borderRadius: 8,
    borderWidth: 2,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createSwatch: {
    borderStyle: 'dashed',
  },
  hint: {
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
  },
  doneButton: {
    marginTop: 8,
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
