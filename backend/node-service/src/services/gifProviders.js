const axios = require('axios');

/**
 * Each provider normalizes to the same {id, previewUrl, fullUrl} shape so
 * gif.controller.js and the RN GifStickerPanel don't need to know which
 * ones are active - every provider with its required API key/env var set
 * gets queried in parallel and the results are merged (see
 * getConfiguredProviderNames / searchGifs below), rather than picking a
 * single "the" active provider. GIF_PROVIDER can still narrow that down to
 * a specific comma-separated subset if you want (e.g. GIF_PROVIDER=klipy
 * to use only Klipy even though other keys are configured); leave it unset
 * or set it to "all" to use everything configured.
 */

async function searchTenor(query, limit) {
  if (!process.env.TENOR_API_KEY) {
    throw new ProviderNotConfiguredError('TENOR_API_KEY');
  }
  const response = await axios.get('https://tenor.googleapis.com/v2/search', {
    params: {
      q: query,
      key: process.env.TENOR_API_KEY,
      limit,
      media_filter: 'tinygif,gif',
    },
  });
  return response.data.results.map(item => ({
    id: item.id,
    previewUrl: item.media_formats.tinygif.url,
    fullUrl: item.media_formats.gif.url,
  }));
}

async function trendingTenor(limit) {
  if (!process.env.TENOR_API_KEY) {
    throw new ProviderNotConfiguredError('TENOR_API_KEY');
  }
  const response = await axios.get('https://tenor.googleapis.com/v2/featured', {
    params: {key: process.env.TENOR_API_KEY, limit, media_filter: 'tinygif,gif'},
  });
  return response.data.results.map(item => ({
    id: item.id,
    previewUrl: item.media_formats.tinygif.url,
    fullUrl: item.media_formats.gif.url,
  }));
}

// A generic RapidAPI-hosted GIF search. RapidAPI mirrors several
// equivalent GIF-search APIs under different hostnames with the same
// request shape; point RAPIDAPI_GIF_HOST at whichever one you've
// subscribed to (defaults to RapidAPI's Giphy mirror).
async function searchRapidApi(query, limit) {
  if (!process.env.RAPIDAPI_KEY) {
    throw new ProviderNotConfiguredError('RAPIDAPI_KEY');
  }
  const host = process.env.RAPIDAPI_GIF_HOST || 'giphy.p.rapidapi.com';
  const response = await axios.get(`https://${host}/query`, {
    headers: {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': host,
    },
  });
  const items = response.data.data || response.data.results || [];
  return items.map(item => ({
    id: item.id,
    previewUrl: item.images ? item.images.fixed_width_small.url : item.media_formats.tinygif.url,
    fullUrl: item.images ? item.images.original.url : item.media_formats.gif.url,
  }));
}

async function trendingRapidApi(limit) {
  if (!process.env.RAPIDAPI_KEY) {
    throw new ProviderNotConfiguredError('RAPIDAPI_KEY');
  }
  const host = process.env.RAPIDAPI_GIF_HOST || 'giphy.p.rapidapi.com';
  const response = await axios.get(`https://${host}/gifs/trending`, {
    params: {limit, rating: 'g'},
    headers: {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': host,
    },
  });
  const items = response.data.data || response.data.results || [];
  return items.map(item => ({
    id: item.id,
    previewUrl: item.images ? item.images.fixed_width_small.url : item.media_formats.tinygif.url,
    fullUrl: item.images ? item.images.original.url : item.media_formats.gif.url,
  }));
}

// Klipy's REST shape mirrors Tenor's (their own onboarding docs say to
// swap tenor.googleapis.com for api.klipy.com), except the app key goes in
// the URL path rather than a query param, and results come back nested
// under data.data[] with per-resolution file variants (hd/md/sm/xs) rather
// than a flat media_formats map. See docs.klipy.com/gifs-api.
//
// Not every size tier is guaranteed populated for every item - stickers in
// particular often only fill in "hd" - so this picks the first tier that
// actually has a url rather than assuming "sm"/"md" exist, falling back to
// webp if a tier has no gif variant.
function firstAvailableUrl(file, tierOrder) {
  for (const tier of tierOrder) {
    const entry = file[tier];
    if (!entry) continue;
    if (entry.gif && entry.gif.url) return entry.gif.url;
    if (entry.webp && entry.webp.url) return entry.webp.url;
  }
  return null;
}

function mapKlipyItem(item) {
  return {
    id: String(item.id),
    previewUrl: firstAvailableUrl(item.file, ['sm', 'xs', 'md', 'hd']),
    fullUrl: firstAvailableUrl(item.file, ['md', 'hd', 'sm', 'xs']),
  };
}

async function searchKlipy(query, limit) {
  if (!process.env.KLIPY_APP_KEY) {
    throw new ProviderNotConfiguredError('KLIPY_APP_KEY');
  }
  const response = await axios.get(
    `https://api.klipy.com/api/v1/${process.env.KLIPY_APP_KEY}/gifs/search`,
    {params: {q: query, per_page: limit}},
  );
  return response.data.data.data.map(mapKlipyItem);
}

async function trendingKlipy(limit) {
  if (!process.env.KLIPY_APP_KEY) {
    throw new ProviderNotConfiguredError('KLIPY_APP_KEY');
  }
  const response = await axios.get(
    `https://api.klipy.com/api/v1/${process.env.KLIPY_APP_KEY}/gifs/trending`,
    {params: {per_page: limit}},
  );
  return response.data.data.data.map(mapKlipyItem);
}

// Klipy also has a genuinely separate Stickers library (not just GIFs
// tagged as stickers) - same auth/response shape, different path. See
// docs.klipy.com/stickers-api.
async function searchKlipyStickers(query, limit) {
  if (!process.env.KLIPY_APP_KEY) {
    throw new ProviderNotConfiguredError('KLIPY_APP_KEY');
  }
  const response = await axios.get(
    `https://api.klipy.com/api/v1/${process.env.KLIPY_APP_KEY}/stickers/search`,
    {params: {q: query, per_page: limit}},
  );
  return response.data.data.data.map(mapKlipyItem);
}

async function trendingKlipyStickers(limit) {
  if (!process.env.KLIPY_APP_KEY) {
    throw new ProviderNotConfiguredError('KLIPY_APP_KEY');
  }
  const response = await axios.get(
    `https://api.klipy.com/api/v1/${process.env.KLIPY_APP_KEY}/stickers/trending`,
    {params: {per_page: limit}},
  );
  return response.data.data.data.map(mapKlipyItem);
}

class ProviderNotConfiguredError extends Error {
  constructor(missingEnvVar) {
    super(`GIF provider is not configured (missing ${missingEnvVar})`);
    this.name = 'ProviderNotConfiguredError';
    this.missingEnvVar = missingEnvVar;
  }
}

const PROVIDERS = {
  tenor: searchTenor,
  rapidapi: searchRapidApi,
  klipy: searchKlipy,
};

const TRENDING_PROVIDERS = {
  tenor: trendingTenor,
  rapidapi: trendingRapidApi,
  klipy: trendingKlipy,
};

// Only Klipy has a genuine Stickers library among the providers wired up
// here - Tenor/RapidAPI's "stickers" are usually just GIFs re-tagged, not a
// separate catalog, so they're left out rather than faked. Structured the
// same way as PROVIDERS/TRENDING_PROVIDERS so it plugs into the exact same
// queryAllProviders/getConfiguredProviderNames pipeline, and any future
// provider with real sticker support is just another entry here.
const STICKER_PROVIDERS = {
  klipy: searchKlipyStickers,
};

const STICKER_TRENDING_PROVIDERS = {
  klipy: trendingKlipyStickers,
};

const REQUIRED_ENV_VAR = {
  tenor: 'TENOR_API_KEY',
  rapidapi: 'RAPIDAPI_KEY',
  klipy: 'KLIPY_APP_KEY',
};

// Which providers actually get queried: GIF_PROVIDER unset (or "all")
// means every provider (among `availableNames`, i.e. whichever fnMap is
// actually in play - GIF vs sticker providers can differ) with
// credentials present; a comma-separated list (or a single name, for
// backward compatibility) narrows it to just those - still only the ones
// among them that are actually configured.
function getConfiguredProviderNames(availableNames) {
  const raw = (process.env.GIF_PROVIDER || 'all').toLowerCase().trim();
  const requested = raw === 'all' ? availableNames : raw.split(',').map(s => s.trim());
  return requested.filter(name => availableNames.includes(name) && process.env[REQUIRED_ENV_VAR[name]]);
}

// Round-robin merge instead of concatenation, so the grid is a genuine mix
// (provider A, B, C, A, B, C, ...) rather than every result from one
// provider followed by every result from the next.
function interleave(groups) {
  const merged = [];
  const maxLength = Math.max(0, ...groups.map(group => group.length));
  for (let i = 0; i < maxLength; i++) {
    for (const group of groups) {
      if (group[i]) merged.push(group[i]);
    }
  }
  return merged;
}

// Queries every configured provider in parallel and merges the results.
// One bad/rate-limited/misconfigured key shouldn't take the others down
// with it, so a per-provider failure is swallowed here (not thrown) as
// long as at least one provider succeeds - only throws when literally
// nothing is configured, or every configured provider's request failed.
async function queryAllProviders(fnMap, args, limit) {
  const names = getConfiguredProviderNames(Object.keys(fnMap));
  if (names.length === 0) {
    throw new ProviderNotConfiguredError(Object.values(REQUIRED_ENV_VAR).join(' or '));
  }

  const perProviderLimit = Math.max(8, Math.ceil(limit / names.length));
  const settled = await Promise.allSettled(
    names.map(async name => {
      const items = await fnMap[name](...args, perProviderLimit);
      // Provider-prefixed so ids stay unique once merged (two different
      // providers can otherwise hand back colliding raw ids) - React's
      // keyExtractor and the offline GIF cache both rely on this.
      return {name, items: items.map(item => ({...item, id: `${name}:${item.id}`}))};
    }),
  );

  const succeeded = [];
  const failed = [];
  const groups = [];
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      succeeded.push(outcome.value.name);
      groups.push(outcome.value.items);
    } else {
      failed.push(outcome.reason?.message || String(outcome.reason));
    }
  }

  if (succeeded.length === 0) {
    const error = new Error(`All configured GIF providers failed (${names.join(', ')}): ${failed.join('; ')}`);
    error.allFailed = true;
    throw error;
  }

  return {results: interleave(groups).slice(0, limit), providers: {succeeded, failed}};
}

async function searchGifs(query, limit = 100) {
  return queryAllProviders(PROVIDERS, [query], limit);
}

// Shown in GifStickerPanel the moment it opens, before the user has typed
// anything - matches Gboard, which never shows an empty GIF panel.
async function getTrendingGifs(limit = 24) {
  return queryAllProviders(TRENDING_PROVIDERS, [], limit);
}

async function searchStickers(query, limit = 100) {
  return queryAllProviders(STICKER_PROVIDERS, [query], limit);
}

async function getTrendingStickers(limit = 24) {
  return queryAllProviders(STICKER_TRENDING_PROVIDERS, [], limit);
}

module.exports = {
  searchGifs,
  getTrendingGifs,
  searchStickers,
  getTrendingStickers,
  getConfiguredProviderNames,
  ProviderNotConfiguredError,
};
