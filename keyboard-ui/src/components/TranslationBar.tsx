import React, {useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {translateText, getLanguages, LanguageOption} from '../services/translation';

export function TranslationBar() {
  const {
    theme,
    translationBarVisible,
    setTranslationBarVisible,
    translateSourceLocale,
    setTranslateSourceLocale,
    translateTargetLocale,
    setTranslateTargetLocale,
  } = useKeyboardStore();
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceLanguages, setSourceLanguages] = useState<LanguageOption[]>([]);
  const [targetLanguages, setTargetLanguages] = useState<LanguageOption[]>([]);
  const [picker, setPicker] = useState<'source' | 'target' | null>(null);

  // Full, real language lists (not a fixed few) - fetched once per time
  // the bar opens rather than hardcoded, so they stay accurate as DeepL
  // adds languages (see getLanguages).
  useEffect(() => {
    if (!translationBarVisible) return;
    getLanguages('source').then(setSourceLanguages).catch(() => {});
    getLanguages('target').then(setTargetLanguages).catch(() => {});
  }, [translationBarVisible]);

  const runTranslation = async (targetLocale: string, sourceLocale: string | null) => {
    setLoading(true);
    setTranslated(null);
    setError(null);
    try {
      const sourceText = await InputConnection.getTextBeforeCursor(200);
      if (!sourceText.trim()) {
        setError('Type something first');
        return;
      }
      const result = await translateText(sourceText, targetLocale, sourceLocale);
      setTranslated(result.text);
    } catch {
      setError('Translation failed');
    } finally {
      setLoading(false);
    }
  };

  // A returning user already has a remembered target language - translate
  // immediately when the bar opens instead of making them tap it again.
  useEffect(() => {
    if (translationBarVisible && translateTargetLocale) {
      runTranslation(translateTargetLocale, translateSourceLocale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationBarVisible]);

  if (!translationBarVisible) {
    return null;
  }

  const selectTarget = (code: string) => {
    setTranslateTargetLocale(code);
    setPicker(null);
    runTranslation(code, translateSourceLocale);
  };

  const selectSource = (code: string | null) => {
    setTranslateSourceLocale(code);
    setPicker(null);
    if (translateTargetLocale) {
      runTranslation(translateTargetLocale, code);
    }
  };

  const applyTranslation = () => {
    if (!translated) return;
    InputConnection.commitText(translated);
    setTranslated(null);
    setTranslationBarVisible(false);
  };

  const sourceLabel = translateSourceLocale
    ? sourceLanguages.find(l => l.language === translateSourceLocale)?.name ?? translateSourceLocale
    : 'Detect language';
  const targetLabel = translateTargetLocale
    ? targetLanguages.find(l => l.language === translateTargetLocale)?.name ?? translateTargetLocale
    : 'Select language';

  if (picker) {
    const options = picker === 'source' ? sourceLanguages : targetLanguages;
    return (
      <View style={[styles.container, {backgroundColor: theme.panelBackground, borderColor: theme.accent}]}>
        <View style={styles.pickerHeader}>
          <Text style={{color: theme.keyText, fontWeight: '600'}}>
            {picker === 'source' ? 'Translate from' : 'Translate to'}
          </Text>
          <TouchableOpacity onPress={() => setPicker(null)} hitSlop={8}>
            <Text style={{color: theme.keyText}}>✕</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={options}
          keyExtractor={item => item.language}
          style={styles.pickerList}
          ListHeaderComponent={
            picker === 'source' ? (
              <TouchableOpacity style={styles.pickerRow} onPress={() => selectSource(null)}>
                <Text style={{color: theme.accent, fontWeight: '600'}}>Detect language</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({item}) => (
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => (picker === 'source' ? selectSource(item.language) : selectTarget(item.language))}>
              <Text style={{color: theme.keyText}}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground, borderColor: theme.accent}]}>
      <View style={styles.localeRow}>
        <TouchableOpacity style={styles.localePill} onPress={() => setPicker('source')}>
          <Text style={{color: theme.keyText}} numberOfLines={1}>
            {sourceLabel}
          </Text>
        </TouchableOpacity>
        <Text style={{color: theme.keyText, opacity: 0.6}}>→</Text>
        <TouchableOpacity style={styles.localePill} onPress={() => setPicker('target')}>
          <Text style={{color: translateTargetLocale ? theme.keyText : theme.accent, fontWeight: translateTargetLocale ? '400' : '600'}} numberOfLines={1}>
            {targetLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTranslationBarVisible(false)} style={styles.closeButton} hitSlop={8}>
          <Text style={{color: theme.keyText}}>✕</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color={theme.accent} />}
      {error && (
        <Text style={{color: theme.keyText, opacity: 0.7, paddingVertical: 4}} numberOfLines={1}>
          {error}
        </Text>
      )}

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
  localePill: {
    flexShrink: 1,
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
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  pickerList: {
    maxHeight: 200,
  },
  pickerRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
