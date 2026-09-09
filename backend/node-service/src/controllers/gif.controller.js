const {
  searchGifs: searchAllProviders,
  getTrendingGifs,
  searchStickers: searchAllStickerProviders,
  getTrendingStickers,
  ProviderNotConfiguredError,
} = require('../services/gifProviders');

async function searchGifs(req, res) {
  const {q} = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({error: 'Query parameter "q" is required'});
  }

  try {
    const {results, providers} = await searchAllProviders(q, 100);
    res.json({providers, results});
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
    const {results, providers} = await searchAllStickerProviders(q, 100);
    res.json({providers, results});
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

module.exports = {searchGifs, trendingGifs, searchStickers, trendingStickers};
