const express = require('express');
const {
  searchGifs,
  trendingGifs,
  searchStickers,
  trendingStickers,
  searchAdultGifsHandler,
  trendingAdultGifsHandler,
  convertAdultGifHandler,
} = require('../controllers/gif.controller');

const router = express.Router();

router.get('/search', searchGifs);
router.get('/trending', trendingGifs);
router.get('/stickers/search', searchStickers);
router.get('/stickers/trending', trendingStickers);
// Separate endpoints rather than a flag on /search, so adult results can
// never be interleaved into the ordinary grid by accident. Answer 403
// unless ENABLE_ADULT_GIFS=true; the client only calls them when the user
// has turned the setting on. /adult/trending fills the 18+ tab when it's
// opened - the panel itself always opens on the safe GIFs tab.
router.get('/adult/search', searchAdultGifsHandler);
router.get('/adult/trending', trendingAdultGifsHandler);
// mp4 -> .gif for one tapped 18+ result. The path ends in .gif because the
// keyboard's GifCommitModule infers the MIME type it offers the chat app
// from the URL's extension.
router.get('/adult/convert.gif', convertAdultGifHandler);

module.exports = router;
