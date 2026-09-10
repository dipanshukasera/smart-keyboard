const mongoose = require('mongoose');
const Log = require('../models/Log');

// Pristine references, captured before installConsoleCapture() swaps the
// console methods out. Everything in here prints through these rather
// than the patched ones: a persist failure reported via the *patched*
// console would try to persist itself, fail again, and recurse forever.
const nativeConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

const LEVEL_BY_METHOD = {log: 'info', info: 'info', debug: 'info', warn: 'warn', error: 'error'};

// Mongo documents have a hard size ceiling and a stack trace or dumped
// object can be enormous - a truncated log entry is still useful, a
// rejected write isn't.
const MAX_MESSAGE_LENGTH = 8000;

// Never persist a value under one of these query keys. Request bodies are
// skipped wholesale (see requestLogger) since /api/users/login and
// /api/translate carry passwords and user text, but query strings are
// worth keeping - `?q=cat` is exactly what makes a failed GIF search
// debuggable - so they're kept with the sensitive keys stripped.
const SENSITIVE_QUERY_KEY = /token|secret|password|apikey|api_key|auth/i;

function formatArg(arg) {
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    // Circular structures, BigInt, etc.
    return String(arg);
  }
}

function redactQuery(query) {
  if (!query || typeof query !== 'object') return undefined;
  const entries = Object.entries(query);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([key, value]) => [key, SENSITIVE_QUERY_KEY.test(key) ? '[redacted]' : value]));
}

// Fire-and-forget: a log write must never delay a response or take the
// process down, so this is deliberately not awaited and swallows its own
// errors. A no-op when Mongo isn't connected (the deployed service runs
// without MONGODB_URI set - see render.yaml), which is why console output
// is always produced independently of whether the row lands.
function persist(level, message, extra = {}) {
  if (mongoose.connection.readyState !== 1) return;
  Log.create({
    level,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    ...extra,
    query: redactQuery(extra.query),
  }).catch(error => {
    nativeConsole.error('[logStore] could not persist log entry:', error.message);
  });
}

/**
 * Prints and stores one entry. Used directly for structured rows (see
 * requestLogger) so they keep their method/status/duration fields instead
 * of being flattened into a message string.
 */
function record(level, message, extra = {}) {
  (nativeConsole[level === 'info' ? 'log' : level] || nativeConsole.log)(message);
  persist(level, message, extra);
}

/**
 * Routes every console.log/info/warn/error/debug call in the process into
 * the `logs` collection, on top of its normal stdout/stderr output - so
 * dropping a plain console.log anywhere in the backend is enough to get a
 * row that's visible in Compass, with no special logger to import.
 *
 * Calls that happen before Mongo connects (module load time) still print
 * but aren't stored, since there's no connection to write them through.
 */
function installConsoleCapture() {
  for (const [method, level] of Object.entries(LEVEL_BY_METHOD)) {
    console[method] = (...args) => {
      nativeConsole[method](...args);
      const firstError = args.find(arg => arg instanceof Error);
      persist(level, args.map(formatArg).join(' '), firstError ? {stack: firstError.stack} : {});
    };
  }
}

module.exports = {record, installConsoleCapture};
