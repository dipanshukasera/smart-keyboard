import React from 'react';
import {StyleSheet, Text, TouchableOpacity} from 'react-native';
import {useKeyboardStore} from '../store';

const AVAILABLE_LOCALES = [
  {code: 'en-GB', label: 'EN'},
  {code: 'hi-IN', label: 'हि'},
  {code: 'es-ES', label: 'ES'},
];

export function LanguageSwitcher() {
  const {activeLocale, setActiveLocale, theme} = useKeyboardStore();

  const cycleLocale = () => {
    const currentIndex = AVAILABLE_LOCALES.findIndex(l => l.code === activeLocale);
    const next = AVAILABLE_LOCALES[(currentIndex + 1) % AVAILABLE_LOCALES.length];
    setActiveLocale(next.code);
  };

  const current = AVAILABLE_LOCALES.find(l => l.code === activeLocale) ?? AVAILABLE_LOCALES[0];

  return (
    <TouchableOpacity
      style={[styles.button, {backgroundColor: theme.keyBackground}]}
      onPress={cycleLocale}
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
