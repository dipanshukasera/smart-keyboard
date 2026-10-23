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

// --- Searches ----------------------------------------------------------------
// First pages of searches, kept in memory and on the phone, so a tag chip or a
// repeated search shows at once - even right after the keyboard restarts -
// instead of waiting on the server. Entries older than SEARCH_TTL_MS are
// dropped.
export interface SearchPage {
  results: FeedItem[];
  hasMore: boolean;
}
const SEARCH_STORAGE_KEY = 'gif_search_cache_v1';
const SEARCH_TTL_MS = 12 * 60 * 60 * 1000;
const SEARCH_MAX_ENTRIES = 80;
const searchMemory = new Map<string, SearchPage & {savedAt: number}>();
let searchLoad: Promise<void> | null = null;
let searchSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function searchKey(searchEndpoint: string, text: string) {
  return `${searchEndpoint}|${text.trim().toLowerCase()}`;
}

export function loadSearchCache(): Promise<void> {
  if (!searchLoad) {
    searchLoad = ThemeStorage.loadJSON<Record<string, SearchPage & {savedAt: number}>>(SEARCH_STORAGE_KEY, {}).then(saved => {
      const now = Date.now();
      Object.entries(saved ?? {}).forEach(([key, entry]) => {
        if (entry && now - entry.savedAt < SEARCH_TTL_MS && !searchMemory.has(key)) searchMemory.set(key, entry);
      });
    });
  }
  return searchLoad;
}

export function cachedSearch(key: string): SearchPage | null {
  const entry = searchMemory.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > SEARCH_TTL_MS) {
    searchMemory.delete(key);
    return null;
  }
  return entry;
}

export function rememberSearch(key: string, page: SearchPage) {
  searchMemory.delete(key);
  searchMemory.set(key, {...page, savedAt: Date.now()});
  while (searchMemory.size > SEARCH_MAX_ENTRIES) searchMemory.delete(searchMemory.keys().next().value as string);
  if (searchSaveTimer) clearTimeout(searchSaveTimer);
  searchSaveTimer = setTimeout(() => {
    searchSaveTimer = null;
    ThemeStorage.saveJSON(SEARCH_STORAGE_KEY, Object.fromEntries(searchMemory));
  }, 2000);
}

// The quick-search chips each tab shows (the panel renders these too).
export const DEFAULT_TAGS = {
  gif: ['Happy', 'Love', 'LOL', 'Sad', 'Thank you', 'Wow', 'Yes', 'No', 'Hello', 'Party', 'Dance', 'Good night'],
  sticker: ['Happy', 'Love', 'LOL', 'Sad', 'Thank you', 'Wow', 'Yes', 'No', 'Hello', 'Party', 'Cute', 'Good night'],
  adult: ['Kissing', 'Teasing', 'Couple', 'Boobs', 'Ass', 'Lesbian', 'Amateur', 'Cosplay'],
};

// Fetches each tag's first page one after another (two at a time), after the
// trending feeds, so every chip is already on the phone when it's tapped.
// Never throws, and skips whatever is already fresh.
export async function prefetchTagSearches(searchEndpoint: string, tags: string[]): Promise<void> {
  await loadSearchCache();
  const queue = tags.filter(tag => !cachedSearch(searchKey(searchEndpoint, tag)));
  const worker = async () => {
    for (let tag = queue.shift(); tag !== undefined; tag = queue.shift()) {
      try {
        const response = await apiClient.get<{results: FeedItem[]; hasMore: boolean}>(searchEndpoint, {params: {q: tag, page: 1}});
        const results = response.data.results;
        if (!Array.isArray(results) || results.length === 0) continue;
        rememberSearch(searchKey(searchEndpoint, tag), {results, hasMore: !!response.data.hasMore});
        results.slice(0, PREFETCH_COUNT).forEach(item => Image.prefetch(item.previewUrl).catch(() => {}));
      } catch {
        // Offline or the server is waking - tapping the chip will fetch.
      }
    }
  };
  await Promise.all([worker(), worker()]);
}
