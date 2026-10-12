import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  NativeModules,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Video from 'react-native-video';
import {useKeyboardStore} from '../store';
import {API_BASE_URL, apiClient} from '../services/api';
import {KeyboardLayout} from './KeyboardLayout';
import {ExpressionModeBar} from './ExpressionModeBar';
import {GifCommit} from '../native-bridge/GifCommit';

interface GifResult {
  id: string;
  previewUrl: string;
  fullUrl: string;
  // Only ever set by the adult provider (see mapRedgifsItem in
  // gifProviders.js): Redgifs has no GIF variant, so motion there can
  // only come from an mp4. Absent for GIF/sticker results, which are
  // animated images that <Image> handles directly.
  videoUrl?: string | null;
}

// 'adult' is only reachable when the user has switched "Adult GIFs (18+)"
// on in the settings panel - its tab isn't rendered otherwise, and it maps
// to a separate backend endpoint so its results are never mixed into the
// ordinary GIF/sticker grids.
export type ContentType = 'gif' | 'sticker' | 'adult';

const {ClipboardModule} = NativeModules;

// The backend's mp4 -> .gif endpoint for one 18+ clip. The path ends in
// .gif because GifCommitModule picks the MIME type it offers the chat app
// from the URL's extension.
function convertedGifUrl(videoUrl: string): string {
  return `${API_BASE_URL}/api/gif/adult/convert.gif?src=${encodeURIComponent(videoUrl)}`;
}

/**
 * Turns an axios failure into something that points at the actual
 * problem. The backend's own JSON `error` is preferred when there is one
 * (it's the most specific), but a response with no JSON body - a 404 HTML
 * error page from hitting a backend that predates the route, say - used to
 * fall through to "check your connection", which sends you debugging the
 * network when the request arrived just fine.
 */
function describeRequestFailure(err: any, typeLabel: string): string {
  const backendMessage = err?.response?.data?.error;
  if (backendMessage) {
    return backendMessage;
  }
  const status = err?.response?.status;
  if (status === 404) {
    return `${typeLabel} search isn't available on this server (404) - it may be running an older build`;
  }
  if (status) {
    return `${typeLabel} search failed (server returned ${status})`;
  }
  return `Couldn't reach ${typeLabel} search - check your connection`;
}

// Quick-search chips shown after the GIFs/Stickers/18+ tabs. Tapping one
// runs it as a search in the current tab. 18+ gets its own set: Redgifs
// searches by tag (see gifProviders.js), so these are tags it recognises.
const DEFAULT_TAGS: Record<ContentType, string[]> = {
  gif: ['Happy', 'Love', 'LOL', 'Sad', 'Thank you', 'Wow', 'Yes', 'No', 'Hello', 'Party', 'Dance', 'Good night'],
  sticker: ['Happy', 'Love', 'LOL', 'Sad', 'Thank you', 'Wow', 'Yes', 'No', 'Hello', 'Party', 'Cute', 'Good night'],
  adult: ['Kissing', 'Teasing', 'Couple', 'Boobs', 'Ass', 'Lesbian', 'Amateur', 'Cosplay'],
};

// The first chip in the tag row: shows what was sent from this tab before
// (cached, so it works offline) instead of search results.
const RECENT_TAG = '__recent__';

// The keyboard window is capped at 55% of the screen height (KeyboardReactView's
// MAX_HEIGHT_FRACTION). Anything below the grid that doesn't fit under that
// cap is clipped - which is how the ABC/emoji/GIF/delete bar ended up cut
// off. So the grid gets whatever the cap leaves after the panel's other
// rows (search box, tab/tag row, section label, mode bar, padding).
const WINDOW_HEIGHT_FRACTION = 0.55;
const PANEL_CHROME_DP = 170;
const MIN_GRID_HEIGHT_DP = 80;

// One content type per panel: GIFs (toolbar GIF button, All tools), and
// Stickers and 18+ as their own All tools entries - no switching between
// them inside the panel, which is just the search box, tags and results.
// App.tsx keys each instance by type, so opening a different one starts
// from a clean slate.
const SEARCH_PLACEHOLDER: Record<ContentType, string> = {
  gif: 'Search GIFs',
  sticker: 'Search stickers',
  adult: 'Search 18+ GIFs',
};

export function GifStickerPanel({contentType}: {contentType: ContentType}) {
  const {theme, recentGifs, addRecentGif} = useKeyboardStore();
  // A keyboard's own window can't summon another system keyboard on top of
  // itself, so there's no real focusable TextInput here - tapping the
  // search box swaps this panel into "typing" mode, reusing the same
  // QWERTY keys below (redirected into this local string via
  // KeyboardLayout's onCommitText/onDeleteBackward) instead of a real
  // InputConnection. This mirrors Gboard: browsing shows the results grid
  // and a slim mode-switch bar; tapping search swaps that bar for the keys.
  const [isTyping, setIsTyping] = useState(false);
  const [query, setQuery] = useState('');
  // Which tag chip is active: a default tag (then `query` holds it too),
  // RECENT_TAG, or null.
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  // The 18+ clip being previewed before sending (see renderVideoPreview).
  const [previewItem, setPreviewItem] = useState<GifResult | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const {height: windowHeight} = useWindowDimensions();
  const gridMaxHeight = Math.max(MIN_GRID_HEIGHT_DP, windowHeight * WINDOW_HEIGHT_FRACTION - PANEL_CHROME_DP);
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  // A failed request and a real "nothing matched" both used to collapse
  // into the same blank grid with no way to tell them apart - this makes
  // network failures visible instead of silently looking like empty results.
  const [error, setError] = useState<string | null>(null);
  // Paging state for search results. pageRef rather than state because
  // loadMore reads it inside a callback that FlatList holds onto.
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);
  // Brief confirmation after tapping a GIF - there was previously zero
  // feedback, so a silent clipboard-copy fallback looked identical to the
  // tap doing nothing at all.
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef('');
  // The search box isn't a real focusable TextInput (see below), so it
  // never got the one visual cue that tells you it's actually the active,
  // typeable field - a blinking caret, shown only while isTyping so it
  // reads the same way a real focused cursor would.
  const [cursorVisible, setCursorVisible] = useState(true);
  // One shared pulse drives every skeleton placeholder (the loading grid
  // and each tile still waiting on its image) - a separate looping
  // animation per tile would mean dozens running at once on a full page.
  const skeletonPulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {toValue: 1, duration: 650, useNativeDriver: true}),
        Animated.timing(skeletonPulse, {toValue: 0.45, duration: 650, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [skeletonPulse]);
  const skeletonColor = theme.keyText + '22';

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    if (!isTyping) return undefined;
    setCursorVisible(true);
    const interval = setInterval(() => setCursorVisible(v => !v), 500);
    return () => clearInterval(interval);
  }, [isTyping]);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  const ENDPOINTS: Record<ContentType, {trending: string; search: string; label: string}> = {
    gif: {trending: '/api/gif/trending', search: '/api/gif/search', label: 'GIFs'},
    sticker: {trending: '/api/gif/stickers/trending', search: '/api/gif/stickers/search', label: 'stickers'},
    // The panel itself always opens on GIFs, so the first thing anyone
    // sees stays safe; this feed only loads once the (opt-in) 18+ tab is
    // tapped, so the tab opens on popular clips rather than empty.
    adult: {trending: '/api/gif/adult/trending', search: '/api/gif/adult/search', label: '18+ GIFs'},
  };
  const trendingEndpoint = ENDPOINTS[contentType].trending;
  const searchEndpoint = ENDPOINTS[contentType].search;
  const typeLabel = ENDPOINTS[contentType].label;

  // Gboard never shows a blank panel - it's trending content until you
  // type a query. Loaded when the panel opens, when switching GIFs/Stickers
  // (each has its own feed), and whenever the query is emptied again -
  // previously emptying the box (or, now, deselecting a tag chip) left a
  // blank grid instead of going back to trending.
  const queryIsEmpty = !query.trim();
  useEffect(() => {
    if (!queryIsEmpty) return;
    setHasMore(false);
    pageRef.current = 1;
    (async () => {
      setResults([]);
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get<{results: GifResult[]}>(trendingEndpoint);
        if (!queryRef.current.trim()) {
          // Only apply if the user hasn't since started a real search -
          // don't clobber live results with a slow-to-resolve trending
          // fetch.
          setResults(response.data.results);
        }
      } catch (err: any) {
        if (!queryRef.current.trim()) {
          setError(describeRequestFailure(err, `trending ${typeLabel}`));
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryIsEmpty, contentType]);

  // A preview belongs to the grid it was opened from - switching tabs,
  // searching, tapping a tag or bringing the keys up all leave it.
  useEffect(() => {
    setPreviewItem(null);
  }, [contentType, query, selectedTag, isTyping]);

  // Editing the query by hand means it's no longer the tag that was
  // tapped; typing anything while Recent is open switches to searching.
  useEffect(() => {
    if (!selectedTag) return;
    if (selectedTag === RECENT_TAG ? query.trim() : query !== selectedTag) {
      setSelectedTag(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Re-run the current query when switching GIFs/Stickers/18+, since the
  // same text against a different library is a different search - but only
  // if there's something to search for.
  useEffect(() => {
    if (queryRef.current.trim()) {
      runSearch(queryRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType]);

  // page 1 replaces the grid; later pages append to it (see loadMore).
  const runSearch = async (text: string, page = 1) => {
    if (page === 1) {
      setLoading(true);
      // Put the keys away as soon as a search starts, so the skeleton grid
      // shows while it loads. The grid is hidden while the keys are up, so
      // searching from the keyboard's search key used to leave the keys on
      // screen with no sign anything was happening until results arrived -
      // on a slow response it looked frozen.
      setIsTyping(false);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const response = await apiClient.get<{results: GifResult[]; hasMore: boolean}>(searchEndpoint, {
        params: {q: text, page},
      });
      const batch = response.data.results;
      setHasMore(!!response.data.hasMore);
      pageRef.current = page;
      if (page === 1) {
        setResults(batch);
      } else {
        // Guard against the same id arriving twice - providers paginate
        // independently, and a duplicate key would break FlatList.
        setResults(prev => {
          const seen = new Set(prev.map(item => item.id));
          return [...prev, ...batch.filter(item => !seen.has(item.id))];
        });
      }
    } catch (err: any) {
      // A failed "load more" keeps whatever is already on screen - only a
      // failed first page should empty the grid.
      if (page === 1) {
        setResults([]);
      }
      setHasMore(false);
      setError(describeRequestFailure(err, typeLabel));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Fires as the grid nears its end. Trending has no paging, so this only
  // applies while a query is active.
  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    const text = queryRef.current.trim();
    if (!text) return;
    runSearch(text, pageRef.current + 1);
  };

  /**
   * Scrolling still auto-loads, but that left nothing on screen to show
   * paging existed - just a spinner that flashed by. This gives the grid a
   * standing footer: a tappable "Load more", or a clear end-of-results
   * note once there's nothing left to fetch.
   *
   * Trending (no query) isn't paginated, so it gets no footer at all.
   */
  const renderGridFooter = () => {
    if (!queryRef.current.trim() || results.length === 0) {
      return null;
    }
    if (loadingMore) {
      return (
        <View style={styles.gridFooter}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.gridFooterText, {color: theme.keyText + '99'}]}>Loading more…</Text>
        </View>
      );
    }
    if (hasMore) {
      return (
        <View style={styles.gridFooter}>
          <TouchableOpacity
            style={[styles.loadMoreButton, {backgroundColor: theme.accent}]}
            onPress={loadMore}>
            <Text style={styles.loadMoreText}>Load more</Text>
            <Icon name="expand-more" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.gridFooter}>
        <Text style={[styles.gridFooterText, {color: theme.keyText + '99'}]}>
          {`That's all ${typeLabel} for "${queryRef.current.trim()}"`}
        </Text>
      </View>
    );
  };

  // Tapping the active chip again deselects it, back to trending.
  const selectTag = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
      if (tag !== RECENT_TAG) setQuery('');
      return;
    }
    setSelectedTag(tag);
    if (tag === RECENT_TAG) {
      setQuery('');
      return;
    }
    setQuery(tag);
    runSearch(tag);
  };

  // 18+ results are video, and the grid only shows their still frame (see
  // the play badge below) - so tapping one previews it first, and sending
  // is a second, deliberate tap. GIFs and stickers already animate in the
  // grid, so they still send on a single tap.
  const onResultPress = (item: GifResult) => {
    if (item.videoUrl) {
      setPreviewReady(false);
      setPreviewFailed(false);
      setPreviewItem(item);
      // Start fetching the exact file Send will use while the preview plays
      // - for a converted GIF that also starts the conversion on the server.
      // By the time Send is tapped it's usually already on the phone, and a
      // Send mid-download waits for this one instead of starting another
      // (see GifCommitModule's per-URL lock).
      sendUrlFor(item).then(url => GifCommit.cacheGif(url));
    } else {
      selectGif(item);
    }
  };

  const sendPreview = () => {
    if (!previewItem) return;
    const item = previewItem;
    setPreviewItem(null);
    selectGif(item);
  };

  // Recents are kept per panel. Entries record which panel sent them;
  // older ones don't, so for those 18+ is told apart by the "adult:" id
  // prefix its provider gives (see queryAllProviders) and the rest show
  // under both GIFs and Stickers. 18+ never shows outside the 18+ panel.
  const tabRecents = recentGifs.filter(entry =>
    entry.kind ? entry.kind === contentType : (contentType === 'adult') === entry.id.startsWith('adult:'),
  );

  const showFeedback = (message: string) => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    setFeedback(message);
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 1800);
  };

  // Which file a send of `gif` will use. GIFs and stickers: the preview-size
  // file the grid has already downloaded, so it sends in milliseconds
  // (GifCommitModule copies it out of the image cache; the full-size file is
  // 0.5-10MB). 18+ items are mp4 (Redgifs has no GIF), and far fewer fields
  // accept video than images: the mp4 where the field takes video, else a
  // real .gif converted from it on the backend, else the still frame.
  const sendUrlFor = async (gif: GifResult): Promise<string> => {
    if (!gif.videoUrl) return gif.previewUrl;
    if (await GifCommit.acceptsUrl(gif.videoUrl)) return gif.videoUrl;
    if (await GifCommit.isRichContentSupported()) return convertedGifUrl(gif.videoUrl);
    return gif.fullUrl;
  };

  const selectGif = async (gif: GifResult) => {
    // Sends the file into the focused field (this is how Instagram DMs,
    // WhatsApp, Telegram etc. actually receive a GIF - a pasted URL isn't a
    // GIF as far as they're concerned). If that fails, an 18+ clip falls
    // back to its still frame, and only then to copying a link.
    const stillUrl = gif.videoUrl ? gif.fullUrl : gif.previewUrl;
    const url = await sendUrlFor(gif);
    let sentUrl: string | null = (await GifCommit.commitGif(url)) ? url : null;
    if (!sentUrl && url !== stillUrl && (await GifCommit.commitGif(stillUrl))) {
      sentUrl = stillUrl;
    }
    // No confirmation on success - the GIF appearing in the chat is the
    // confirmation. Only the fallback needs saying.
    if (!sentUrl) {
      ClipboardModule?.setClipboardText(gif.videoUrl || gif.fullUrl);
      showFeedback('This app doesn’t accept images directly - link copied, paste it instead');
    }
    // A converted GIF is already sitting in the native download cache, so
    // the recents entry can be the animation rather than the still frame.
    cacheForOffline(gif, sentUrl && sentUrl !== gif.videoUrl ? sentUrl : stillUrl);
  };

  // "Used" (searched-for and tapped, not merely scrolled past) is the
  // trigger for offline availability - caching every thumbnail just from
  // browsing would download far more than anyone will ever revisit.
  const cacheForOffline = async (gif: GifResult, fullUrl: string) => {
    // GIFs and stickers now send the preview file itself, so both are the
    // same URL - cache it once rather than twice in parallel (two copies of
    // the same file racing each other made one fall back to the network).
    const previewUri = await GifCommit.cacheGif(gif.previewUrl);
    const fullUri = fullUrl === gif.previewUrl ? previewUri : await GifCommit.cacheGif(fullUrl);
    if (previewUri && fullUri) {
      addRecentGif({id: gif.id, previewUri, fullUri, timestamp: Date.now(), kind: contentType});
    }
  };

  const resendRecent = async (entry: {id: string; previewUri: string; fullUri: string}) => {
    const sent = await GifCommit.commitGif(entry.fullUri);
    if (!sent) {
      ClipboardModule?.setClipboardText(entry.fullUri);
      showFeedback('This app doesn’t accept images directly');
    }
    addRecentGif({...entry, timestamp: Date.now()});
  };

  const appendToQuery = (text: string) => setQuery(prev => prev + text);
  const deleteFromQuery = (count: number) =>
    setQuery(prev => prev.slice(0, Math.max(0, prev.length - count)));

  // The search box is our own local `query` state rendered as plain Text,
  // not a real OS EditText - there's no InputConnection backing it, so
  // Android's native long-press-to-select-and-copy has nothing to attach
  // to here (long-pressing it does nothing, and always will, however this
  // is styled). This button is the deliberate replacement: an explicit,
  // always-reachable way to get the query text onto the clipboard.
  const copyQuery = () => {
    if (!query.trim()) return;
    ClipboardModule?.setClipboardText(query);
    showFeedback('Copied!');
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      <View style={styles.searchRow}>
        <TouchableOpacity
          style={[styles.searchBox, {backgroundColor: theme.keyBackground, borderColor: theme.accent}]}
          onPress={() => setIsTyping(true)}>
          <View style={styles.searchBoxContent}>
            {!query && !isTyping && (
              <Text style={{color: theme.keyText + '99'}} numberOfLines={1}>
                {SEARCH_PLACEHOLDER[contentType]}
              </Text>
            )}
            {!!query && (
              <Text style={{color: theme.keyText}} numberOfLines={1}>
                {query}
              </Text>
            )}
            {isTyping && (
              <View
                style={[
                  styles.cursor,
                  {backgroundColor: theme.keyText, opacity: cursorVisible ? 1 : 0},
                ]}
              />
            )}
          </View>
        </TouchableOpacity>
        {query.trim().length > 0 && (
          <TouchableOpacity style={styles.doneButton} onPress={copyQuery}>
            <Icon name="content-copy" size={18} color={theme.accent} />
          </TouchableOpacity>
        )}
        {isTyping && (
          // Searches as well as dismissing the keys: now that typing no
          // longer auto-searches, a button that only collapsed the keyboard
          // would leave the user staring at an unsearched query.
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => {
              if (query.trim()) {
                runSearch(query);
              }
              setIsTyping(false);
            }}>
            <Text style={{color: theme.accent, fontSize: 18}}>{'✓'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isTyping && (
        // Recent, then this type's default tags - one row that scrolls
        // sideways, so any number of tags fits.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.typeToggleRow}
          contentContainerStyle={styles.typeToggleContent}
          keyboardShouldPersistTaps="handled">
          {[RECENT_TAG, ...DEFAULT_TAGS[contentType]].map(tag => {
            const selected = selectedTag === tag;
            return (
              <TouchableOpacity
                key={tag}
                style={[
                  styles.tagChip,
                  {
                    backgroundColor: selected ? theme.accent + '33' : 'transparent',
                    borderColor: selected ? theme.accent : theme.keyText + '33',
                  },
                ]}
                onPress={() => selectTag(tag)}>
                {tag === RECENT_TAG && (
                  <Icon name="history" size={14} color={selected ? theme.accent : theme.keyText} style={styles.tagIcon} />
                )}
                <Text style={{color: selected ? theme.accent : theme.keyText, fontSize: 12}}>
                  {tag === RECENT_TAG ? 'Recent' : tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {feedback && (
        <View style={[styles.feedbackBanner, {backgroundColor: theme.accent}]}>
          <Text style={styles.feedbackText} numberOfLines={2}>
            {feedback}
          </Text>
        </View>
      )}

      {/*
        Gboard hides the results grid entirely while its keyboard is up for
        typing a query - there just isn't room for both a multi-row grid
        and a full 4-row keyboard under the IME's height cap (55% of
        screen). Rendering both at once was exactly what clipped the
        bottom rows of the keyboard off-screen.
      */}
      {isTyping ? null : previewItem?.videoUrl ? (
        // One player at a time, only while previewing: autoplaying every
        // tile spun up a hardware decoder per result and locked the
        // keyboard up (see the play badge comment below).
        <View style={[styles.preview, {height: gridMaxHeight}]}>
          <Image source={{uri: previewItem.previewUrl}} style={styles.previewMedia} resizeMode="contain" />
          {!previewFailed && (
            <Video
              source={{uri: previewItem.videoUrl}}
              style={[styles.previewMedia, !previewReady && styles.hidden]}
              resizeMode="contain"
              repeat
              muted
              // Muted, but the player still requested audio focus by
              // default - which paused whatever music the user had playing
              // the moment a preview opened.
              disableFocus
              onReadyForDisplay={() => setPreviewReady(true)}
              onError={() => setPreviewFailed(true)}
            />
          )}
          {!previewReady && !previewFailed && (
            <Animated.View
              pointerEvents="none"
              style={[styles.previewLoading, {backgroundColor: skeletonColor, opacity: skeletonPulse}]}
            />
          )}
          {previewFailed && (
            <Text style={[styles.previewNote, {color: '#FFFFFF'}]}>Couldn't play this clip - you can still send it</Text>
          )}
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewItem(null)}>
            <Icon name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.previewSend, {backgroundColor: theme.accent}]} onPress={sendPreview}>
            <Icon name="send" size={16} color="#FFFFFF" />
            <Text style={styles.previewSendText}>Send</Text>
          </TouchableOpacity>
        </View>
      ) : selectedTag === RECENT_TAG ? (
        tabRecents.length === 0 ? (
          <Text style={[styles.statusMessage, {color: theme.keyText + '99'}]}>
            Nothing sent from this tab yet. {typeLabel[0].toUpperCase() + typeLabel.slice(1)} you send show up here,
            and work offline.
          </Text>
        ) : (
          <>
            <Text style={[styles.trendingLabel, {color: theme.keyText + '99'}]}>RECENTLY USED · WORKS OFFLINE</Text>
            <FlatList
              data={tabRecents}
              keyExtractor={item => item.id}
              numColumns={3}
              style={[styles.grid, {maxHeight: gridMaxHeight}]}
              renderItem={({item}) => (
                <TouchableOpacity style={styles.cell} onPress={() => resendRecent(item)}>
                  <Image source={{uri: item.previewUri}} style={styles.thumb} resizeMode="cover" />
                </TouchableOpacity>
              )}
            />
          </>
        )
      ) : loading ? (
        // A grid of placeholder tiles the same shape as the real results,
        // rather than a lone spinner - the panel keeps its size, and the
        // results visibly fill in where the skeleton was.
        // Same height as the results grid it stands in for (4 rows, clipped),
        // so the panel doesn't grow when the real results replace it.
        <View style={[styles.grid, styles.skeletonGrid, {height: gridMaxHeight}]}>
          {[0, 1, 2, 3].map(row => (
            <View key={row} style={styles.skeletonRow}>
              {[0, 1, 2].map(col => (
                <Animated.View
                  key={col}
                  style={[styles.skeletonCell, {backgroundColor: skeletonColor, opacity: skeletonPulse}]}
                />
              ))}
            </View>
          ))}
        </View>
      ) : error ? (
        <Text style={[styles.statusMessage, {color: theme.keyText}]}>{error}</Text>
      ) : query.trim() && results.length === 0 ? (
        <Text style={[styles.statusMessage, {color: theme.keyText + '99'}]}>
          No {typeLabel} found for "{query}"
        </Text>
      ) : (
        <>
          {!query.trim() && results.length > 0 && (
            <Text style={[styles.trendingLabel, {color: theme.keyText + '99'}]}>TRENDING</Text>
          )}
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            numColumns={3}
            style={[styles.grid, {maxHeight: gridMaxHeight}]}
            // Keeps offscreen rows from piling up decoded bitmaps as more
            // pages are appended.
            removeClippedSubviews
            // Deliberately no onEndReached: auto-loading on scroll fired
            // before the "Load more" button ever came into view, so the
            // button - the only visible sign that more results exist - was
            // effectively never seen. Paging is the button's job now.
            ListFooterComponent={renderGridFooter()}
            renderItem={({item}) => (
              <TouchableOpacity style={styles.cell} onPress={() => onResultPress(item)}>
                <GifThumb uri={item.previewUrl} pulse={skeletonPulse} skeletonColor={skeletonColor} />
                {/* Video results (18+) show their still frame rather than
                    autoplaying - a grid of ~78 live players spun up ~78
                    hardware decoders at once and locked the keyboard up.
                    Tapping one plays it in the preview (one player at a
                    time). */}
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {isTyping ? (
        <KeyboardLayout
          showSuggestions={false}
          onCommitText={appendToQuery}
          onDeleteBackward={deleteFromQuery}
          onEnter={() => {
            if (query.trim()) runSearch(query);
          }}
        />
      ) : (
        <ExpressionModeBar active={contentType === 'gif' ? 'gif' : 'none'} onDelete={() => deleteFromQuery(1)} />
      )}
    </View>
  );
}

// A results tile that shows a pulsing placeholder until its image has
// actually downloaded - the search request returning only means the URLs
// are known, and each thumbnail can take a while longer to arrive.
function GifThumb({uri, pulse, skeletonColor}: {uri: string; pulse: Animated.Value; skeletonColor: string}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumbSkeleton, {backgroundColor: skeletonColor, opacity: pulse}]}
        />
      )}
      <Image source={{uri}} style={styles.thumb} resizeMode="cover" onLoadEnd={() => setLoaded(true)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  searchBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchBoxContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cursor: {
    width: 2,
    height: 16,
    marginLeft: 2,
  },
  doneButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typeToggleRow: {
    flexGrow: 0,
    marginBottom: 4,
  },
  typeToggleContent: {
    alignItems: 'center',
    paddingRight: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6,
  },
  tagIcon: {
    marginRight: 4,
  },
  // Floats over the grid rather than taking a row of its own: as a row it
  // pushed everything below it down by its height while it showed, which
  // was enough to shove the mode bar past the window's height cap.
  feedbackBanner: {
    position: 'absolute',
    top: 52,
    left: 8,
    right: 8,
    zIndex: 10,
    elevation: 6,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  feedbackText: {
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'center',
  },
  skeletonGrid: {
    overflow: 'hidden',
  },
  skeletonRow: {
    flexDirection: 'row',
  },
  skeletonCell: {
    flex: 1,
    aspectRatio: 2,
    margin: 2,
    borderRadius: 4,
  },
  statusMessage: {
    textAlign: 'center',
    marginVertical: 16,
    paddingHorizontal: 12,
  },
  trendingLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 6,
    paddingBottom: 2,
  },
  // Height is set inline from gridMaxHeight - see PANEL_CHROME_DP.
  grid: {},
  cell: {
    flex: 1,
    // Caps a cell at one column's worth of width. Without this, a final
    // row holding fewer than numColumns items lets flex:1 stretch those
    // items across the whole row - a single leftover GIF rendered
    // full-width, and aspectRatio then made it half as tall again, which
    // pushed the mode bar below the bottom of the keyboard window.
    maxWidth: '33.33%',
    aspectRatio: 2,
    margin: 2,
  },
  gridFooter: {
    // The grid is 3 columns wide, so the footer has to span all of them to
    // sit centred under the results rather than in the first column.
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  gridFooterText: {
    fontSize: 12,
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    gap: 4,
  },
  loadMoreText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  preview: {
    margin: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewMedia: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hidden: {
    opacity: 0,
  },
  previewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  previewNote: {
    position: 'absolute',
    top: 12,
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  previewClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSend: {
    position: 'absolute',
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    gap: 6,
  },
  previewSendText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  thumbSkeleton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 4,
  },
});
