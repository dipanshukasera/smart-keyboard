const {
  searchGifs: searchAllProviders,
  getTrendingGifs,
  searchStickers: searchAllStickerProviders,
  getTrendingStickers,
  searchAdultGifs,
  getTrendingAdultGifs,
  adultGifsEnabled,
  PAGE_SIZE,
  ProviderNotConfiguredError,
  AdultContentDisabledError,
} = require('../services/gifProviders');
const {convertToGif, ConversionRejectedError} = require('../services/gifConverter');

/**
 * Reads the ?page= query param. Anything that isn't a positive integer
 * falls back to page 1 rather than erroring - a bad page is a request for
 * the start of the list, not a failure worth showing the user.
 */
function pageFrom(req) {
  const page = Number.parseInt(req.query.page, 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

async function searchGifs(req, res) {
  const {q} = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({error: 'Query parameter "q" is required'});
  }

  try {
    const page = pageFrom(req);
    const {results, providers} = await searchAllProviders(q, {page});
    // hasMore is inferred from a full page rather than a provider-reported
    // total: not every provider exposes one, and the merged/interleaved
    // result set doesn't map cleanly onto any single provider's count.
    res.json({providers, page, hasMore: results.length >= PAGE_SIZE, results});
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return res.status(503).json({error: error.message});
    }
    res.status(502).json({error: error.message || 'Failed to reach any configured GIF provider'});
  }
}

async function trendingGifs(req, res) {
  try {
    const {results, providers} = await getTrendingGifs(24);
    res.json({providers, results});
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return res.status(503).json({error: error.message});
    }
    res.status(502).json({error: error.message || 'Failed to reach any configured GIF provider'});
  }
}

async function searchStickers(req, res) {
  const {q} = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({error: 'Query parameter "q" is required'});
  }

  try {
    const page = pageFrom(req);
    const {results, providers} = await searchAllStickerProviders(q, {page});
    res.json({providers, page, hasMore: results.length >= PAGE_SIZE, results});
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return res.status(503).json({error: error.message});
    }
    res.status(502).json({error: error.message || 'Failed to reach any configured sticker provider'});
  }
}

async function trendingStickers(req, res) {
  try {
    const {results, providers} = await getTrendingStickers(24);
    res.json({providers, results});
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return res.status(503).json({error: error.message});
    }
    res.status(502).json({error: error.message || 'Failed to reach any configured sticker provider'});
  }
}

// Opt-in only, on both sides: the server must set ENABLE_ADULT_GIFS=true
// AND the user must switch "Adult GIFs" on in the keyboard's settings
// before the client ever calls this. Results are never merged into
// /api/gif/search - see the ADULT_PROVIDERS comment in gifProviders.js.
async function searchAdultGifsHandler(req, res) {
  const {q} = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({error: 'Query parameter "q" is required'});
  }

  try {
    const page = pageFrom(req);
    const {results, providers} = await searchAdultGifs(q, {page});
    res.json({providers, page, hasMore: results.length >= PAGE_SIZE, results});
  } catch (error) {
    // 403 rather than 503: the server is fine, this feature is switched
    // off here. The client shows a distinct message for it.
    if (error instanceof AdultContentDisabledError) {
      return res.status(403).json({error: error.message});
    }
    res.status(502).json({error: error.message || 'Failed to reach the adult GIF provider'});
  }
}

async function trendingAdultGifsHandler(req, res) {
  try {
    const {results, providers} = await getTrendingAdultGifs(24);
    res.json({providers, results});
  } catch (error) {
    if (error instanceof AdultContentDisabledError) {
      return res.status(403).json({error: error.message});
    }
    res.status(502).json({error: error.message || 'Failed to reach the adult GIF provider'});
  }
}

// Converts one 18+ result's mp4 into a .gif, for chat fields that take
// images but not video (see gifConverter.js). Same server opt-in as the
// search itself - it only ever converts Redgifs media.
async function convertAdultGifHandler(req, res) {
  if (!adultGifsEnabled()) {
    return res.status(403).json({error: 'Adult GIFs aren’t enabled on this server.'});
  }
  const {src} = req.query;
  if (!src || typeof src !== 'string') {
    return res.status(400).json({error: 'Query parameter "src" is required'});
  }

  try {
    const gifPath = await convertToGif(src);
    res.set('Cache-Control', 'public, max-age=86400');
    res.type('image/gif');
    res.sendFile(gifPath);
  } catch (error) {
    if (error instanceof ConversionRejectedError) {
      return res.status(400).json({error: error.message});
    }
    console.error(`GIF conversion failed for ${src}: ${error.message}`);
    res.status(502).json({error: 'Couldn’t convert this clip to a GIF'});
  }
}

module.exports = {
  searchGifs,
  trendingGifs,
  searchStickers,
  trendingStickers,
  searchAdultGifsHandler,
  trendingAdultGifsHandler,
  convertAdultGifHandler,
};
