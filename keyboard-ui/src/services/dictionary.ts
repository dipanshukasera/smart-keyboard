/**
 * On-device next-word/autocomplete suggestions and spell correction.
 *
 * Word lists (src/data/frequency-*.json) are real frequency-ranked
 * vocabularies sourced from hermitdave/FrequencyWords (MIT-licensed,
 * OpenSubtitles-derived corpus, via jsdelivr's GitHub-raw CDN mirror),
 * trimmed to ~12k real words per locale and already sorted most-to-least
 * common - array index doubles as a frequency rank. This replaced a
 * ~35-word hardcoded list that could barely autocomplete anything.
 *
 * Runs entirely synchronously against the bundled arrays (no network
 * round trip per keystroke, which would reintroduce the typing-latency
 * problems fixed elsewhere in this app) - the only per-locale setup cost
 * is building a {word -> rank} Map once, cached in RANK_CACHE.
 */

import enGB from '../data/frequency-en-GB.json';
import esES from '../data/frequency-es-ES.json';
import hiIN from '../data/frequency-hi-IN.json';

const FREQUENCY_LISTS: Record<string, string[]> = {
  'en-GB': enGB as string[],
  'es-ES': esES as string[],
  'hi-IN': hiIN as string[],
};

// {word -> rank} per locale, built lazily on first use rather than eagerly
// for every locale up front, and cached rather than rebuilt on every
// keystroke.
const RANK_CACHE = new Map<string, Map<string, number>>();

function ranksFor(locale: string): Map<string, number> {
  let cached = RANK_CACHE.get(locale);
  if (!cached) {
    const list = FREQUENCY_LISTS[locale] ?? FREQUENCY_LISTS['en-GB'];
    cached = new Map(list.map((word, index) => [word, index]));
    RANK_CACHE.set(locale, cached);
  }
  return cached;
}

export function getSuggestions(locale: string, prefix: string, limit: number = 3): string[] {
  if (!prefix) return [];
  const words = FREQUENCY_LISTS[locale] ?? FREQUENCY_LISTS['en-GB'];
  const lowerPrefix = prefix.toLowerCase();
  const matches: string[] = [];
  for (const word of words) {
    if (word.startsWith(lowerPrefix) && word !== lowerPrefix) {
      matches.push(word);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

// Letters edits1() substitutes/inserts when hunting for a real word one
// typo away - Hindi is deliberately excluded (see below).
const ALPHABETS: Record<string, string> = {
  'en-GB': 'abcdefghijklmnopqrstuvwxyz',
  'es-ES': 'abcdefghijklmnopqrstuvwxyzñáéíóúü',
};

// All strings one edit (deletion, transposition, substitution, or
// insertion) away from `word` - the standard Norvig spell-checker
// candidate generator. Deliberately stops at edit-distance 1 (not 2): the
// candidate set for distance-2 explodes combinatorially (roughly
// (distance-1 count) x alphabet-size more strings), and this runs on the
// keystroke-latency path (every word-ending space), not in the background.
// A single edit already covers the large majority of real typos (one
// wrong/missing/extra/swapped letter).
function edits1(word: string, alphabet: string): Set<string> {
  const results = new Set<string>();
  for (let i = 0; i <= word.length; i++) {
    const left = word.slice(0, i);
    const right = word.slice(i);
    if (right.length > 0) {
      results.add(left + right.slice(1)); // deletion
    }
    if (right.length > 1) {
      results.add(left + right[1] + right[0] + right.slice(2)); // transposition
    }
    for (const c of alphabet) {
      if (right.length > 0) {
        results.add(left + c + right.slice(1)); // substitution
      }
      results.add(left + c + right); // insertion
    }
  }
  results.delete(word);
  return results;
}

// Returns a corrected spelling for `word` if it isn't a recognized word
// but exactly one typo away from one that is - picking the most common
// such word when several match - or null if `word` is already
// recognized, too short to bother with, or no one-edit match exists.
// Callers decide what "not recognized" should also account for (e.g. the
// user's own learned words) before calling this.
export function getSpellingCorrection(locale: string, word: string): string | null {
  const alphabet = ALPHABETS[locale];
  if (!alphabet || word.length < 3) return null;
  const lower = word.toLowerCase();
  const ranks = ranksFor(locale);
  if (ranks.has(lower)) return null;
  let best: string | null = null;
  let bestRank = Infinity;
  for (const candidate of edits1(lower, alphabet)) {
    const rank = ranks.get(candidate);
    if (rank !== undefined && rank < bestRank) {
      best = candidate;
      bestRank = rank;
    }
  }
  return best;
}
