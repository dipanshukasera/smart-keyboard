/**
 * Swipe (gesture) typing: turns the path a finger traced across the letter
 * keys into the most likely words.
 *
 * A simplified version of the classic shape-writing approach (SHARK2):
 * every dictionary word implies an "ideal" path - straight lines between
 * the centres of its letters' keys. The traced path is compared with each
 * candidate's ideal path after resampling both to the same number of
 * evenly spaced points, and the closest ones win, nudged by how common the
 * word is. Runs on-device against the same frequency list as the
 * suggestions, so no network and no per-swipe latency.
 */

export interface Point {
  x: number;
  y: number;
}

// Points both paths are resampled to for the shape comparison.
const SAMPLES = 32;
// Denser sampling for the pass-through check: at 32 points a quick corner
// on a long word can fall between samples and wrongly fail the check.
const DENSE_SAMPLES = 128;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

// `points` redistributed as `count` points evenly spaced along its length.
function resample(points: Point[], count: number): Point[] {
  if (points.length === 1) return Array.from({length: count}, () => points[0]);
  const step = pathLength(points) / (count - 1);
  if (step === 0) return Array.from({length: count}, () => points[0]);
  const out: Point[] = [points[0]];
  let carried = 0;
  let prev = points[0];
  for (let i = 1; i < points.length && out.length < count; i++) {
    let next = points[i];
    let segment = distance(prev, next);
    while (carried + segment >= step && out.length < count) {
      const t = (step - carried) / segment;
      const point = {x: prev.x + t * (next.x - prev.x), y: prev.y + t * (next.y - prev.y)};
      out.push(point);
      prev = point;
      segment = distance(prev, next);
      carried = 0;
    }
    carried += segment;
    prev = next;
  }
  while (out.length < count) out.push(points[points.length - 1]);
  return out;
}

// The letters a word visits, with repeats collapsed ("hello" -> h,e,l,o):
// a doubled letter is the same key, so the finger doesn't move for it.
function keySequence(word: string): string[] {
  const letters: string[] = [];
  for (const ch of word) {
    if (letters[letters.length - 1] !== ch) letters.push(ch);
  }
  return letters;
}

/**
 * Up to `limit` words for `path`, best first.
 *
 * `keyCenters` maps each letter to its key's centre (same coordinate space
 * as `path`), `keyWidth` is a typical key's width, and `words` is a
 * frequency-ranked word list (index = rank, most common first).
 */
export function decodeSwipe(
  path: Point[],
  keyCenters: Record<string, Point>,
  keyWidth: number,
  words: string[],
  limit = 4,
): string[] {
  if (path.length < 2 || keyWidth <= 0) return [];
  const letters = Object.keys(keyCenters);
  const start = path[0];
  const end = path[path.length - 1];
  // Fingers rarely start or stop dead centre on a key - accept any key
  // within about one key width of the path's two ends.
  const near = (point: Point) =>
    new Set(letters.filter(letter => distance(keyCenters[letter], point) < keyWidth * 1.1));
  const startLetters = near(start);
  const endLetters = near(end);
  if (startLetters.size === 0 || endLetters.size === 0) return [];

  const traced = resample(path, SAMPLES);
  const dense = resample(path, DENSE_SAMPLES);
  const scored: {word: string; score: number}[] = [];

  for (let rank = 0; rank < words.length; rank++) {
    const word = words[rank];
    if (word.length < 2) continue;
    if (!startLetters.has(word[0]) || !endLetters.has(word[word.length - 1])) continue;
    const sequence = keySequence(word);
    if (!sequence.every(letter => keyCenters[letter])) continue;

    // Every letter's key has to be passed reasonably close to, in order -
    // a cheap filter before the full comparison, and what stops a short
    // word matching just the start and end of a long swipe. Each letter
    // takes the *first* approach to its key after the previous letter's,
    // not the closest one anywhere later: with the closest, a letter that
    // recurs near the end ("because" ends on e) jumped straight to the end
    // of the path and left nothing for the letters in between.
    let cursor = 0;
    let passesAll = true;
    const reach = keyWidth * 1.2;
    for (const letter of sequence) {
      const center = keyCenters[letter];
      let i = cursor;
      while (i < dense.length && distance(dense[i], center) > reach) i++;
      if (i === dense.length) {
        passesAll = false;
        break;
      }
      // Ride that approach down to its closest point before moving on.
      while (i + 1 < dense.length && distance(dense[i + 1], center) <= distance(dense[i], center)) i++;
      cursor = i;
    }
    if (!passesAll) continue;

    const ideal = resample(
      sequence.map(letter => keyCenters[letter]),
      SAMPLES,
    );
    let total = 0;
    for (let i = 0; i < SAMPLES; i++) total += distance(traced[i], ideal[i]);
    const shapeError = total / SAMPLES / keyWidth;
    // Common words win near-ties: an extra ~0.3 key widths of tolerance
    // between the most and least common words in the list.
    const rarity = Math.log10(rank + 10) * 0.08;
    scored.push({word, score: shapeError + rarity});
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map(entry => entry.word);
}
