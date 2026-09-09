import React, {useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {translateText} from '../services/translation';

const TARGET_LOCALES = [
  {code: 'en', label: 'EN'},
  {code: 'es', label: 'ES'},
  {code: 'hi', label: 'HI'},
];

export function TranslationBar() {
  const {theme, translationBarVisible, setTranslationBarVisible} = useKeyboardStore();
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!translationBarVisible) {
    return null;
  }

  const runTranslation = async (targetLocale: string) => {
    setLoading(true);
    setTranslated(null);
    try {
      const sourceText = await InputConnection.getTextBeforeCursor(200);
      const result = await translateText(sourceText, targetLocale);
      setTranslated(result.text);
    } catch {
      setTranslated(null);
    } finally {
      setLoading(false);
    }
  };

  const applyTranslation = () => {
    if (!translated) return;
    InputConnection.commitText(translated);
    setTranslated(null);
    setTranslationBarVisible(false);
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground, borderColor: theme.accent}]}>
      <View style={styles.localeRow}>
        {TARGET_LOCALES.map(locale => (
          <TouchableOpacity key={locale.code} onPress={() => runTranslation(locale.code)} style={styles.localeButton}>
            <Text style={{color: theme.accent}}>{locale.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => setTranslationBarVisible(false)} style={styles.closeButton}>
          <Text style={{color: theme.keyText}}>✕</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color={theme.accent} />}

      {translated && (
        <TouchableOpacity onPress={applyTranslation} style={styles.resultRow}>
          <Text style={{color: theme.keyText}} numberOfLines={2}>
            {translated}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    padding: 6,
  },
  localeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  localeButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  closeButton: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
  },
  resultRow: {
    marginTop: 4,
    paddingVertical: 4,
  },
});
