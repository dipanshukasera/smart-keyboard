import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore, OneHandedMode} from '../store';
import {PanelSheet} from './PanelSheet';

// A plain-View pill rather than RN's built-in <Switch>: that component's
// native Android backing (ReactSwitch) throws a NullPointerException from
// setTrackTintColor on this project's target API/device combination
// (getTrackDrawable() returns null before the switch's compound drawable
// is attached) - reproducibly crashed the whole IME process the moment
// this screen opened.
function PillToggle({value, accent, trackOff}: {value: boolean; accent: string; trackOff: string}) {
  return (
    <View style={[styles.pillTrack, {backgroundColor: value ? accent : trackOff}]}>
      <View style={[styles.pillThumb, value ? styles.pillThumbOn : styles.pillThumbOff]} />
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  note,
  textColor,
  accent,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  note?: string;
  textColor: string;
  accent: string;
}) {
  return (
    <TouchableOpacity style={[styles.row, {borderColor: textColor + '22'}]} onPress={() => onChange(!value)}>
      <View style={styles.rowLabel}>
        <Text style={{color: textColor, fontSize: 15}}>{label}</Text>
        {!!note && <Text style={{color: textColor + '77', fontSize: 11, marginTop: 2}}>{note}</Text>}
      </View>
      <PillToggle value={value} accent={accent} trackOff={textColor + '33'} />
    </TouchableOpacity>
  );
}

// Pick-one option row (size, one-handed side).
function OptionPills<T extends string | number>({
  options,
  value,
  onChange,
  textColor,
  keyBackground,
  accent,
}: {
  options: {value: T; label: string; iconName?: string}[];
  value: T;
  onChange: (v: T) => void;
  textColor: string;
  keyBackground: string;
  accent: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={String(option.value)}
            style={[styles.pill, {backgroundColor: selected ? accent : keyBackground}]}
            onPress={() => onChange(option.value)}>
            {!!option.iconName && <Icon name={option.iconName} size={16} color={selected ? '#FFFFFF' : textColor} />}
            <Text style={{color: selected ? '#FFFFFF' : textColor, fontSize: 13, marginLeft: option.iconName ? 4 : 0}}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const SIZE_OPTIONS = [
  {value: 0.85, label: 'Small'},
  {value: 1, label: 'Medium'},
  {value: 1.15, label: 'Large'},
  {value: 1.3, label: 'XL'},
];

const ONE_HANDED_OPTIONS: {value: OneHandedMode; label: string; iconName: string}[] = [
  {value: 'off', label: 'Off', iconName: 'keyboard'},
  {value: 'left', label: 'Left', iconName: 'format-indent-decrease'},
  {value: 'right', label: 'Right', iconName: 'format-indent-increase'},
];

// Every keyboard preference except themes (those stay in ThemeCustomizer,
// reached from the toolbar's theme icon).
export function SettingsPanel() {
  const {
    theme,
    setActivePanel,
    numberRowEnabled,
    setNumberRowEnabled,
    hinglishEnabled,
    setHinglishEnabled,
    hapticFeedbackEnabled,
    setHapticFeedbackEnabled,
    keySoundEnabled,
    setKeySoundEnabled,
    swipeTypingTrailEnabled,
    setSwipeTypingTrailEnabled,
    swipeTypingEnabled,
    setSwipeTypingEnabled,
    autoCorrectEnabled,
    setAutoCorrectEnabled,
    keyboardSizeScale,
    setKeyboardSizeScale,
    oneHandedMode,
    setOneHandedMode,
    learnFromTyping,
    setLearnFromTyping,
    isIncognito,
    setIncognito,
    adultGifsEnabled,
    setAdultGifsEnabled,
  } = useKeyboardStore();

  const sectionLabel = (text: string) => (
    <Text style={[styles.sectionLabel, {color: theme.keyText + '99'}]}>{text}</Text>
  );
  const pillColors = {textColor: theme.keyText, keyBackground: theme.keyBackground, accent: theme.accent};

  return (
    <PanelSheet title="Keyboard settings">
      {/* Bounded so the sheet scrolls rather than growing past the IME
          window's height cap (KeyboardReactView's MAX_HEIGHT_FRACTION),
          which would clip the bottom of it off. */}
      <ScrollView style={styles.scroll}>
        {sectionLabel('TYPING')}
        <ToggleRow
          label="Number row"
          value={numberRowEnabled}
          onChange={setNumberRowEnabled}
          textColor={theme.keyText}
          accent={theme.accent}
        />
        <ToggleRow
          label="Hindi suggestions (Hinglish)"
          value={hinglishEnabled}
          onChange={setHinglishEnabled}
          note="Type Hindi in English letters - e.g. namaste - and get नमस्ते as a suggestion. The word you're typing is sent to our server to convert it; never in password fields or incognito mode."
          textColor={theme.keyText}
          accent={theme.accent}
        />
        <ToggleRow
          label="Haptic feedback"
          value={hapticFeedbackEnabled}
          onChange={setHapticFeedbackEnabled}
          textColor={theme.keyText}
          accent={theme.accent}
        />
        <ToggleRow
          label="Key sound"
          value={keySoundEnabled}
          onChange={setKeySoundEnabled}
          textColor={theme.keyText}
          accent={theme.accent}
        />
        <ToggleRow
          label="Auto-correct"
          value={autoCorrectEnabled}
          onChange={setAutoCorrectEnabled}
          note="Fixes obvious typos when you press space. Press backspace straight after to undo."
          textColor={theme.keyText}
          accent={theme.accent}
        />
        <ToggleRow
          label="Swipe typing"
          value={swipeTypingEnabled}
          onChange={setSwipeTypingEnabled}
          note="Slide your finger across the letters to type a word. English and Spanish."
          textColor={theme.keyText}
          accent={theme.accent}
        />
        <ToggleRow
          label="Show swipe trail"
          value={swipeTypingTrailEnabled}
          onChange={setSwipeTypingTrailEnabled}
          note="Draws a line under your finger while you swipe."
          textColor={theme.keyText}
          accent={theme.accent}
        />
        <TouchableOpacity
          style={[styles.row, {borderColor: theme.keyText + '22'}]}
          onPress={() => setActivePanel('toolbarOrder')}>
          <Text style={{color: theme.keyText, fontSize: 15}}>Toolbar order</Text>
          <Text style={{color: theme.accent, fontSize: 14, fontWeight: '600'}}>Customize</Text>
        </TouchableOpacity>

        {sectionLabel('KEYBOARD SIZE')}
        <OptionPills options={SIZE_OPTIONS} value={keyboardSizeScale} onChange={setKeyboardSizeScale} {...pillColors} />

        {sectionLabel('ONE-HANDED KEYBOARD')}
        <OptionPills options={ONE_HANDED_OPTIONS} value={oneHandedMode} onChange={setOneHandedMode} {...pillColors} />

        {sectionLabel('PRIVACY')}
        <ToggleRow
          label="Learn from my typing"
          value={learnFromTyping}
          onChange={setLearnFromTyping}
          textColor={theme.keyText}
          accent={theme.accent}
        />
        <TouchableOpacity
          style={[styles.row, {borderColor: theme.keyText + '22'}]}
          onPress={() => setActivePanel('learnedWords')}>
          <Text style={{color: theme.keyText, fontSize: 15}}>Manage learned words</Text>
          <Icon name="chevron-right" size={20} color={theme.keyText + '99'} />
        </TouchableOpacity>
        <ToggleRow
          label="Incognito mode"
          value={isIncognito}
          onChange={setIncognito}
          note={
            (isIncognito
              ? "Typed words won't be added to your personal dictionary, and copied text or viewed GIFs won't be saved to history until you turn this off. "
              : '') + 'Password fields are always treated this way automatically.'
          }
          textColor={theme.keyText}
          accent={theme.accent}
        />

        {sectionLabel('CONTENT')}
        <ToggleRow
          label="Adult GIFs (18+)"
          value={adultGifsEnabled}
          onChange={setAdultGifsEnabled}
          note={
            adultGifsEnabled
              ? 'An 18+ tab is shown in the GIF panel. Normal GIF and sticker searches are unaffected - adult results are never mixed into them.'
              : 'Off. Turning this on adds a separate 18+ tab to the GIF panel; it never changes the normal GIF or sticker results.'
          }
          textColor={theme.keyText}
          accent={theme.accent}
        />
      </ScrollView>
    </PanelSheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 330,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 4,
  },
  pillRow: {
    paddingVertical: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginRight: 8,
  },
  hint: {
    fontSize: 11,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    flexShrink: 1,
    paddingRight: 12,
  },
  pillTrack: {
    width: 46,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  pillThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
  },
  pillThumbOn: {
    right: 3,
  },
  pillThumbOff: {
    left: 3,
  },
});
