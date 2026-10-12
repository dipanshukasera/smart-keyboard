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

// Tenor pages by opaque cursor (the `next` string from the previous
// response fed back as `pos`), not by page number, so a page number can't
// be turned into a request the way Klipy's and Redgifs' can. Rather than
// re-request page 1 and hand back duplicates of what the grid already
// shows, later pages return nothing from this provider.
async function searchTenor(query, limit, page = 1) {
  if (!process.env.TENOR_API_KEY) {
    throw new ProviderNotConfiguredError('TENOR_API_KEY');
  }
  if (page > 1) {
    return [];
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

async function searchKlipy(query, limit, page = 1) {
  if (!process.env.KLIPY_APP_KEY) {
    throw new ProviderNotConfiguredError('KLIPY_APP_KEY');
  }
  const response = await axios.get(
    `https://api.klipy.com/api/v1/${process.env.KLIPY_APP_KEY}/gifs/search`,
    {params: {q: query, per_page: limit, page}},
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
async function searchKlipyStickers(query, limit, page = 1) {
  if (!process.env.KLIPY_APP_KEY) {
    throw new ProviderNotConfiguredError('KLIPY_APP_KEY');
  }
  const response = await axios.get(
    `https://api.klipy.com/api/v1/${process.env.KLIPY_APP_KEY}/stickers/search`,
    {params: {q: query, per_page: limit, page}},
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

// Adult GIFs, served by Redgifs' public v2 API. Unlike every other
// provider this one has no API key to gate on, so it's gated on the
// explicit ENABLE_ADULT_GIFS opt-in instead (see adultGifsEnabled) and
// lives only in ADULT_PROVIDERS - deliberately never in PROVIDERS, so it
// cannot be interleaved into the ordinary GIF grid by queryAllProviders.
// Reaching it requires both the server opt-in and the user turning
// "Adult GIFs" on in the keyboard's own settings.
//
// Replaced pornsearch@0.3.1, which was unusable: it scraped markup that
// had since changed and returned entries whose href was undefined
// ("http://dl.phncdn.comundefined.gif"), and its own cheerio dependency
// was never declared so it couldn't even be required.
const REDGIFS_API = 'https://api.redgifs.com/v2';
// The temporary token below is bound to the User-Agent that requested it
// (see the valid_agent claim inside the JWT), so auth and search have to
// present the same one or the search comes back 401.
const REDGIFS_USER_AGENT = 'SmartKeyboard/0.1';

let redgifsToken = null;
let redgifsTokenExpiresAt = 0;

// Redgifs hands out anonymous bearer tokens - no account or dashboard
// key - but they expire, so this caches one and re-fetches on demand
// rather than authenticating on every search.
async function getRedgifsToken(forceRefresh = false) {
  if (!forceRefresh && redgifsToken && Date.now() < redgifsTokenExpiresAt) {
    return redgifsToken;
  }
  const response = await axios.get(`${REDGIFS_API}/auth/temporary`, {
    headers: {'User-Agent': REDGIFS_USER_AGENT},
  });
  redgifsToken = response.data.token;
  // Observed lifetime is ~24h; refreshing at 12h avoids parsing the JWT
  // just to read its exp claim.
  redgifsTokenExpiresAt = Date.now() + 12 * 60 * 60 * 1000;
  return redgifsToken;
}

// Most Redgifs entries are video (type 1: urls.sd/hd are .mp4, with .jpg
// only in poster/thumbnail); type 2 entries are stills. Redgifs serves no
// GIF/WebP variant at all - those URLs 403 - so animation here can only
// come from the mp4.
//
// previewUrl/fullUrl therefore stay image-only (every other provider's
// results are images, and the offline cache and clipboard fallback both
// assume that), and the mp4 is carried alongside as videoUrl. Only this
// provider ever sets that field; GifStickerPanel plays it for the 18+ tab
// and GifCommitModule sends it when the target field accepts video.
const IMAGE_URL_PATTERN = /\.(jpe?g|png|gif|webp)(\?|$)/i;
const VIDEO_URL_PATTERN = /\.(mp4|m4v|webm)(\?|$)/i;

function mapRedgifsItem(item) {
  const urls = item?.urls || {};
  const preview = [urls.thumbnail, urls.poster, urls.sd, urls.hd].find(url => IMAGE_URL_PATTERN.test(url || ''));
  const full = [urls.poster, urls.hd, urls.sd, urls.thumbnail].find(url => IMAGE_URL_PATTERN.test(url || ''));
  if (!preview || !full) {
    return null;
  }
  // sd (the 480p "-mobile" encode) first: this is the file that's previewed
  // and sent, and "silent" is the full-resolution encode minus audio - up to
  // 1080p and ~9MB against ~1MB for sd, which made 18+ sends take seconds.
  const video = [urls.sd, urls.silent, urls.hd].find(url => VIDEO_URL_PATTERN.test(url || ''));
  return {id: String(item.id), previewUrl: preview, fullUrl: full, videoUrl: video ?? null};
}

// `params` is the Redgifs filter: {tags} for a search, {order} for a feed.
async function queryRedgifs(params, limit, page) {
  const request = async token =>
    axios.get(`${REDGIFS_API}/gifs/search`, {
      params: {...params, count: Math.min(limit, 80), page},
      headers: {Authorization: `Bearer ${token}`, 'User-Agent': REDGIFS_USER_AGENT},
    });

  let response;
  try {
    response = await request(await getRedgifsToken());
  } catch (error) {
    // A cached token that expired early (or was invalidated) reads as a
    // 401 - retry once with a fresh one before giving up, so a stale
    // token doesn't surface to the user as a dead feature. The token is
    // also bound to the requesting IP (its valid_addr claim), so a host
    // whose outbound address changes gets a 401 "WrongSender" here too,
    // which the same refresh fixes.
    if (error.response?.status !== 401) {
      throw error;
    }
    response = await request(await getRedgifsToken(true));
  }

  return (response.data.gifs || []).map(mapRedgifsItem).filter(Boolean);
}

// Most words a user would type that a fallback should never search on
// alone - as single tags they fuzzy-match to arbitrary popular content.
const TAG_STOPWORDS = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'on', 'with', 'for', 'to', 'my', 'me', 'gif', 'gifs']);
const MAX_FALLBACK_TAGS = 4;

// Searches by tag, not free text: Redgifs silently ignores search_text and
// returns the same generic feed for every query, which is why 18+ results
// never matched what was typed. Its `tags` param does match, and resolves
// loose input itself ("kiss" -> Kissing, "french kissing" -> French
// Kissing), treating several words as AND.
//
// That AND is also its weakness: one word Redgifs has no tag for empties
// the whole result set ("kiss xyzzq" -> 0). So if the full query finds
// nothing, fall back to each meaningful word as its own tag and merge
// those results - an OR over the words that do match something.
async function searchAdultGifsProvider(query, limit, page = 1) {
  const cleaned = query.trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];

  const exact = await queryRedgifs({tags: cleaned}, limit, page);
  if (exact.length > 0) return exact;

  const words = [...new Set(cleaned.toLowerCase().split(' '))]
    .filter(word => word.length > 1 && !TAG_STOPWORDS.has(word))
    .slice(0, MAX_FALLBACK_TAGS);
  if (words.length < 2) return exact;

  const perWordLimit = Math.max(8, Math.ceil(limit / words.length));
  const settled = await Promise.allSettled(words.map(word => queryRedgifs({tags: word}, perWordLimit, page)));
  const groups = settled.filter(outcome => outcome.status === 'fulfilled').map(outcome => outcome.value);
  if (groups.length === 0) {
    // Every per-word request failed outright (not just empty) - surface
    // the error rather than reporting "nothing matched".
    throw settled[0].reason;
  }

  // The same GIF can be tagged with several of the words - keep its first
  // appearance so the merged grid has no duplicate tiles.
  const seen = new Set();
  return interleave(groups)
    .filter(item => !seen.has(item.id) && seen.add(item.id))
    .slice(0, limit);
}

// What the 18+ tab shows before anything is searched, so it doesn't open
// empty. "top7" (most popular this week) rather than "trending": trending
// returned short, uneven pages (7 or 5 items when asked for 10), top7 a
// full page every time. Same gating as search - only reachable through
// getTrendingAdultGifs, behind ENABLE_ADULT_GIFS and the user's opt-in.
async function trendingAdultGifsProvider(limit) {
  return queryRedgifs({order: 'top7'}, limit, 1);
}

/**
 * Server-side kill switch for the adult provider, independent of the
 * per-user keyboard setting. Off unless explicitly set to "true", so a
 * deployment that never sets it (see render.yaml) can't serve this at all
 * no matter what a client asks for. A bare truthy check would treat
 * ENABLE_ADULT_GIFS=false as enabled, hence the exact comparison.
 */
function adultGifsEnabled() {
  return String(process.env.ENABLE_ADULT_GIFS).toLowerCase() === 'true';
}

class ProviderNotConfiguredError extends Error {
  constructor(missingEnvVar) {
    super(`GIF provider is not configured (missing ${missingEnvVar})`);
    this.name = 'ProviderNotConfiguredError';
    this.missingEnvVar = missingEnvVar;
  }
}

// Distinct from ProviderNotConfiguredError so the route can answer 403
// ("switched off here") rather than 503 ("misconfigured") - and so an
// empty result set stays distinguishable from the feature being disabled.
class AdultContentDisabledError extends Error {
  constructor() {
    // Message is shown verbatim in the keyboard (GifStickerPanel surfaces
    // the backend's `error` string), so it's phrased for whoever is
    // holding the phone - naming the env var told them nothing they could
    // act on.
    super('Adult GIFs aren’t enabled. Turn them on in keyboard settings to use this feature.');
    this.name = 'AdultContentDisabledError';
  }
}

const PROVIDERS = {
  tenor: searchTenor,
  klipy: searchKlipy,
};

// Kept out of PROVIDERS on purpose - queryAllProviders interleaves every
// map it's given into one grid, so anything listed there shows up in the
// ordinary GIF search. This map is only ever reached through
// searchAdultGifs, behind both ENABLE_ADULT_GIFS and the user's own
// keyboard setting.
const ADULT_PROVIDERS = {
  adult: searchAdultGifsProvider,
};

const ADULT_TRENDING_PROVIDERS = {
  adult: trendingAdultGifsProvider,
};

const TRENDING_PROVIDERS = {
  tenor: trendingTenor,
  klipy: trendingKlipy,
};

// Only Klipy has a genuine Stickers library among the providers wired up
// here - Tenor's "stickers" are usually just GIFs re-tagged, not a
// separate catalog, so it's left out rather than faked. Structured the
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
async function queryAllProviders(fnMap, args, limit, {requireApiKey = true, page = 1} = {}) {
  // requireApiKey: false is for provider maps whose gate isn't an API key
  // (ADULT_PROVIDERS, gated on ENABLE_ADULT_GIFS + the user's setting).
  // Those also skip GIF_PROVIDER, which selects between the ordinary GIF
  // providers and shouldn't double as an on/off switch for a separate
  // content library.
  const names = requireApiKey ? getConfiguredProviderNames(Object.keys(fnMap)) : Object.keys(fnMap);
  if (names.length === 0) {
    throw new ProviderNotConfiguredError(Object.values(REQUIRED_ENV_VAR).join(' or '));
  }

  const perProviderLimit = Math.max(8, Math.ceil(limit / names.length));
  const settled = await Promise.allSettled(
    names.map(async name => {
      // page is appended after the limit, so providers that don't paginate
      // can simply ignore the extra argument.
      const items = await fnMap[name](...args, perProviderLimit, page);
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

  // A partial failure is swallowed on purpose (see above) but silently
  // swallowing it left no way to tell a degraded provider from a healthy
  // one - the response still looks fine, just with fewer results.
  if (failed.length > 0 && succeeded.length > 0) {
    console.warn(`GIF provider(s) failed but others succeeded [ok: ${succeeded.join(', ')}]: ${failed.join('; ')}`);
  }

  if (succeeded.length === 0) {
    const error = new Error(`All configured GIF providers failed (${names.join(', ')}): ${failed.join('; ')}`);
    error.allFailed = true;
    throw error;
  }

  return {results: interleave(groups).slice(0, limit), providers: {succeeded, failed}};
}

// One screenful-plus of results per request instead of a single large
// batch: 100 at once meant a long wait before anything appeared and a
// hard ceiling on how much a user could ever browse. Paging lets the grid
// fill quickly and keep going as they scroll.
const PAGE_SIZE = 50;

async function searchGifs(query, {page = 1} = {}) {
  return queryAllProviders(PROVIDERS, [query], PAGE_SIZE, {page});
}

/**
 * Adult GIF search. Separate entry point rather than another
 * queryAllProviders(PROVIDERS, ...) caller, for two reasons: results must
 * never be merged into the ordinary grid, and getConfiguredProviderNames
 * gates on an API key that this provider doesn't have.
 *
 * Throws AdultContentDisabledError when the server opt-in is absent, so
 * the route can answer 403 rather than an empty list - "turned off" and
 * "nothing matched" need to be distinguishable by the client.
 */
async function searchAdultGifs(query, {page = 1} = {}) {
  if (!adultGifsEnabled()) {
    throw new AdultContentDisabledError();
  }
  return queryAllProviders(ADULT_PROVIDERS, [query], PAGE_SIZE, {requireApiKey: false, page});
}

// The 18+ tab's default grid, shown when that tab is opened - never in
// the panel's initial view, which always opens on the GIFs tab. Same
// opt-in gate as searchAdultGifs.
async function getTrendingAdultGifs(limit = 24) {
  if (!adultGifsEnabled()) {
    throw new AdultContentDisabledError();
  }
  return queryAllProviders(ADULT_TRENDING_PROVIDERS, [], limit, {requireApiKey: false});
}

// Shown in GifStickerPanel the moment it opens, before the user has typed
// anything - matches Gboard, which never shows an empty GIF panel.
async function getTrendingGifs(limit = 24) {
  return queryAllProviders(TRENDING_PROVIDERS, [], limit);
}

async function searchStickers(query, {page = 1} = {}) {
  return queryAllProviders(STICKER_PROVIDERS, [query], PAGE_SIZE, {page});
}

async function getTrendingStickers(limit = 24) {
  return queryAllProviders(STICKER_TRENDING_PROVIDERS, [], limit);
}

module.exports = {
  PAGE_SIZE,
  searchGifs,
  getTrendingGifs,
  searchStickers,
  getTrendingStickers,
  searchAdultGifs,
  getTrendingAdultGifs,
  adultGifsEnabled,
  getConfiguredProviderNames,
  ProviderNotConfiguredError,
  AdultContentDisabledError,
};
