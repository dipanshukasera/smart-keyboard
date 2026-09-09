import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore, OneHandedMode} from '../store';
import {BUILT_IN_THEMES} from '../themes/presets';
import {LAYOUT_STYLES, LAYOUT_STYLE_LABELS} from '../layouts/layoutStyles';
import {ThemeCreator} from './ThemeCreator';

const ONE_HANDED_OPTIONS: {mode: OneHandedMode; label: string; iconName: string}[] = [
  {mode: 'off', label: 'Off', iconName: 'keyboard'},
  {mode: 'left', label: 'Left', iconName: 'format-indent-decrease'},
  {mode: 'right', label: 'Right', iconName: 'format-indent-increase'},
];

const SIZE_OPTIONS: {scale: number; label: string}[] = [
  {scale: 0.85, label: 'Small'},
  {scale: 1, label: 'Medium'},
  {scale: 1.15, label: 'Large'},
  {scale: 1.3, label: 'XL'},
];

// Doubles as the keyboard's general "settings" surface (not just themes) -
// layout style, one-handed mode, and privacy controls all live here rather
// than crowding the main toolbar with more icons.
export function ThemeCustomizer() {
  const {
    theme,
    setTheme,
    customThemes,
    deleteCustomTheme,
    setActivePanel,
    layoutStyle,
    setLayoutStyle,
    keyboardSizeScale,
    setKeyboardSizeScale,
    oneHandedMode,
    setOneHandedMode,
    isIncognito,
    setIncognito,
    learnFromTyping,
    setLearnFromTyping,
  } = useKeyboardStore();
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

        <Text style={[styles.sectionLabel, {color: theme.keyText + '99'}]}>KEYBOARD LAYOUT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.row}>
            {LAYOUT_STYLES.map(style => (
              <TouchableOpacity
                key={style}
                style={[
                  styles.pill,
                  {backgroundColor: style === layoutStyle ? theme.accent : theme.keyBackground},
                ]}
                onPress={() => setLayoutStyle(style)}>
                <Text style={{color: style === layoutStyle ? '#FFFFFF' : theme.keyText, fontSize: 12}}>
                  {LAYOUT_STYLE_LABELS[style]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <Text style={[styles.hint, {color: theme.keyText + '77'}]}>Applies to English (US)</Text>

        <Text style={[styles.sectionLabel, {color: theme.keyText + '99'}]}>KEYBOARD SIZE</Text>
        <View style={styles.row}>
          {SIZE_OPTIONS.map(option => (
            <TouchableOpacity
              key={option.label}
              style={[
                styles.pill,
                {backgroundColor: option.scale === keyboardSizeScale ? theme.accent : theme.keyBackground},
              ]}
              onPress={() => setKeyboardSizeScale(option.scale)}>
              <Text
                style={{
                  color: option.scale === keyboardSizeScale ? '#FFFFFF' : theme.keyText,
                  fontSize: 12,
                }}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, {color: theme.keyText + '99'}]}>ONE-HANDED KEYBOARD</Text>
        <View style={styles.row}>
          {ONE_HANDED_OPTIONS.map(option => (
            <TouchableOpacity
              key={option.mode}
              style={[
                styles.pill,
                {
                  backgroundColor: option.mode === oneHandedMode ? theme.accent : theme.keyBackground,
                },
              ]}
              onPress={() => setOneHandedMode(option.mode)}>
              <Icon
                name={option.iconName}
                size={16}
                color={option.mode === oneHandedMode ? '#FFFFFF' : theme.keyText}
              />
              <Text
                style={{
                  color: option.mode === oneHandedMode ? '#FFFFFF' : theme.keyText,
                  marginLeft: 4,
                  fontSize: 12,
                }}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, {color: theme.keyText + '99'}]}>PRIVACY</Text>
        <TouchableOpacity
          style={[styles.row, styles.toggleRow, {backgroundColor: theme.keyBackground}]}
          onPress={() => setLearnFromTyping(!learnFromTyping)}>
          <Icon name="school" size={18} color={learnFromTyping ? theme.accent : theme.keyText} />
          <Text style={{color: theme.keyText, marginLeft: 8, flex: 1}}>Learn from my typing</Text>
          <Text style={{color: learnFromTyping ? theme.accent : theme.keyText + '99', fontWeight: '600'}}>
            {learnFromTyping ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, styles.toggleRow, {backgroundColor: theme.keyBackground, marginTop: 6}]}
          onPress={() => setActivePanel('learnedWords')}>
          <Icon name="list" size={18} color={theme.keyText + '99'} />
          <Text style={{color: theme.keyText, marginLeft: 8, flex: 1}}>Manage learned words</Text>
          <Icon name="chevron-right" size={18} color={theme.keyText + '99'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, styles.toggleRow, {backgroundColor: theme.keyBackground, marginTop: 6}]}
          onPress={() => setIncognito(!isIncognito)}>
          <Icon name="visibility-off" size={18} color={isIncognito ? theme.accent : theme.keyText} />
          <Text style={{color: theme.keyText, marginLeft: 8, flex: 1}}>Incognito mode</Text>
          <Text style={{color: isIncognito ? theme.accent : theme.keyText + '99', fontWeight: '600'}}>
            {isIncognito ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
        {isIncognito && (
          <Text style={[styles.hint, {color: theme.keyText + '99'}]}>
            Typed words won't be added to your personal dictionary, and copied text or viewed GIFs won't be
            saved to history until you turn this off.
          </Text>
        )}
        <Text style={[styles.hint, {color: theme.keyText + '99'}]}>
          Password fields are always treated this way automatically, whether or not incognito is on.
        </Text>
      </ScrollView>

      <TouchableOpacity style={styles.doneButton} onPress={() => setActivePanel('keyboard')}>
        <Text style={{color: theme.accent}}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 340,
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
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
  },
  toggleRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
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
