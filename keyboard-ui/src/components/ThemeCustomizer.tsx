import React, {useState} from 'react';
import {ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {BUILT_IN_THEMES} from '../themes/presets';
import {ThemeCreator} from './ThemeCreator';
import {KeyShape, keyDecor} from '../themes/keyStyle';
import {BackgroundImage} from '../native-bridge/BackgroundImage';
import {themeFromImage} from '../themes/imageTheme';

const SHAPES: {value: KeyShape; label: string}[] = [
  {value: 'rounded', label: 'Rounded'},
  {value: 'square', label: 'Square'},
  {value: 'bubble', label: 'Bubble'},
];

// Looks: built-in presets, custom themes, creating a new one, and the key
// style (shape/outline/3D/bold) that applies on top of whichever theme is
// chosen. Every other preference (layout, size, one-handed, privacy,
// content) is in SettingsPanel.
export function ThemeCustomizer() {
  const {theme, setTheme, customThemes, deleteCustomTheme, addCustomTheme, setActivePanel, keyStyle, setKeyStyle} =
    useKeyboardStore();
  const decor = keyDecor(keyStyle, theme);
  const [showCreator, setShowCreator] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  // A photo as the keyboard background, with key/text/accent colours taken
  // from it (themes/imageTheme.ts). Saved as a custom theme, so it can be
  // switched back to or long-pressed away like the others.
  const pickPhoto = async () => {
    setPickError(null);
    setPicking(true);
    try {
      const picked = await BackgroundImage.pick();
      if (picked) addCustomTheme(themeFromImage(picked));
    } catch (e) {
      setPickError(e instanceof Error ? e.message : "Couldn't use that image");
    } finally {
      setPicking(false);
    }
  };

  if (showCreator) {
    return <ThemeCreator onDone={() => setShowCreator(false)} />;
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      {/* Bounded so the screen scrolls instead of growing past the
          keyboard window's height cap and clipping the bottom off. */}
      <ScrollView style={styles.scroll}>
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
              {custom.backgroundImage && (
                <Image source={{uri: custom.backgroundImage}} style={styles.swatchImage} resizeMode="cover" />
              )}
              {custom.backgroundImage ? (
                // A key-shaped chip in the theme's own colours over the photo.
                <View style={[styles.swatchChip, {backgroundColor: custom.keyBackground}]}>
                  <Text style={{color: custom.keyText, fontSize: 12}}>Aa</Text>
                  <View style={[styles.swatchDot, {backgroundColor: custom.accent}]} />
                </View>
              ) : (
                <Text style={{color: custom.keyText}} numberOfLines={1}>
                  {custom.name}
                </Text>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.swatch, styles.createSwatch, {borderColor: theme.keyText + '33'}]}
            onPress={() => setShowCreator(true)}>
            <Icon name="add" size={20} color={theme.keyText + '99'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.swatch, styles.createSwatch, {borderColor: theme.keyText + '33'}]}
            disabled={picking}
            onPress={pickPhoto}>
            {picking ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <>
                <Icon name="add-photo-alternate" size={22} color={theme.keyText + '99'} />
                <Text style={{color: theme.keyText + '99', fontSize: 11, marginTop: 4}}>Photo</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
        {pickError && <Text style={[styles.hint, {color: theme.accent}]}>{pickError}</Text>}
        {customThemes.length > 0 && (
          <Text style={[styles.hint, {color: theme.keyText + '77'}]}>Long-press a custom theme to delete it</Text>
        )}

        <Text style={[styles.sectionLabel, {color: theme.keyText + '99'}]}>KEY STYLE</Text>
        {/* The keyboard itself is hidden behind this screen, so a few keys
            drawn with the current theme + style show the effect live. */}
        <View style={[styles.previewRow, {backgroundColor: theme.panelBackground}]}>
          {['Q', 'W', 'E', 'R', 'T', 'Y'].map(letter => (
            <View
              key={letter}
              style={[styles.previewKey, decor.key, {backgroundColor: theme.keyBackground}]}>
              <Text style={{color: theme.keyText, fontSize: 15, fontWeight: decor.labelWeight}}>{letter}</Text>
            </View>
          ))}
          <View style={[styles.previewKey, decor.key, {borderRadius: decor.accentRadius, backgroundColor: theme.accent}]}>
            <Icon name="keyboard-return" size={18} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.optionRow}>
          {SHAPES.map(shape => {
            const selected = keyStyle.shape === shape.value;
            return (
              <TouchableOpacity
                key={shape.value}
                style={[styles.option, {backgroundColor: selected ? theme.accent : theme.keyBackground}]}
                onPress={() => setKeyStyle({shape: shape.value})}>
                <Text style={{color: selected ? '#FFFFFF' : theme.keyText, fontSize: 12}}>{shape.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.optionRow}>
          {(
            [
              {field: 'outline', label: 'Outline', icon: 'crop-square'},
              {field: 'raised', label: '3D keys', icon: 'layers'},
              {field: 'boldLabels', label: 'Bold letters', icon: 'format-bold'},
            ] as const
          ).map(option => {
            const on = keyStyle[option.field];
            return (
              <TouchableOpacity
                key={option.field}
                style={[styles.option, {backgroundColor: on ? theme.accent : theme.keyBackground}]}
                onPress={() => setKeyStyle({[option.field]: !on})}>
                <Icon name={option.icon} size={14} color={on ? '#FFFFFF' : theme.keyText} />
                <Text style={{color: on ? '#FFFFFF' : theme.keyText, fontSize: 12, marginLeft: 4}}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

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
  scroll: {
    maxHeight: 330,
  },
  swatch: {
    width: 90,
    height: 90,
    borderRadius: 8,
    borderWidth: 2,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  swatchImage: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
  },
  swatchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  swatchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
  createSwatch: {
    borderStyle: 'dashed',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  previewRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
  },
  previewKey: {
    flex: 1,
    height: 40,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 6,
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
