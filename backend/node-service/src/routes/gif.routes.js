const express = require('express');
const {
  searchGifs,
  trendingGifs,
  searchStickers,
  trendingStickers,
  searchAdultGifsHandler,
  convertAdultGifHandler,
} = require('../controllers/gif.controller');

const router = express.Router();

router.get('/search', searchGifs);
router.get('/trending', trendingGifs);
router.get('/stickers/search', searchStickers);
router.get('/stickers/trending', trendingStickers);
// Separate endpoint rather than a flag on /search, so adult results can
// never be interleaved into the ordinary grid by accident. Answers 403
// unless ENABLE_ADULT_GIFS=true; the client only calls it when the user
// has turned the setting on. No trending equivalent on purpose - trending
// is what the panel shows before anyone types, which must stay safe.
router.get('/adult/search', searchAdultGifsHandler);
// mp4 -> .gif for one tapped 18+ result. The path ends in .gif because the
// keyboard's GifCommitModule infers the MIME type it offers the chat app
// from the URL's extension.
router.get('/adult/convert.gif', convertAdultGifHandler);

module.exports = router;
