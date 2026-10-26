import hiIN from '../data/frequency-hi-IN.json';

// On-device Hinglish: finds Hindi words (from the 12,000-word frequency list)
// that sound like the English letters being typed, with no network, so the
// Devanagari chip appears at the first keystroke. People spell Hindi
// loosely in English ("namaste" / "namste", "kya" / "kyaa"), so both the
// typed letters and each Hindi word are reduced to the same rough skeleton
// (long/short vowels merged, aspirates and the schwa dropped) and compared.
// The server lookup (useHindiSuggestion) still runs and wins when it answers.

const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'k', ग: 'g', घ: 'g', ङ: 'n', च: 'c', छ: 'c', ज: 'j', झ: 'j', ञ: 'n',
  ट: 't', ठ: 't', ड: 'd', ढ: 'd', ण: 'n', त: 't', थ: 't', द: 'd', ध: 'd', न: 'n',
  प: 'p', फ: 'p', ब: 'b', भ: 'b', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v',
  श: 's', ष: 's', स: 's', ह: 'h', ळ: 'l',
  क़: 'k', ख़: 'k', ग़: 'g', ज़: 'j', ड़: 'd', ढ़: 'd', फ़: 'p', य़: 'y',
};
const VOWELS: Record<string, string> = {
  अ: '', आ: '', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u', ए: 'e', ऐ: 'i', ओ: 'o', औ: 'u', ऋ: 'ri',
  'ा': '', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'े': 'e', 'ै': 'i', 'ो': 'o', 'ौ': 'u', 'ृ': 'ri',
  'ं': 'n', 'ँ': 'n', 'ः': '', 'ॅ': 'e', 'ॉ': 'o',
};

function devanagariSkeleton(word: string): string {
  let out = '';
  for (const ch of word.normalize('NFC')) {
    if (ch === '्' || ch === '़') continue;
    if (CONSONANTS[ch] !== undefined) out += CONSONANTS[ch];
    else if (VOWELS[ch] !== undefined) out += VOWELS[ch];
  }
  return out;
}

// The typed letters, brought to the same skeleton.
export function typedSkeleton(typed: string): string {
  let s = typed.toLowerCase();
  s = s.replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 'j').replace(/w/g, 'v').replace(/f/g, 'p');
  s = s.replace(/ph/g, 'p').replace(/(?<=[bcdgjklmnprstvy])h/g, '');
  s = s.replace(/ai/g, 'i').replace(/au/g, 'u').replace(/ee/g, 'i').replace(/oo/g, 'u');
  s = s.replace(/a/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

let index: {word: string; key: string; vowelInitial: boolean}[] | null = null;
const INITIAL_VOWELS = 'अआइईउऊएऐओऔऋ';

function buildIndex() {
  const list = hiIN as string[];
  index = [];
  const seen = new Set<string>();
  for (const word of list) {
    const key = devanagariSkeleton(word).replace(/(.)\1+/g, '$1');
    if (!key) continue;
    // Several spellings of the same sound are fine, but the same word twice isn't.
    if (seen.has(word)) continue;
    seen.add(word);
    index.push({word, key, vowelInitial: INITIAL_VOWELS.includes(word[0])});
  }
}

const cache = new Map<string, string | null>();

/** The most common Hindi word that sounds like `typed` (English letters), or null. */
export function localHinglish(typed: string): string | null {
  if (typed.length < 2) return null;
  const hit = cache.get(typed);
  if (hit !== undefined) return hit;
  if (!index) buildIndex();
  const key = typedSkeleton(typed);
  // A word that starts with a vowel (अगर) is typed with one ("agar"); one that
  // starts with a consonant (घर) never is ("ghar") - the dropped schwa would
  // otherwise make them the same.
  const startsWithVowel = 'aeiou'.includes(typed[0].toLowerCase());
  let result: string | null = null;
  if (key.length >= 1) {
    // Words are in frequency order, so the first exact match wins; failing
    // that, the first word that merely starts with the typed sounds.
    let prefixHit: string | null = null;
    for (const entry of index!) {
      if (entry.vowelInitial !== startsWithVowel) continue;
      if (entry.key === key) {
        result = entry.word;
        break;
      }
      if (prefixHit === null && entry.key.startsWith(key)) prefixHit = entry.word;
    }
    result = result ?? prefixHit;
  }
  if (cache.size > 500) cache.clear();
  cache.set(typed, result);
  return result;
}
