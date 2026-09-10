import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {translateText, getLanguages, LanguageOption} from '../services/translation';
import {KeyboardLayout} from './KeyboardLayout';

// How long to wait after the last keystroke before actually translating -
// without this, every single character typed would fire its own network
// request, most of which would be immediately superseded by the next one.
const DEBOUNCE_MS = 350;

export function TranslationPanel() {
  const {
    theme,
    setActivePanel,
    translateSourceLocale,
    setTranslateSourceLocale,
    translateTargetLocale,
    setTranslateTargetLocale,
  } = useKeyboardStore();

  // A keyboard's own window can't summon another system keyboard on top of
  // itself, so there's no real focusable text input here - typed
  // characters are redirected into this local string via KeyboardLayout's
  // onCommitText/onDeleteBackward (see GifStickerPanel for the same
  // pattern), instead of going to a real InputConnection.
  const [sourceText, setSourceText] = useState('');
  const sourceTextRef = useRef('');
  const [cursorVisible, setCursorVisible] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceLanguages, setSourceLanguages] = useState<LanguageOption[]>([]);
  const [targetLanguages, setTargetLanguages] = useState<LanguageOption[]>([]);
  const [languagesError, setLanguagesError] = useState<string | null>(null);
  const [picker, setPicker] = useState<'source' | 'target' | null>(null);
  // What DeepL actually detected the source as, the last time
  // translateSourceLocale was null (auto) - shown in place of a generic
  // "Detect language" placeholder once there's something to show, the
  // same way Google Translate itself does.
  const [detectedSourceCode, setDetectedSourceCode] = useState<string | null>(null);

  // What's actually sitting in the real focused field because *we* put it
  // there - so a new translation can cleanly replace exactly that many
  // characters rather than guessing at, or duplicating, prior output.
  const lastCommittedRef = useRef('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    sourceTextRef.current = sourceText;
  }, [sourceText]);

  useEffect(() => {
    setCursorVisible(true);
    const interval = setInterval(() => setCursorVisible(v => !v), 500);
    return () => clearInterval(interval);
  }, []);

  // Full, real language lists (not a fixed few) - fetched once on mount
  // rather than hardcoded, so they stay accurate as DeepL adds languages.
  useEffect(() => {
    setLanguagesError(null);
    Promise.all([getLanguages('source'), getLanguages('target')])
      .then(([sources, targets]) => {
        setSourceLanguages(sources);
        setTargetLanguages(targets);
      })
      .catch(() => setLanguagesError('Could not load languages - check the backend is configured'));
  }, []);

  // Replaces whatever we previously committed with `text` (or removes it
  // entirely if `text` is empty) - the one place that ever touches the
  // real field, so lastCommittedRef always reflects reality afterward.
  const replaceCommitted = (text: string) => {
    if (lastCommittedRef.current) {
      InputConnection.deleteBackward(lastCommittedRef.current.length);
    }
    if (text) {
      InputConnection.commitText(text);
    }
    lastCommittedRef.current = text;
  };

  const runTranslation = async (text: string, targetLocale: string, sourceLocale: string | null) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await translateText(text, targetLocale, sourceLocale);
      if (requestId !== requestIdRef.current) return;
      replaceCommitted(result.text);
      if (!sourceLocale) {
        setDetectedSourceCode(result.sourceLocale);
      }
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError('Translation failed');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  // Debounced auto-translate as sourceText changes - this is what makes
  // the real field's content live-update while typing, with no separate
  // "translate now" action anywhere.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!sourceText.trim()) {
      replaceCommitted('');
      setError(null);
      setLoading(false);
      return undefined;
    }
    if (!translateTargetLocale) {
      return undefined;
    }
    debounceRef.current = setTimeout(
      () => runTranslation(sourceText, translateTargetLocale, translateSourceLocale),
      DEBOUNCE_MS,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceText, translateTargetLocale, translateSourceLocale]);

  const appendToSource = (text: string) => setSourceText(prev => prev + text);
  const deleteFromSource = (count: number) => setSourceText(prev => prev.slice(0, Math.max(0, prev.length - count)));

  const selectTarget = (code: string) => {
    setTranslateTargetLocale(code);
    setPicker(null);
  };

  const selectSource = (code: string | null) => {
    setTranslateSourceLocale(code);
    setDetectedSourceCode(null);
    setPicker(null);
  };

  const sourceLabel = translateSourceLocale
    ? sourceLanguages.find(l => l.language === translateSourceLocale)?.name ?? translateSourceLocale
    : (detectedSourceCode && sourceLanguages.find(l => l.language === detectedSourceCode)?.name) ?? 'Detect language';
  const targetLabel = translateTargetLocale
    ? targetLanguages.find(l => l.language === translateTargetLocale)?.name ?? translateTargetLocale
    : 'Select language';

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      <View style={styles.pillRow}>
        {/* The generic toolbar (with its own "back to ABC" icon) is
            hidden for this panel - see App.tsx's hideGenericToolbar -
            so this is the only way back to the normal keyboard. */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setActivePanel('keyboard')}
          hitSlop={8}>
          <Icon name="keyboard" size={20} color={theme.keyText} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, {backgroundColor: theme.keyBackground}]}
          onPress={() => setPicker('source')}>
          <Text style={{color: theme.keyText}} numberOfLines={1}>
            {sourceLabel}
          </Text>
        </TouchableOpacity>
        <Icon name="arrow-forward" size={16} color={theme.keyText + '99'} style={styles.pillArrow} />
        <TouchableOpacity
          style={[styles.pill, {backgroundColor: theme.keyBackground}]}
          onPress={() => setPicker('target')}>
          <Text
            style={{color: translateTargetLocale ? theme.keyText : theme.accent, fontWeight: translateTargetLocale ? '400' : '600'}}
            numberOfLines={1}>
            {targetLabel}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.inputBox, {backgroundColor: theme.keyBackground, borderColor: theme.accent}]}>
        <View style={styles.inputBoxContent}>
          {!sourceText && (
            <Text style={{color: theme.keyText + '99'}} numberOfLines={1}>
              Type to translate
            </Text>
          )}
          {!!sourceText && (
            <Text style={{color: theme.keyText}} numberOfLines={1}>
              {sourceText}
            </Text>
          )}
          <View style={[styles.cursor, {backgroundColor: theme.keyText, opacity: cursorVisible ? 1 : 0}]} />
        </View>
        {loading && <ActivityIndicator color={theme.accent} size="small" />}
      </View>

      {error && (
        <Text style={{color: theme.keyText + '99', fontSize: 12, paddingHorizontal: 4}} numberOfLines={1}>
          {error}
        </Text>
      )}

      <KeyboardLayout
        showSuggestions={false}
        onCommitText={appendToSource}
        onDeleteBackward={deleteFromSource}
        onEnter={() => appendToSource('\n')}
      />

      {picker && (
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerCard, {backgroundColor: theme.panelBackground}]}>
            <Text style={[styles.pickerTitle, {color: theme.keyText}]}>
              {picker === 'source' ? 'Translate from' : 'Translate to'}
            </Text>
            {picker === 'source' && (
              <TouchableOpacity style={styles.pickerDetectRow} onPress={() => selectSource(null)}>
                <View style={styles.pickerDetectCheck}>
                  {!translateSourceLocale && <Icon name="check" size={18} color={theme.accent} />}
                </View>
                <Text style={[styles.pickerDetectText, {color: theme.accent}]}>Detect language</Text>
                <Icon name="auto-awesome" size={14} color={theme.accent} />
              </TouchableOpacity>
            )}
            <View style={[styles.pickerDivider, {backgroundColor: theme.keyText + '22'}]} />
            {languagesError ? (
              <Text style={{color: theme.keyText, opacity: 0.7, padding: 12}}>{languagesError}</Text>
            ) : (
              <FlatList
                data={picker === 'source' ? sourceLanguages : targetLanguages}
                keyExtractor={item => item.language}
                style={styles.pickerList}
                ListEmptyComponent={
                  <Text style={{color: theme.keyText, opacity: 0.7, padding: 12}}>Loading languages…</Text>
                }
                renderItem={({item}) => {
                  const active = picker === 'source' ? translateSourceLocale === item.language : translateTargetLocale === item.language;
                  return (
                    <TouchableOpacity
                      style={styles.pickerRow}
                      onPress={() => (picker === 'source' ? selectSource(item.language) : selectTarget(item.language))}>
                      <View style={styles.pickerDetectCheck}>
                        {active && <Icon name="check" size={18} color={theme.accent} />}
                      </View>
                      <Text style={{color: theme.keyText}}>{item.name}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            <TouchableOpacity style={styles.pickerClose} onPress={() => setPicker(null)} hitSlop={8}>
              <Icon name="close" size={20} color={theme.keyText} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    position: 'relative',
  },
  pill: {
    flexShrink: 1,
    maxWidth: '45%',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pillArrow: {
    marginHorizontal: 8,
  },
  backButton: {
    position: 'absolute',
    left: 8,
    padding: 6,
    zIndex: 1,
  },
  inputBox: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputBoxContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  cursor: {
    width: 2,
    height: 16,
    marginLeft: 2,
  },
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  pickerCard: {
    width: '88%',
    maxHeight: '90%',
    borderRadius: 18,
    paddingTop: 14,
    paddingBottom: 6,
    elevation: 8,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    paddingBottom: 8,
  },
  pickerDetectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pickerDetectCheck: {
    width: 22,
    alignItems: 'center',
  },
  pickerDetectText: {
    flex: 1,
    fontWeight: '600',
  },
  pickerDivider: {
    height: 1,
    marginHorizontal: 12,
    marginBottom: 4,
  },
  pickerList: {
    maxHeight: 220,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pickerClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
  },
});
