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

// The frequency-ranked word list for `locale` (most common first), or null
// if there isn't one - used by the swipe decoder.
export function getWordList(locale: string): string[] | null {
  return FREQUENCY_LISTS[locale] ?? null;
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

// QWERTY positions, to tell a slip onto a neighbouring key (c -> v) from a
// letter that's nowhere near (c -> t). Rows are staggered like the real
// keyboard.
const KEY_POSITIONS: Record<string, [number, number]> = {};
['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].forEach((letters, rowIndex) => {
  const stagger = [0, 0.25, 0.75][rowIndex];
  [...letters].forEach((letter, column) => {
    KEY_POSITIONS[letter] = [column + stagger, rowIndex];
  });
});

function keysAreAdjacent(a: string, b: string): boolean {
  const first = KEY_POSITIONS[a];
  const second = KEY_POSITIONS[b];
  if (!first || !second) return false;
  return Math.hypot(first[0] - second[0], first[1] - second[1]) <= 1.3;
}

// How unlikely each kind of slip is (lower = more likely a real typo): a
// letter skipped is the commonest, then two letters swapped, then a letter
// typed twice or a neighbouring key hit instead; a substitution by a letter
// that isn't even near is unlikely and only wins if nothing else fits.
const COST_MISSING = 0.8;
const COST_TRANSPOSITION = 0.7;
const COST_EXTRA = 0.9;
const COST_NEIGHBOUR_KEY = 0.9;
const COST_FAR_KEY = 1.8;
// People almost never get the first letter wrong, so replacing, dropping or
// adding one counts against a candidate ("wating" is "waiting", not
// "eating"); swapping the first two letters is common and isn't penalised.
const COST_FIRST_LETTER = 0.6;
// How much a word's commonness counts against these costs (per power of
// ten of its rank): enough to settle a close call ("realy" is "really", not
// the rarer "relay") without letting a very common word beat a clearly
// better fit.
const FREQUENCY_WEIGHT = 0.2;

// Every string one edit (deletion, transposition, substitution, or
// insertion) away from `word`, each with the cost of that slip - the
// standard Norvig spell-checker candidate generator. Deliberately stops at
// edit-distance 1 (not 2): the candidate set for distance-2 explodes
// combinatorially, and this runs on the keystroke-latency path (every
// word-ending space), not in the background. A single edit already covers
// the large majority of real typos.
function edits1(word: string, alphabet: string): Map<string, number> {
  const results = new Map<string, number>();
  const add = (candidate: string, cost: number) => {
    if (candidate === word) return;
    const known = results.get(candidate);
    if (known === undefined || cost < known) results.set(candidate, cost);
  };
  for (let i = 0; i <= word.length; i++) {
    const left = word.slice(0, i);
    const right = word.slice(i);
    const firstLetter = i === 0 ? COST_FIRST_LETTER : 0;
    if (right.length > 0) {
      add(left + right.slice(1), COST_EXTRA + firstLetter); // deletion
    }
    if (right.length > 1) {
      add(left + right[1] + right[0] + right.slice(2), COST_TRANSPOSITION); // swapped first letters too ("hte")
    }
    for (const c of alphabet) {
      if (right.length > 0) {
        add(
          left + c + right.slice(1),
          (keysAreAdjacent(right[0], c) ? COST_NEIGHBOUR_KEY : COST_FAR_KEY) + firstLetter,
        );
      }
      add(left + c + right, COST_MISSING + firstLetter); // insertion
    }
  }
  return results;
}

// The frequency list is built from film subtitles, whose tokeniser cut
// contractions at the apostrophe: "didn't" became "didn", "I'll" "ll". They
// look like real words in the list but are never what a typo was meant to
// be, so they're not offered as corrections.
const CONTRACTION_FRAGMENTS = new Set([
  'don', 'didn', 'doesn', 'isn', 'wasn', 'aren', 'weren', 'hasn', 'haven', 'hadn',
  'couldn', 'shouldn', 'wouldn', 'mustn', 'needn', 'mightn', 'ain', 'll', 've', 're',
]);

// Contractions typed without their apostrophe (the apostrophe is a long
// way from the letters on a phone keyboard) - and a lone lower-case "i".
// Most of these count as real words in the list ("dont", "cant", "im"), so
// the spelling check never sees them as mistakes.
const ENGLISH_CONTRACTIONS: Record<string, string> = {
  i: 'I', im: "I'm", ive: "I've",
  dont: "don't", cant: "can't", wont: "won't",
  didnt: "didn't", doesnt: "doesn't", isnt: "isn't", wasnt: "wasn't", werent: "weren't",
  arent: "aren't", havent: "haven't", hasnt: "hasn't", hadnt: "hadn't",
  couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't", mustnt: "mustn't",
  youre: "you're", theyre: "they're", weve: "we've", youve: "you've", theyve: "they've",
  hes: "he's", shes: "she's", thats: "that's", whats: "what's", theres: "there's",
  heres: "here's", wheres: "where's", itll: "it'll", youll: "you'll", theyll: "they'll",
};

// The contraction `word` stands for, if it's one of the above, in the
// case it was typed ("Dont" -> "Don't"); else null.
export function getContraction(locale: string, word: string): string | null {
  if (locale !== 'en-GB') return null;
  const fixed = ENGLISH_CONTRACTIONS[word.toLowerCase()];
  if (!fixed || fixed === word) return null;
  const capitalised = word.charAt(0) !== word.charAt(0).toLowerCase();
  return capitalised ? fixed.charAt(0).toUpperCase() + fixed.slice(1) : fixed;
}

// Whether `word` is only letters: no punctuation, digits or apostrophes. A
// comma or full stop typed straight after a word is part of the word being
// typed, and "hello," is one edit from "hello" - correcting it would
// quietly delete the comma. Only plain words are ever corrected.
export function isPlainWord(word: string): boolean {
  if (!word) return false;
  for (const ch of word) {
    if (ch.toLowerCase() === ch.toUpperCase()) return false;
  }
  return true;
}

// Returns a corrected spelling for `word` if it isn't a recognized word
// but one typo away from one that is - the likeliest slip, then the most
// common word - or null if `word` is already recognized, too short to
// bother with, or no one-edit match exists. Callers decide what "not
// recognized" should also account for (e.g. the user's own learned words)
// before calling this.
export function getSpellingCorrection(locale: string, word: string): string | null {
  const alphabet = ALPHABETS[locale];
  if (!alphabet || word.length < 3) return null;
  const lower = word.toLowerCase();
  const ranks = ranksFor(locale);
  if (ranks.has(lower)) return null;
  const skipFragments = locale === 'en-GB';
  let best: string | null = null;
  let bestScore = Infinity;
  for (const [candidate, cost] of edits1(lower, alphabet)) {
    const rank = ranks.get(candidate);
    if (rank === undefined || (skipFragments && CONTRACTION_FRAGMENTS.has(candidate))) continue;
    const score = cost + FREQUENCY_WEIGHT * Math.log10(rank + 10);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
