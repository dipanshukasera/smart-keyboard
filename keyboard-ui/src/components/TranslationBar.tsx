import React, {useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {translateText, getLanguages, LanguageOption} from '../services/translation';

// Fixed regardless of which internal view (locale row vs. language
// picker) or how many/few languages loaded - App.tsx's onLayout ->
// reportContentHeight pipeline resizes the native IME window to match
// whatever height gets reported, so if this varied with content (a
// FlatList naturally shrinks to fit when it has few/zero rows), every
// tap between the two views would visibly resize the keyboard window.
const BAR_HEIGHT = 210;

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
  const [languagesError, setLanguagesError] = useState<string | null>(null);
  const [picker, setPicker] = useState<'source' | 'target' | null>(null);

  // Full, real language lists (not a fixed few) - fetched once per time
  // the bar opens rather than hardcoded, so they stay accurate as DeepL
  // adds languages (see getLanguages). Surfacing a failure here (rather
  // than swallowing it) matters - the picker otherwise just looks empty
  // with no indication why, which reads as broken.
  useEffect(() => {
    if (!translationBarVisible) return;
    setLanguagesError(null);
    Promise.all([getLanguages('source'), getLanguages('target')])
      .then(([sources, targets]) => {
        setSourceLanguages(sources);
        setTargetLanguages(targets);
      })
      .catch(() => setLanguagesError('Could not load languages - check the backend is configured'));
  }, [translationBarVisible]);

  const runTranslation = async (targetLocale: string, sourceLocale: string | null) => {
    setLoading(true);
    setTranslated(null);
    setError(null);
    try {
      const sourceText = await InputConnection.getTextBeforeCursor(200);
      if (!sourceText.trim()) {
        setError('Type something, then tap ↻ to translate it');
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

  // The bar only ever translates a snapshot of text-before-cursor taken
  // at one moment (bar opening, or picking a language) - nothing re-runs
  // it as the user keeps typing, so this is the way to say "translate
  // what I've typed *now*" without having to re-pick a language.
  const retranslate = () => {
    if (translateTargetLocale) {
      runTranslation(translateTargetLocale, translateSourceLocale);
    }
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
          ListEmptyComponent={
            <Text style={{color: theme.keyText, opacity: 0.7, padding: 10}}>
              {languagesError ?? 'Loading languages…'}
            </Text>
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
          <Text
            style={{color: translateTargetLocale ? theme.keyText : theme.accent, fontWeight: translateTargetLocale ? '400' : '600'}}
            numberOfLines={1}>
            {targetLabel}
          </Text>
        </TouchableOpacity>
        {translateTargetLocale && (
          <TouchableOpacity onPress={retranslate} style={styles.refreshButton} hitSlop={8}>
            <Icon name="refresh" size={18} color={theme.keyText} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setTranslationBarVisible(false)} style={styles.closeButton} hitSlop={8}>
          <Text style={{color: theme.keyText}}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bodyArea}>
        {languagesError && (
          <Text style={{color: theme.keyText, opacity: 0.7}} numberOfLines={2}>
            {languagesError}
          </Text>
        )}
        {loading && <ActivityIndicator color={theme.accent} />}
        {error && (
          <Text style={{color: theme.keyText, opacity: 0.7, paddingVertical: 4}} numberOfLines={2}>
            {error}
          </Text>
        )}
        {translated && (
          <TouchableOpacity onPress={applyTranslation} style={styles.resultRow}>
            <Text style={{color: theme.keyText}} numberOfLines={4}>
              {translated}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: BAR_HEIGHT,
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
  refreshButton: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
  },
  closeButton: {
    paddingHorizontal: 8,
  },
  bodyArea: {
    flex: 1,
    paddingTop: 4,
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
    flex: 1,
  },
  pickerRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
