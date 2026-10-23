// A small in-memory cache for the GIF feeds and searches, so a repeated
// query is answered from memory in about a millisecond instead of going to
// the GIF provider again. Only successful JSON answers are kept, for a few
// minutes: trending changes slowly, and a search for "love" doesn't need
// to be fresh to the second. Keyed by the full URL (query and page).
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;

const entries = new Map();

function responseCache(req, res, next) {
  if (req.method !== 'GET') return next();
  const key = req.originalUrl;
  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) {
    res.set('X-Cache', 'HIT');
    return res.status(200).json(hit.body);
  }

  const send = res.json.bind(res);
  res.json = body => {
    if (res.statusCode === 200) {
      if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value);
      entries.set(key, {body, expires: Date.now() + TTL_MS});
    }
    res.set('X-Cache', 'MISS');
    return send(body);
  };
  next();
}

module.exports = {responseCache};
