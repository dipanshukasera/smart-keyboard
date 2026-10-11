const axios = require('axios');

// Roman -> Devanagari transliteration for Hinglish typing: the keyboard
// sends the word being typed in English letters ("namaste") and gets back
// Hindi-script candidates ("नमस्ते", ...) to offer as suggestion chips.
//
// Backed by Google Input Tools' public endpoint - the same one its web
// input tools use. It needs no key, but it's unofficial and undocumented,
// so it's called only from here (not the app) and cached: if it ever
// changes or goes away, this file is the only thing to replace.
const INPUT_TOOLS_URL = 'https://inputtools.google.com/request';

// Input-tools code per supported language (Hindi, Latin input).
const INPUT_TOOL_BY_LANG = {
  hi: 'hi-t-i0-und',
};

// Bounded so the same few hundred everyday words, typed over and over by
// every user, are answered without a round trip to Google.
const CACHE_LIMIT = 2000;
const cache = new Map();

class TransliterationInputError extends Error {}

/**
 * Up to `limit` Devanagari candidates for `text`, best first. `text` must
 * be a single short word in Latin letters - this is per-word suggestion,
 * not a free-text conversion service.
 */
async function transliterate(text, {lang = 'hi', limit = 3} = {}) {
  const word = String(text || '').trim().toLowerCase();
  const tool = INPUT_TOOL_BY_LANG[lang];
  if (!tool) {
    throw new TransliterationInputError(`Unsupported language "${lang}"`);
  }
  if (!/^[a-z]{1,30}$/.test(word)) {
    throw new TransliterationInputError('"text" must be a single word of 1-30 Latin letters');
  }

  const key = `${lang}:${word}`;
  if (cache.has(key)) {
    const hit = cache.get(key);
    // Re-insert so Map order tracks recency for eviction below.
    cache.delete(key);
    cache.set(key, hit);
    return hit.slice(0, limit);
  }

  const response = await axios.get(INPUT_TOOLS_URL, {
    params: {text: word, itc: tool, num: 5, cp: 0, cs: 1, ie: 'utf-8', oe: 'utf-8'},
    timeout: 5000,
  });
  // Shape: ["SUCCESS", [[input, [candidate, ...], [], {...}]]]
  const [status, results] = response.data || [];
  if (status !== 'SUCCESS' || !Array.isArray(results?.[0]?.[1])) {
    throw new Error(`Unexpected transliteration response: ${JSON.stringify(response.data).slice(0, 200)}`);
  }
  const candidates = [...new Set(results[0][1].filter(c => typeof c === 'string' && c))];

  cache.set(key, candidates);
  if (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
  return candidates.slice(0, limit);
}

module.exports = {transliterate, TransliterationInputError};
