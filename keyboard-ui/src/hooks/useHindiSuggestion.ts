import {useEffect, useRef, useState} from 'react';
import {apiClient} from '../services/api';
import {useKeyboardStore} from '../store';
import {localHinglish} from '../services/hinglishLocal';

// Wait this long after the last keystroke before asking the backend, so
// typing a word quickly is one request rather than one per letter.
const LOOKUP_DELAY_MS = 80;
// Short on purpose: a suggestion that turns up seconds late is useless, and
// a cold Render instance (30-50s to wake) shouldn't leave requests piling up.
const LOOKUP_TIMEOUT_MS = 4000;
const LATIN_WORD = /^[a-z]{2,30}$/;

export interface HindiSuggestion {
  text: string;
  // False while the result shown belongs to an earlier prefix of the word
  // ("nama" while "namas" is being looked up) - shown dimmed and not
  // tappable, so the strip keeps its layout instead of the chip vanishing
  // and reappearing on every keystroke.
  fresh: boolean;
}

/**
 * Hinglish: the Devanagari form of the English-letter word being typed
 * ("namaste" -> "नमस्ते"), looked up via the backend's transliteration
 * endpoint (see backend services/transliteration.js).
 *
 * `active` is whether the strip should reserve a slot for it right now;
 * `suggestion` is what to show in that slot (null while nothing's known
 * yet). Off in incognito and password fields, since this sends the word
 * being typed to the server.
 */
export function useHindiSuggestion(): {active: boolean; suggestion: HindiSuggestion | null} {
  const {typedWord, activeLocale, hinglishEnabled, isIncognito, isSensitiveField, activePanel} = useKeyboardStore();
  const word = typedWord.toLowerCase();
  const active =
    hinglishEnabled &&
    activeLocale === 'en-GB' &&
    activePanel === 'keyboard' &&
    !isIncognito &&
    !isSensitiveField &&
    LATIN_WORD.test(word);

  // word -> top candidate (null: the service had nothing for it).
  const cacheRef = useRef(new Map<string, string | null>());
  const latestWordRef = useRef(word);
  latestWordRef.current = word;
  const [last, setLast] = useState<{word: string; text: string} | null>(null);

  useEffect(() => {
    if (!active) {
      setLast(null);
      return undefined;
    }
    const cached = cacheRef.current.get(word);
    if (cached !== undefined) {
      setLast(cached ? {word, text: cached} : null);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await apiClient.get<{suggestions: string[]}>('/api/translate/transliterate', {
          params: {text: word, lang: 'hi'},
          timeout: LOOKUP_TIMEOUT_MS,
        });
        const top = response.data.suggestions?.[0] ?? null;
        cacheRef.current.set(word, top);
        // The user may have typed on while this was in flight.
        if (latestWordRef.current === word) {
          setLast(top ? {word, text: top} : null);
        }
      } catch {
        // Offline or the service is down - just no Hindi chip; not cached,
        // so it's tried again next time this word comes up.
      }
    }, LOOKUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active, word]);

  // On-device guess, available at the first keystroke: shown at once, then
  // the server's answer (below) takes over when it arrives.
  const local = active ? localHinglish(word) : null;
  if (!active) {
    return {active, suggestion: null};
  }
  if (last && last.word === word) {
    return {active, suggestion: {text: last.text, fresh: true}};
  }
  if (local) {
    return {active, suggestion: {text: local, fresh: true}};
  }
  if (!last) {
    return {active, suggestion: null};
  }
  // Still typing the same word forward - keep the previous result on show
  // (dimmed) until this one arrives.
  return {active, suggestion: word.startsWith(last.word) ? {text: last.text, fresh: false} : null};
}
