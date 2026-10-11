import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  NativeModules,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
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
type ContentType = 'gif' | 'sticker' | 'adult';

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

export function GifStickerPanel() {
  const {theme, recentGifs, addRecentGif, adultGifsEnabled, pendingGifTab, setPendingGifTab} = useKeyboardStore();
  // Gboard's GIF panel has a GIFs/Stickers toggle at the top rather than
  // two separate toolbar icons - same search box and grid, just pointed at
  // a different backend endpoint (Klipy has a genuinely separate sticker
  // library, not GIFs re-tagged - see gifProviders.js).
  //
  // pendingGifTab is a one-shot request set by AllToolsSheet's "Stickers"
  // card (see store) so that tool can land straight on the sticker tab
  // instead of always opening to GIFs and making the user switch - cleared
  // immediately so it doesn't stick around and hijack a later plain "GIFs"
  // open.
  const [contentType, setContentType] = useState<ContentType>(pendingGifTab ?? 'gif');
  useEffect(() => {
    if (pendingGifTab) setPendingGifTab(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A keyboard's own window can't summon another system keyboard on top of
  // itself, so there's no real focusable TextInput here - tapping the
  // search box swaps this panel into "typing" mode, reusing the same
  // QWERTY keys below (redirected into this local string via
  // KeyboardLayout's onCommitText/onDeleteBackward) instead of a real
  // InputConnection. This mirrors Gboard: browsing shows the results grid
  // and a slim mode-switch bar; tapping search swaps that bar for the keys.
  const [isTyping, setIsTyping] = useState(false);
  const [query, setQuery] = useState('');
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

  const ENDPOINTS: Record<ContentType, {trending: string | null; search: string; label: string}> = {
    gif: {trending: '/api/gif/trending', search: '/api/gif/search', label: 'GIFs'},
    sticker: {trending: '/api/gif/stickers/trending', search: '/api/gif/stickers/search', label: 'stickers'},
    // No trending for 18+ on purpose: trending is what fills the panel
    // before anyone types, and that has to stay safe. This tab starts
    // empty and only shows what was explicitly searched for.
    adult: {trending: null, search: '/api/gif/adult/search', label: '18+ GIFs'},
  };
  const trendingEndpoint = ENDPOINTS[contentType].trending;
  const searchEndpoint = ENDPOINTS[contentType].search;
  const typeLabel = ENDPOINTS[contentType].label;

  // Turning the setting off while the 18+ tab is open shouldn't leave the
  // user stranded on a tab that no longer exists.
  useEffect(() => {
    if (!adultGifsEnabled && contentType === 'adult') {
      setContentType('gif');
      setResults([]);
      setError(null);
    }
  }, [adultGifsEnabled, contentType]);

  // Gboard never shows a blank panel - it's trending content until you
  // type a query. Re-runs whenever the GIFs/Stickers toggle changes, since
  // that's really just switching to a different backend endpoint.
  useEffect(() => {
    // Tabs with no trending feed (18+) open empty and wait for a query
    // rather than auto-loading anything.
    if (!trendingEndpoint) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get<{results: GifResult[]}>(trendingEndpoint);
        if (!queryRef.current.trim()) {
          // Only apply if the user hasn't since started typing a real
          // search - don't clobber live results with a slow-to-resolve
          // trending fetch.
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
  }, [contentType]);

  // Typing only edits the query - searching is an explicit action (the
  // magnifier key, or the ✓ next to the box). Previously every keystroke
  // fired a debounced request, so a five-letter word meant five searches,
  // each one's results flashing up and being replaced by the next.
  //
  // Emptying the box still clears the grid, so a stale result set doesn't
  // sit under an empty query - that's local state only, no request.
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      setHasMore(false);
      pageRef.current = 1;
    }
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
        if (batch.length > 0) {
          // Once there's something to look at, get the keys out of the way so
          // the grid has the room - matches Gboard: the keyboard only comes
          // back if the user taps the search box again to refine the query.
          setIsTyping(false);
        }
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
        // The status area (and so the error) is hidden while the keys are
        // up, so a failed search launched from typing mode would show
        // nothing at all - the tap just looked ignored. Collapsing the
        // keys is what makes the message visible.
        setIsTyping(false);
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

  const switchContentType = (type: ContentType) => {
    if (type === contentType) return;
    setContentType(type);
    setError(null);
    // The query text carries over (switching tabs mid-search re-runs the
    // same query against the other library, matching Gboard) - only the
    // results themselves need clearing so the old type's grid doesn't
    // flash before the new fetch resolves.
    setResults([]);
  };

  const showFeedback = (message: string) => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    setFeedback(message);
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 1800);
  };

  const selectGif = async (gif: GifResult) => {
    // Try to actually send the GIF into the focused field (this is how
    // Instagram DMs, WhatsApp, Telegram, etc. actually receive a GIF - a
    // pasted URL isn't a GIF as far as they're concerned). Only falls back
    // to the clipboard when the field itself doesn't declare support for
    // rich content, or the download/commit fails for some other reason.
    // 18+ items are mp4 (Redgifs has no GIF), and far fewer fields accept
    // video than images. So: the mp4 where it's taken, else a real .gif
    // converted from it on the backend, else the still frame, and only
    // then a pasted link.
    let sentUrl: string | null = null;
    if (gif.videoUrl) {
      if (await GifCommit.commitGif(gif.videoUrl)) {
        sentUrl = gif.videoUrl;
      } else if (await GifCommit.isRichContentSupported()) {
        // Conversion takes several seconds (see gifConverter.js), so say
        // something is happening rather than looking like a dead tap.
        // Only shown when the field takes GIFs - otherwise commitGif
        // declines before requesting a conversion at all.
        showFeedback('Making GIF…');
        const gifUrl = convertedGifUrl(gif.videoUrl);
        if (await GifCommit.commitGif(gifUrl)) {
          sentUrl = gifUrl;
        }
      }
    }
    if (!sentUrl && (await GifCommit.commitGif(gif.fullUrl))) {
      sentUrl = gif.fullUrl;
    }
    if (sentUrl) {
      showFeedback('Sent!');
    } else {
      ClipboardModule?.setClipboardText(gif.videoUrl || gif.fullUrl);
      showFeedback('This app doesn’t accept images directly - link copied, paste it instead');
    }
    // A converted GIF is already sitting in the native download cache, so
    // the recents entry can be the animation rather than the still frame.
    cacheForOffline(gif, sentUrl && sentUrl !== gif.videoUrl ? sentUrl : gif.fullUrl);
  };

  // "Used" (searched-for and tapped, not merely scrolled past) is the
  // trigger for offline availability - caching every thumbnail just from
  // browsing would download far more than anyone will ever revisit.
  const cacheForOffline = async (gif: GifResult, fullUrl: string) => {
    const [previewUri, fullUri] = await Promise.all([
      GifCommit.cacheGif(gif.previewUrl),
      GifCommit.cacheGif(fullUrl),
    ]);
    if (previewUri && fullUri) {
      addRecentGif({id: gif.id, previewUri, fullUri, timestamp: Date.now()});
    }
  };

  const resendRecent = async (entry: {id: string; previewUri: string; fullUri: string}) => {
    const sent = await GifCommit.commitGif(entry.fullUri);
    if (sent) {
      showFeedback('Sent!');
    } else {
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
                Search GIFs & stickers
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
        <View style={styles.typeToggleRow}>
          {/* The 18+ tab only exists once the user has opted in via
              settings - see adultGifsEnabled in the store. */}
          {(['gif', 'sticker', ...(adultGifsEnabled ? (['adult'] as const) : [])] as ContentType[]).map(type => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeToggle,
                {backgroundColor: contentType === type ? theme.accent : theme.keyBackground},
              ]}
              onPress={() => switchContentType(type)}>
              <Text style={{color: contentType === type ? '#FFFFFF' : theme.keyText, fontSize: 12, fontWeight: '600'}}>
                {type === 'gif' ? 'GIFs' : type === 'sticker' ? 'Stickers' : '18+'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
      {!isTyping && !query.trim() && recentGifs.length > 0 && (
        <>
          <Text style={[styles.trendingLabel, {color: theme.keyText + '99'}]}>RECENTLY USED · WORKS OFFLINE</Text>
          <FlatList
            data={recentGifs}
            keyExtractor={item => item.id}
            numColumns={3}
            style={[styles.grid, styles.recentsGrid]}
            renderItem={({item}) => (
              <TouchableOpacity style={styles.cell} onPress={() => resendRecent(item)}>
                <Image source={{uri: item.previewUri}} style={styles.thumb} resizeMode="cover" />
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {isTyping ? null : loading ? (
        // A grid of placeholder tiles the same shape as the real results,
        // rather than a lone spinner - the panel keeps its size, and the
        // results visibly fill in where the skeleton was.
        <View style={[styles.grid, styles.resultsGrid]}>
          {[0, 1, 2].map(row => (
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
            style={[styles.grid, styles.resultsGrid]}
            // Keeps offscreen rows from piling up decoded bitmaps as more
            // pages are appended.
            removeClippedSubviews
            // Deliberately no onEndReached: auto-loading on scroll fired
            // before the "Load more" button ever came into view, so the
            // button - the only visible sign that more results exist - was
            // effectively never seen. Paging is the button's job now.
            ListFooterComponent={renderGridFooter()}
            renderItem={({item}) => (
              <TouchableOpacity style={styles.cell} onPress={() => selectGif(item)}>
                <GifThumb uri={item.previewUrl} pulse={skeletonPulse} skeletonColor={skeletonColor} />
                {/* Video results (18+) render as their still frame with a
                    play badge rather than autoplaying. A grid of ~78 live
                    players spun up ~78 hardware decoders at once, which
                    locked the keyboard up; the badge is what tells the
                    user the tile is a video rather than a still. */}
                {!!item.videoUrl && (
                  <View style={styles.playBadge} pointerEvents="none">
                    <Icon name="play-circle-filled" size={22} color="#FFFFFF" />
                  </View>
                )}
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
          onEnter={() => runSearch(query)}
        />
      ) : (
        <ExpressionModeBar active="gif" onDelete={() => deleteFromQuery(1)} />
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
    flexDirection: 'row',
    marginBottom: 4,
  },
  typeToggle: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginRight: 8,
  },
  feedbackBanner: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  feedbackText: {
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'center',
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
  grid: {
    // Height comes from the two variants below - the panel's total height
    // is measured by App.tsx's onLayout and then clamped natively to 55%
    // of the screen (MAX_HEIGHT_FRACTION in KeyboardReactView), so a grid
    // tall enough to push the total past that cap gets its tail - and the
    // mode bar underneath it - clipped off the bottom of the window.
  },
  recentsGrid: {
    maxHeight: 110,
  },
  // ~490dp of window at the 55% cap, minus roughly 210dp of chrome
  // (toolbar, search box, tab row, mode bar, padding), leaves under 282dp
  // for the grid. 260 keeps a little slack for the TRENDING label and the
  // inline error row.
  resultsGrid: {
    maxHeight: 260,
  },
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
  // Bottom-left rather than centred: a centred badge sits right on the
  // subject of the thumbnail, and the corner keeps it readable against
  // both light and dark frames thanks to the scrim behind it.
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
  playBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
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
