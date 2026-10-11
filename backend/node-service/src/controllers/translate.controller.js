const axios = require('axios');
const {transliterate, TransliterationInputError} = require('../services/transliteration');

// DeepL's Free and Pro tiers are separate hosts - free-tier keys always
// end in ":fx", which is the documented way to tell them apart without a
// separate config flag. See www.deepl.com/docs-api.
function apiBase() {
  return process.env.DEEPL_API_KEY?.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

function authHeader() {
  return {Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`};
}

// The language codes the client sends here come straight from
// getLanguages() below (which it calls once to populate its own language
// pickers - see TranslationBar), so they already arrive in whatever
// exact format DeepL itself expects - no guessing/mapping needed here.
async function translate(req, res) {
  const {text, targetLocale, sourceLocale} = req.body;
  if (!text || !targetLocale) {
    return res.status(400).json({error: '"text" and "targetLocale" are required'});
  }

  if (!process.env.DEEPL_API_KEY) {
    return res.status(503).json({error: 'Translation is not configured (missing DEEPL_API_KEY)'});
  }

  // Omitting source_lang entirely (rather than sending some "auto" sentinel)
  // is what tells DeepL to auto-detect - only include it when the user
  // picked an explicit source language.
  const body = {text: [text], target_lang: targetLocale};
  if (sourceLocale) {
    body.source_lang = sourceLocale;
  }

  try {
    const response = await axios.post(`${apiBase()}/v2/translate`, body, {headers: authHeader()});
    const translation = response.data.translations[0];
    res.json({
      text: translation.text,
      sourceLocale: translation.detected_source_language,
      targetLocale,
    });
  } catch (error) {
    // Surface DeepL's own message when there is one (e.g. "target_lang
    // not supported") instead of a generic failure - most failures here
    // are a bad/missing key or an unsupported language code, both of
    // which are actionable for whoever's reading logs.
    const detail = error.response?.data?.message;
    res.status(502).json({error: detail ? `Failed to reach translation provider: ${detail}` : 'Failed to reach translation provider'});
  }
}

// Backs the language pickers in TranslationBar - "source" languages are
// what the text being translated can be declared/detected as, "target"
// languages are what it can be translated into. These two lists aren't
// identical: a handful of target languages (English, Portuguese) only
// exist as regional variants (EN-US/EN-GB, PT-BR/PT-PT) on the target
// side, unlike on the source side.
async function getLanguages(req, res) {
  if (!process.env.DEEPL_API_KEY) {
    return res.status(503).json({error: 'Translation is not configured (missing DEEPL_API_KEY)'});
  }
  const type = req.query.type === 'source' ? 'source' : 'target';
  try {
    const response = await axios.get(`${apiBase()}/v2/languages`, {params: {type}, headers: authHeader()});
    res.json(response.data);
  } catch (error) {
    res.status(502).json({error: 'Failed to reach translation provider'});
  }
}

// GET /api/translate/transliterate?text=namaste&lang=hi -> Devanagari
// candidates for one word typed in English letters (Hinglish), shown as
// suggestion chips on the keyboard.
async function transliterateHandler(req, res) {
  const {text, lang = 'hi'} = req.query;
  try {
    const suggestions = await transliterate(text, {lang});
    res.set('Cache-Control', 'public, max-age=86400');
    res.json({text: String(text).toLowerCase(), lang, suggestions});
  } catch (error) {
    if (error instanceof TransliterationInputError) {
      return res.status(400).json({error: error.message});
    }
    console.warn(`Transliteration failed for "${text}": ${error.message}`);
    res.status(502).json({error: 'Transliteration service unavailable'});
  }
}

module.exports = {translate, getLanguages, transliterateHandler};
