import React from 'react';
import {StyleSheet, Text, TouchableOpacity} from 'react-native';
import {useKeyboardStore} from '../store';
import {LANGUAGE_PACKS} from '../layouts/registry';

// Tap opens the language packs; a long press flips straight to the next one.
export function LanguageSwitcher() {
  const {activeLocale, setActiveLocale, setActivePanel, theme} = useKeyboardStore();

  const cycleLocale = () => {
    const currentIndex = LANGUAGE_PACKS.findIndex(l => l.code === activeLocale);
    setActiveLocale(LANGUAGE_PACKS[(currentIndex + 1) % LANGUAGE_PACKS.length].code);
  };

  const current = LANGUAGE_PACKS.find(l => l.code === activeLocale) ?? LANGUAGE_PACKS[0];

  return (
    <TouchableOpacity
      style={[styles.button, {backgroundColor: theme.keyBackground}]}
      onPress={() => setActivePanel('languages')}
      onLongPress={cycleLocale}>
      <Text style={{color: theme.keyText, fontSize: 12, fontWeight: '600'}}>{current.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
