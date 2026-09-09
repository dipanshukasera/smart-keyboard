const axios = require('axios');

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate2';

async function translate(req, res) {
  const {text, targetLocale} = req.body;
  if (!text || !targetLocale) {
    return res.status(400).json({error: '"text" and "targetLocale" are required'});
  }

  if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
    return res.status(503).json({error: 'Translation is not configured (missing GOOGLE_TRANSLATE_API_KEY)'});
  }

  try {
    const response = await axios.post(
      GOOGLE_TRANSLATE_URL,
      null,
      {
        params: {
          key: process.env.GOOGLE_TRANSLATE_API_KEY,
          q: text,
          target: targetLocale,
          format: 'text',
        },
      },
    );

    const translation = response.data.data.translations[0];
    res.json({
      text: translation.translatedText,
      sourceLocale: translation.detectedSourceLanguage,
      targetLocale,
    });
  } catch (error) {
    res.status(502).json({error: 'Failed to reach translation provider'});
  }
}

module.exports = {translate};
