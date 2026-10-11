const {spawn} = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Converts a Redgifs mp4 into an actual .gif, for chat fields that accept
// images but not video. Redgifs serves no GIF variant at all (see
// mapRedgifsItem in gifProviders.js), so without this the only thing such
// a field could receive was a still frame.
//
// Done per tap, never for a whole results grid: a GIF is many times the
// size of the same clip as mp4, and the free Render instance this runs on
// has a fraction of one CPU core. Measured at 0.1 CPU (that tier's share):
// ~8-12s per clip with the settings below, output 100-500KB. The keyboard
// allows for that (see GifCommitModule's read timeout).

// Only Redgifs' own media host - this endpoint fetches whatever URL it's
// handed, so without an allowlist it could be pointed at internal or
// arbitrary addresses (SSRF), or used as a free general-purpose converter.
const ALLOWED_HOSTS = new Set(['media.redgifs.com']);

const CLIP_SECONDS = 3;
const OUTPUT_FPS = 10;
// Longest side, so portrait clips (common on Redgifs) don't come out
// twice as tall - and twice the file size - as landscape ones.
const OUTPUT_MAX_SIDE = 240;
const FFMPEG_TIMEOUT_MS = 45_000;
// More than this many simultaneous ffmpeg runs would just split the same
// fraction of a core between them and push every one past the client's
// timeout - later requests wait their turn instead.
const MAX_CONCURRENT = 1;

const CACHE_DIR = path.join(os.tmpdir(), 'gif-convert-cache');
const MAX_CACHE_FILES = 60;

class ConversionRejectedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConversionRejectedError';
  }
}

function validateSource(src) {
  let url;
  try {
    url = new URL(src);
  } catch {
    throw new ConversionRejectedError('"src" must be a valid URL');
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || !/\.mp4$/i.test(url.pathname)) {
    throw new ConversionRejectedError('"src" must be a Redgifs mp4 URL');
  }
  return url.toString();
}

let running = 0;
const waiting = [];

async function withConversionSlot(task) {
  if (running >= MAX_CONCURRENT) {
    await new Promise(resolve => waiting.push(resolve));
  }
  running++;
  try {
    return await task();
  } finally {
    running--;
    const next = waiting.shift();
    if (next) next();
  }
}

// Two taps on the same tile (or two users sending the same clip) share one
// conversion rather than each starting their own.
const inFlight = new Map();

async function convertToGif(src) {
  const sourceUrl = validateSource(src);
  const key = crypto.createHash('sha1').update(sourceUrl).digest('hex');
  const outputPath = path.join(CACHE_DIR, `${key}.gif`);

  if (fs.existsSync(outputPath)) {
    // Touch so eviction below treats it as recently used.
    const now = new Date();
    fs.utimesSync(outputPath, now, now);
    return outputPath;
  }
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const job = withConversionSlot(() => convertPreferringMobile(sourceUrl, outputPath)).finally(() =>
    inFlight.delete(key),
  );
  inFlight.set(key, job);
  return job;
}

// The URL the keyboard sends is the full-quality encode, which for many
// clips is 1080p - decoding that took 35s at 0.1 CPU against ~8s for the
// same clip's "-mobile" encode (480p). The GIF is 240px either way, so the
// smaller source costs nothing visible. Not every clip has a mobile
// variant, hence the fallback.
async function convertPreferringMobile(sourceUrl, outputPath) {
  const mobileUrl = sourceUrl.replace(/(-silent)?\.mp4$/i, '-mobile.mp4');
  if (mobileUrl !== sourceUrl) {
    try {
      return await runConversion(mobileUrl, outputPath);
    } catch (error) {
      console.warn(`Mobile variant failed for ${sourceUrl}, using the original: ${error.message}`);
    }
  }
  return runConversion(sourceUrl, outputPath);
}

async function runConversion(sourceUrl, outputPath) {
  await fs.promises.mkdir(CACHE_DIR, {recursive: true});
  const partialPath = `${outputPath}.${process.pid}.part.gif`;

  try {
    // One decode pass: split the frames, build a palette from one copy and
    // apply it to the other. A GIF's 256-colour limit looks badly banded
    // without a per-clip palette; the bayer dither keeps the file smaller
    // than error-diffusion would. fast_bilinear and a 64-colour palette
    // cost little visible quality at 240px and cut encode time by ~30%.
    const filter =
      `fps=${OUTPUT_FPS},` +
      `scale=${OUTPUT_MAX_SIDE}:${OUTPUT_MAX_SIDE}:force_original_aspect_ratio=decrease:flags=fast_bilinear,` +
      'split[a][b];' +
      '[a]palettegen=max_colors=64:stats_mode=diff[p];' +
      '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle';
    await runFfmpeg([
      '-hide_banner',
      '-loglevel', 'error',
      // ffmpeg reads the URL itself rather than the whole file being
      // downloaded first: with -t before -i it only fetches as much of
      // the clip as it needs to decode. HTTPS only.
      '-protocol_whitelist', 'https,tls,tcp',
      '-threads', '1',
      '-t', String(CLIP_SECONDS),
      '-i', sourceUrl,
      '-an',
      '-vf', filter,
      '-loop', '0',
      '-f', 'gif',
      '-y', partialPath,
    ]);
    // Renamed into place only once complete, so a concurrent cache check
    // can never serve a half-written file.
    await fs.promises.rename(partialPath, outputPath);
    await evictOldEntries();
    return outputPath;
  } finally {
    await fs.promises.rm(partialPath, {force: true});
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk).slice(-2000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
    child.on('error', error => {
      clearTimeout(timer);
      reject(error.code === 'ENOENT' ? new Error('ffmpeg is not installed on this server') : error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(signal ? `ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms` : `ffmpeg failed: ${stderr.trim()}`));
    });
  });
}

// The instance's disk is ephemeral anyway (wiped on every deploy/restart),
// so this only has to stop a long-running instance from filling it up.
async function evictOldEntries() {
  const names = (await fs.promises.readdir(CACHE_DIR)).filter(name => /^[0-9a-f]{40}\.gif$/.test(name));
  if (names.length <= MAX_CACHE_FILES) return;
  const entries = await Promise.all(
    names.map(async name => {
      const fullPath = path.join(CACHE_DIR, name);
      return {fullPath, mtime: (await fs.promises.stat(fullPath)).mtimeMs};
    }),
  );
  entries.sort((a, b) => a.mtime - b.mtime);
  await Promise.all(entries.slice(0, entries.length - MAX_CACHE_FILES).map(e => fs.promises.rm(e.fullPath, {force: true})));
}

module.exports = {convertToGif, ConversionRejectedError};
