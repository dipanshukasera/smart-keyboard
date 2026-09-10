const {record} = require('../services/logStore');

// Render pings healthCheckPath (/health) continuously, which would bury
// every real entry under thousands of identical rows.
const SKIPPED_PATHS = new Set(['/health']);

function levelForStatus(status) {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

/**
 * One row per request, written on response finish so the status code and
 * duration are already known. Deliberately does not touch req.body:
 * /api/users/login and /api/users/register carry plaintext passwords and
 * /api/translate carries whatever the user typed, none of which belongs
 * in a debugging collection.
 */
function requestLogger(req, res, next) {
  if (SKIPPED_PATHS.has(req.path)) {
    return next();
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
    record(levelForStatus(res.statusCode), `${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      query: req.query,
    });
  });

  next();
}

module.exports = {requestLogger};
