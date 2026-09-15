import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useKeyboardStore} from '../store';
import {PanelSheet} from './PanelSheet';

// A plain-View pill rather than RN's built-in <Switch>: that component's
// native Android backing (ReactSwitch) throws a NullPointerException from
// setTrackTintColor on this project's target API/device combination
// (getTrackDrawable() returns null before the switch's compound drawable
// is attached) - reproducibly crashed the whole IME process the moment
// this screen opened. Every other toggle in this app (see ThemeCustomizer's
// "Content" section) already avoids Switch for the same reason.
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

export function SettingsPanel() {
  const {
    theme,
    setActivePanel,
    numberRowEnabled,
    setNumberRowEnabled,
    hapticFeedbackEnabled,
    setHapticFeedbackEnabled,
    keySoundEnabled,
    setKeySoundEnabled,
    swipeTypingTrailEnabled,
    setSwipeTypingTrailEnabled,
  } = useKeyboardStore();

  return (
    <PanelSheet title="Keyboard settings">
      <ToggleRow
        label="Number row"
        value={numberRowEnabled}
        onChange={setNumberRowEnabled}
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
        label="Swipe typing trail"
        value={swipeTypingTrailEnabled}
        onChange={setSwipeTypingTrailEnabled}
        note="Not yet available - there's no swipe-to-type gesture engine in this build yet, so this toggle doesn't change typing behavior."
        textColor={theme.keyText}
        accent={theme.accent}
      />
      <TouchableOpacity
        style={[styles.row, {borderColor: theme.keyText + '22'}]}
        onPress={() => setActivePanel('toolbarOrder')}>
        <Text style={{color: theme.keyText, fontSize: 15}}>Toolbar order</Text>
        <Text style={{color: theme.accent, fontSize: 14, fontWeight: '600'}}>Customize</Text>
      </TouchableOpacity>
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
