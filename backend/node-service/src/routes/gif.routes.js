const express = require('express');
const {searchGifs, trendingGifs, searchStickers, trendingStickers} = require('../controllers/gif.controller');

const router = express.Router();

router.get('/search', searchGifs);
router.get('/trending', trendingGifs);
router.get('/stickers/search', searchStickers);
router.get('/stickers/trending', trendingStickers);

module.exports = router;
