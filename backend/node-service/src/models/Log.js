const mongoose = require('mongoose');

// Logs are debugging aids, not records worth keeping forever - without an
// expiry the collection grows without bound (every request writes a row)
// and eventually dwarfs the actual application data.
const LOG_RETENTION_SECONDS = 7 * 24 * 60 * 60;

const logSchema = new mongoose.Schema({
  level: {type: String, enum: ['info', 'warn', 'error'], required: true, index: true},
  message: {type: String, required: true},
  // Request-scoped fields (absent on startup/provider entries).
  method: String,
  path: {type: String, index: true},
  status: Number,
  durationMs: Number,
  query: mongoose.Schema.Types.Mixed,
  // Error-scoped.
  stack: String,
  meta: mongoose.Schema.Types.Mixed,
  // `expires` is what creates the TTL index MongoDB sweeps on.
  createdAt: {type: Date, default: Date.now, expires: LOG_RETENTION_SECONDS},
});

module.exports = mongoose.model('Log', logSchema);
