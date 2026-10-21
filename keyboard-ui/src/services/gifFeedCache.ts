import {Image} from 'react-native';
import {apiClient} from './api';
import {ThemeStorage} from '../native-bridge/ThemeStorage';

// The GIF/sticker trending feeds, kept so the GIF panel has something to
// show the instant it opens, instead of a skeleton until the server (and,
// after it's been idle, a 30-50 second cold start) answers and the first
// images download.
//  - cachedFeed: what's in memory;
//  - loadCachedFeed: memory, else what was saved on the phone last time;
//  - prefetchFeed: fetched when the keyboard starts - it wakes the server up
//    and downloads the first previews into the image cache, so by the time
//    the panel opens they're already on the phone.
// Used for GIFs, stickers and 18+ alike. The 18+ feed is only prefetched when
// the user has switched 18+ on (see App); like Recent, what's kept is just
// links and the images the image cache already holds, on this phone only.

export interface FeedItem {
  id: string;
  previewUrl: string;
  fullUrl: string;
  videoUrl?: string | null;
  mp4Url?: string | null;
}

const STORAGE_KEY = 'gif_feed_cache_v1';
// Previews downloaded ahead - about what fits on the first screen.
const PREFETCH_COUNT = 12;

const memory = new Map<string, FeedItem[]>();
let diskLoad: Promise<Record<string, FeedItem[]>> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadDisk(): Promise<Record<string, FeedItem[]>> {
  if (!diskLoad) {
    diskLoad = ThemeStorage.loadJSON<Record<string, FeedItem[]>>(STORAGE_KEY, {}).then(saved =>
      saved && typeof saved === 'object' ? saved : {},
    );
  }
  return diskLoad;
}

export function cachedFeed(endpoint: string): FeedItem[] | null {
  return memory.get(endpoint) ?? null;
}

export async function loadCachedFeed(endpoint: string): Promise<FeedItem[] | null> {
  const inMemory = memory.get(endpoint);
  if (inMemory) return inMemory;
  const saved = (await loadDisk())[endpoint];
  if (saved && saved.length > 0) {
    memory.set(endpoint, saved);
    return saved;
  }
  return null;
}

export function rememberFeed(endpoint: string, results: FeedItem[]) {
  memory.set(endpoint, results);
  // Written after a pause - the panel and the prefetch can both land close
  // together.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    const saved = await loadDisk();
    saved[endpoint] = results;
    ThemeStorage.saveJSON(STORAGE_KEY, saved);
  }, 1500);
}

// Fetches `endpoint`, remembers it, and starts downloading the first
// previews. Never throws: this is a head start, not something anyone waits on.
export async function prefetchFeed(endpoint: string): Promise<void> {
  try {
    const response = await apiClient.get<{results: FeedItem[]}>(endpoint);
    const results = response.data.results;
    if (!Array.isArray(results) || results.length === 0) return;
    rememberFeed(endpoint, results);
    results.slice(0, PREFETCH_COUNT).forEach(item => {
      Image.prefetch(item.previewUrl).catch(() => {});
    });
  } catch {
    // Offline, or the server is still waking - the panel just fetches again.
  }
}
