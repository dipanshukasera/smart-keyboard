import {useEffect, useRef, useState} from 'react';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {translateText, getLanguages, LanguageOption} from '../services/translation';

// How long to wait after the last keystroke before actually translating -
// without this, every single character typed would fire its own network
// request, most of which would be immediately superseded by the next one.
const DEBOUNCE_MS = 350;

/**
 * All the state/logic behind the translate feature, shared between two
 * places that render at different points in App.tsx's tree -
 * TranslationHeader (the language pills + input box, shown above the
 * generic toolbar) and the embedded keyboard rendered by renderPanel()
 * below it. Both need the same live state, so this is called once in
 * App.tsx and passed down, rather than each owning a separate copy.
 */
export function useTranslationPanel() {
  const {
    activePanel,
    translateSourceLocale,
    setTranslateSourceLocale,
    translateTargetLocale,
    setTranslateTargetLocale,
  } = useKeyboardStore();
  const isActive = activePanel === 'translate';

  // A keyboard's own window can't summon another system keyboard on top of
  // itself, so there's no real focusable text input here - typed
  // characters are redirected into this local string via KeyboardLayout's
  // onCommitText/onDeleteBackward (see GifStickerPanel for the same
  // pattern), instead of going to a real InputConnection.
  const [sourceText, setSourceText] = useState('');
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
    if (!isActive) return undefined;
    setCursorVisible(true);
    const interval = setInterval(() => setCursorVisible(v => !v), 500);
    return () => clearInterval(interval);
  }, [isActive]);

  // Full, real language lists (not a fixed few) - fetched once each time
  // the panel becomes active rather than hardcoded, so they stay accurate
  // as DeepL adds languages.
  useEffect(() => {
    if (!isActive || sourceLanguages.length > 0) return;
    setLanguagesError(null);
    Promise.all([getLanguages('source'), getLanguages('target')])
      .then(([sources, targets]) => {
        setSourceLanguages(sources);
        setTargetLanguages(targets);
      })
      .catch(() => setLanguagesError('Could not load languages - check the backend is configured'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Resets the panel's own state whenever it's left, so reopening it
  // starts a fresh translation rather than showing stale typed text.
  // Deliberately does NOT touch the real field: whatever the last
  // translation committed there is now the user's own content (like a
  // GIF or emoji insertion), not something reopening the panel should
  // retract. lastCommittedRef also resets, so the *next* translation
  // (after reopening) inserts fresh text instead of trying to delete
  // characters that logically aren't "ours" to remove anymore.
  useEffect(() => {
    if (isActive) return;
    lastCommittedRef.current = '';
    setSourceText('');
    setError(null);
    setLoading(false);
  }, [isActive]);

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
    if (!isActive) return undefined;
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
  }, [isActive, sourceText, translateTargetLocale, translateSourceLocale]);

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

  return {
    sourceText,
    cursorVisible,
    loading,
    error,
    sourceLanguages,
    targetLanguages,
    languagesError,
    picker,
    setPicker,
    translateSourceLocale,
    translateTargetLocale,
    sourceLabel,
    targetLabel,
    selectSource,
    selectTarget,
    appendToSource,
    deleteFromSource,
  };
}

export type TranslationPanelState = ReturnType<typeof useTranslationPanel>;
