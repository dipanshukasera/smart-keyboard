import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
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
import {apiClient} from '../services/api';
import {KeyboardLayout} from './KeyboardLayout';
import {ExpressionModeBar} from './ExpressionModeBar';
import {GifCommit} from '../native-bridge/GifCommit';

interface GifResult {
  id: string;
  previewUrl: string;
  fullUrl: string;
}

type ContentType = 'gif' | 'sticker';

const {ClipboardModule} = NativeModules;

export function GifStickerPanel() {
  const {theme, recentGifs, addRecentGif} = useKeyboardStore();
  // Gboard's GIF panel has a GIFs/Stickers toggle at the top rather than
  // two separate toolbar icons - same search box and grid, just pointed at
  // a different backend endpoint (Klipy has a genuinely separate sticker
  // library, not GIFs re-tagged - see gifProviders.js).
  const [contentType, setContentType] = useState<ContentType>('gif');
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
  // Brief confirmation after tapping a GIF - there was previously zero
  // feedback, so a silent clipboard-copy fallback looked identical to the
  // tap doing nothing at all.
  const [feedback, setFeedback] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef('');
  // The search box isn't a real focusable TextInput (see below), so it
  // never got the one visual cue that tells you it's actually the active,
  // typeable field - a blinking caret, shown only while isTyping so it
  // reads the same way a real focused cursor would.
  const [cursorVisible, setCursorVisible] = useState(true);

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

  const trendingEndpoint = contentType === 'sticker' ? '/api/gif/stickers/trending' : '/api/gif/trending';
  const searchEndpoint = contentType === 'sticker' ? '/api/gif/stickers/search' : '/api/gif/search';
  const typeLabel = contentType === 'sticker' ? 'stickers' : 'GIFs';

  // Gboard never shows a blank panel - it's trending content until you
  // type a query. Re-runs whenever the GIFs/Stickers toggle changes, since
  // that's really just switching to a different backend endpoint.
  useEffect(() => {
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
          const backendMessage = err?.response?.data?.error;
          setError(backendMessage || `Couldn't load trending ${typeLabel}`);
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(query), 350);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, contentType]);

  const runSearch = async (text: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<{results: GifResult[]}>(searchEndpoint, {
        params: {q: text},
      });
      setResults(response.data.results);
      if (response.data.results.length > 0) {
        // Once there's something to look at, get the keys out of the way so
        // the grid has the room - matches Gboard: the keyboard only comes
        // back if the user taps the search box again to refine the query.
        setIsTyping(false);
      }
    } catch (err: any) {
      setResults([]);
      const backendMessage = err?.response?.data?.error;
      setError(backendMessage || `Couldn't reach ${typeLabel} search - check your connection`);
    } finally {
      setLoading(false);
    }
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
    const sent = await GifCommit.commitGif(gif.fullUrl);
    if (sent) {
      showFeedback('Sent!');
    } else {
      ClipboardModule?.setClipboardText(gif.fullUrl);
      showFeedback('This app doesn’t accept images directly - link copied, paste it instead');
    }
    cacheForOffline(gif);
  };

  // "Used" (searched-for and tapped, not merely scrolled past) is the
  // trigger for offline availability - caching every thumbnail just from
  // browsing would download far more than anyone will ever revisit.
  const cacheForOffline = async (gif: GifResult) => {
    const [previewUri, fullUri] = await Promise.all([
      GifCommit.cacheGif(gif.previewUrl),
      GifCommit.cacheGif(gif.fullUrl),
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
          <TouchableOpacity style={styles.doneButton} onPress={() => setIsTyping(false)}>
            <Text style={{color: theme.accent, fontSize: 18}}>{'✓'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isTyping && (
        <View style={styles.typeToggleRow}>
          {(['gif', 'sticker'] as ContentType[]).map(type => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeToggle,
                {backgroundColor: contentType === type ? theme.accent : theme.keyBackground},
              ]}
              onPress={() => switchContentType(type)}>
              <Text style={{color: contentType === type ? '#FFFFFF' : theme.keyText, fontSize: 12, fontWeight: '600'}}>
                {type === 'gif' ? 'GIFs' : 'Stickers'}
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
            style={[styles.grid, {maxHeight: 110}]}
            renderItem={({item}) => (
              <TouchableOpacity style={styles.cell} onPress={() => resendRecent(item)}>
                <Image source={{uri: item.previewUri}} style={styles.thumb} resizeMode="cover" />
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {isTyping ? null : loading ? (
        <ActivityIndicator color={theme.accent} style={styles.loading} />
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
            style={[styles.grid, {maxHeight: 320}]}
            renderItem={({item}) => (
              <TouchableOpacity style={styles.cell} onPress={() => selectGif(item)}>
                <Image source={{uri: item.previewUrl}} style={styles.thumb} resizeMode="cover" />
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
  loading: {
    marginVertical: 12,
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
    maxHeight: 150,
  },
  cell: {
    flex: 1,
    aspectRatio: 2,
    margin: 2,
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
});
