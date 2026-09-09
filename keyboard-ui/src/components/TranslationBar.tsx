import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
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

// How often to check text-before-cursor for changes while the bar is
// open - there's no event we can subscribe to for "the focused app's
// text changed" (typing happens through several different components -
// KeyboardLayout, SymbolsNumberPanel, NumericPanel - and even a paste
// wouldn't fire any of them), so this polls instead. Cheap local IPC
// call, not a network request, so this cadence is not costly.
const POLL_INTERVAL_MS = 600;

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
  // What was last sent for translation (or last seen as empty) - lets
  // the poller below fire only on an actual change instead of
  // re-translating identical text every tick.
  const lastTextRef = useRef('');
  // Guards against out-of-order network responses: with translation now
  // firing repeatedly as text changes, a slower earlier request could
  // otherwise resolve after a newer one and overwrite the display with
  // stale text. Only the most recently *started* request is allowed to
  // apply its result.
  const requestIdRef = useRef(0);

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

  const runTranslation = async (targetLocale: string, sourceLocale: string | null, textOverride?: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const sourceText = textOverride ?? (await InputConnection.getTextBeforeCursor(200));
      lastTextRef.current = sourceText;
      if (!sourceText.trim()) {
        if (requestId !== requestIdRef.current) return;
        setTranslated(null);
        setError('Type something to translate');
        return;
      }
      const result = await translateText(sourceText, targetLocale, sourceLocale);
      if (requestId !== requestIdRef.current) return;
      setTranslated(result.text);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setTranslated(null);
      setError('Translation failed');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  // Real-time translation: as long as the bar is open (not showing a
  // language picker) and a target is chosen, poll for text changes and
  // re-translate automatically - no "translate now" action needed. The
  // immediate call covers opening the bar with an already-remembered
  // target language (translate right away rather than waiting a tick).
  useEffect(() => {
    if (!translationBarVisible || !translateTargetLocale || picker) return;
    let cancelled = false;
    const poll = async () => {
      const text = await InputConnection.getTextBeforeCursor(200);
      if (cancelled || text === lastTextRef.current) return;
      runTranslation(translateTargetLocale, translateSourceLocale, text);
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [translationBarVisible, translateTargetLocale, translateSourceLocale, picker]);

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
        {error && !loading && (
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
  closeButton: {
    marginLeft: 'auto',
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
