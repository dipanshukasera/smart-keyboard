const axios = require('axios');

// DeepL's Free and Pro tiers are separate hosts - free-tier keys always
// end in ":fx", which is the documented way to tell them apart without a
// separate config flag. See www.deepl.com/docs-api.
const DEEPL_FREE_URL = 'https://api-free.deepl.com/v2/translate';
const DEEPL_PRO_URL = 'https://api.deepl.com/v2/translate';

// The app sends plain lowercase locale codes (see TranslationBar's
// TARGET_LOCALES) - DeepL's target_lang is uppercase, and English/
// Portuguese require a regional variant rather than the bare code.
const TARGET_LANG_MAP = {
  en: 'EN-US',
  es: 'ES',
  hi: 'HI',
};

async function translate(req, res) {
  const {text, targetLocale} = req.body;
  if (!text || !targetLocale) {
    return res.status(400).json({error: '"text" and "targetLocale" are required'});
  }

  if (!process.env.DEEPL_API_KEY) {
    return res.status(503).json({error: 'Translation is not configured (missing DEEPL_API_KEY)'});
  }

  const targetLang = TARGET_LANG_MAP[targetLocale.toLowerCase()] || targetLocale.toUpperCase();
  const url = process.env.DEEPL_API_KEY.endsWith(':fx') ? DEEPL_FREE_URL : DEEPL_PRO_URL;

  try {
    const response = await axios.post(
      url,
      {text: [text], target_lang: targetLang},
      {headers: {Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`}},
    );

    const translation = response.data.translations[0];
    res.json({
      text: translation.text,
      sourceLocale: translation.detected_source_language,
      targetLocale,
    });
  } catch (error) {
    // Surface DeepL's own message when there is one (e.g. "target_lang
    // not supported") instead of a generic failure - most failures here
    // are a bad/missing key or an unsupported target language, both of
    // which are actionable for whoever's reading logs.
    const detail = error.response?.data?.message;
    res.status(502).json({error: detail ? `Failed to reach translation provider: ${detail}` : 'Failed to reach translation provider'});
  }
}

module.exports = {translate};
