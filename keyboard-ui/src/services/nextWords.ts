// Next-word prediction: after a word is finished, which word is likely
// next. Learned from the user's own typing (see the store's wordPairs),
// with a short built-in list of very common English pairs to fall back on
// until the keyboard has learned enough.

// previous word (lower case) -> next word (lower case) -> times seen
export type WordPairs = Record<string, Record<string, number>>;

export const MAX_PAIR_PREVIOUS_WORDS = 600;
export const MAX_NEXT_PER_WORD = 10;

// A word as it's compared and remembered: lower case, without the
// punctuation around it ("Dog," -> "dog"). Letters (any script with
// upper/lower case), digits, apostrophes inside a word, and Devanagari.
function isWordChar(ch: string): boolean {
  if (ch === "'" || ch === '’') return true;
  if (ch >= '0' && ch <= '9') return true;
  if (ch >= 'ऀ' && ch <= 'ॿ') return true;
  return ch.toLowerCase() !== ch.toUpperCase();
}

export function normalizeWord(word: string): string {
  let start = 0;
  let end = word.length;
  while (start < end && !isWordChar(word[start])) start++;
  while (end > start && !isWordChar(word[end - 1])) end--;
  return word.slice(start, end).toLowerCase();
}

export function endsSentence(word: string): boolean {
  return /[.!?]$/.test(word.trim());
}

const COMMON_NEXT: Record<string, string[]> = {
  i: ['am', 'have', 'will'],
  "i'm": ['not', 'going', 'sure'],
  you: ['are', 'can', 'have'],
  it: ['is', 'was', 'will'],
  we: ['are', 'have', 'can'],
  they: ['are', 'have', 'will'],
  he: ['is', 'was', 'has'],
  she: ['is', 'was', 'has'],
  the: ['same', 'best', 'first'],
  a: ['lot', 'few', 'good'],
  to: ['be', 'the', 'do'],
  is: ['not', 'a', 'the'],
  are: ['you', 'we', 'going'],
  was: ['a', 'the', 'not'],
  what: ['is', 'are', 'do'],
  how: ['are', 'is', 'to'],
  where: ['are', 'is', 'do'],
  when: ['you', 'i', 'the'],
  thank: ['you'],
  thanks: ['for', 'a', 'so'],
  good: ['morning', 'night', 'luck'],
  see: ['you', 'the', 'it'],
  have: ['a', 'to', 'been'],
  has: ['been', 'a', 'to'],
  can: ['you', 'i', 'we'],
  will: ['be', 'you', 'not'],
  do: ['you', 'not', 'it'],
  "don't": ['know', 'worry', 'have'],
  happy: ['birthday', 'to', 'new'],
  let: ['me', 'us', 'you'],
  please: ['let', 'send', 'help'],
  hello: ['there', 'how', 'sir'],
  hi: ['there', 'how', 'sir'],
  hey: ['there', 'how', 'what'],
  for: ['the', 'you', 'a'],
  in: ['the', 'a', 'my'],
  of: ['the', 'a', 'course'],
  on: ['the', 'my', 'a'],
  and: ['the', 'i', 'then'],
  but: ['i', 'the', 'it'],
  call: ['me', 'you', 'back'],
  love: ['you', 'it', 'this'],
  miss: ['you', 'it', 'the'],
  not: ['sure', 'a', 'the'],
  very: ['much', 'good', 'well'],
  so: ['much', 'good', 'i'],
};

// Up to `limit` likely next words after `previous` (already normalized):
// the ones the user has typed after it most often first, then common
// pairs to fill the strip. Empty if `previous` is null.
export function predictNextWords(pairs: WordPairs, previous: string | null, limit = 3): string[] {
  if (!previous) return [];
  const learned = pairs[previous]
    ? Object.entries(pairs[previous])
        .sort((a, b) => b[1] - a[1])
        .map(([word]) => word)
    : [];
  const fallback = COMMON_NEXT[previous] ?? [];
  return [...new Set([...learned, ...fallback])].slice(0, limit);
}

// Records that `next` followed `previous` once. Returns a new object (the
// store replaces state rather than mutating it), pruned to stay small.
export function recordPair(pairs: WordPairs, previous: string, next: string): WordPairs {
  const following = {...(pairs[previous] ?? {})};
  following[next] = (following[next] ?? 0) + 1;
  const kept = Object.entries(following)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_NEXT_PER_WORD);
  const updated: WordPairs = {...pairs, [previous]: Object.fromEntries(kept)};
  const previousWords = Object.keys(updated);
  // Over the cap: forget the words that were added longest ago (object
  // keys keep insertion order; re-inserting the one just used moves it to
  // the end).
  if (previousWords.length > MAX_PAIR_PREVIOUS_WORDS) {
    delete updated[previousWords[0]];
  }
  return updated;
}
