import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {ThemeCreator} from './ThemeCreator';
import {ThemeGallery} from './ThemeGallery';
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
  const {
    theme,
    customThemes,
    setPendingPhoto,
    setActivePanel,
    keyStyle,
    setKeyStyle,
  } = useKeyboardStore();
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
      // Framing happens on its own screen (BackgroundAdjust, shown by App).
      if (picked) setPendingPhoto({theme: themeFromImage(picked), isNew: true});
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
        <ThemeGallery onCreate={() => setShowCreator(true)} onPickPhoto={pickPhoto} picking={picking} pickError={pickError} />
        {/* Move/zoom the photo behind the keys, with a preview, for the photo
            theme that's on now. */}
        {theme.backgroundImage && customThemes.some(custom => custom.id === theme.id) && (
          <TouchableOpacity
            style={[styles.adjustButton, {backgroundColor: theme.keyBackground.slice(0, 7)}]}
            onPress={() => setPendingPhoto({theme, isNew: false})}>
            <Icon name="crop" size={16} color={theme.keyText} />
            <Text style={{color: theme.keyText, fontSize: 12, marginLeft: 6}}>Adjust photo</Text>
          </TouchableOpacity>
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
    maxHeight: 420,
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
  adjustButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginTop: 8,
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
