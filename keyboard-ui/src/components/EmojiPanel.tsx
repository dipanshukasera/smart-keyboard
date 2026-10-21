import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {EmojiSupport} from '../native-bridge/EmojiSupport';
import {ExpressionModeBar} from './ExpressionModeBar';
import {EMOJI_CATEGORIES, EmojiCategory, EmojiEntry} from '../data/emojiPacks';

const EMOJIS_PER_ROW = 8;
// Matches the rendered row's height (paddingVertical:8 top+bottom + the
// emoji glyphs' own line height) closely enough for scrollToIndex's
// getItemLayout math - it only needs to be consistent across every row,
// not pixel-exact, since all rows share this same estimate.
const ROW_HEIGHT = 44;
// A category's heading ("Recent", "Smileys & People"...) above its emojis.
const HEADER_HEIGHT = 30;
const RECENT_ID = 'recent';
// A tab jump scrolls with an animation that passes through every category in
// between; the highlight ignores scroll events for this long after one, so
// it lands on the tapped tab instead of flickering through the others.
const JUMP_SETTLE_MS = 700;

// What each category is called, in the list's headings.
const TITLES: Record<string, string> = {
  recent: 'Recent',
  smileys: 'Smileys & People',
  nature: 'Animals & Nature',
  food: 'Food & Drink',
  travel: 'Travel & Places',
  activities: 'Activities',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
};

// The tabs use full-colour emojis rather than flat icons - brighter, and
// they read at a glance. All old enough to draw on any phone.
const TAB_EMOJIS: Record<string, string> = {
  recent: '🕘',
  smileys: '😀',
  nature: '🐻',
  food: '🍔',
  travel: '🌍',
  activities: '⚽',
  objects: '💡',
  symbols: '❤️',
  flags: '🚩',
};

interface Cell {
  emoji: string;
  // Skin-tone (or other) variants, shown on long-press.
  variants?: string[];
}

type ListRow =
  | {kind: 'header'; categoryId: string; title: string}
  | {kind: 'cells'; categoryId: string; cells: Cell[]};

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

const entryEmojis = (entry: EmojiEntry): string[] => (typeof entry === 'string' ? [entry] : entry);

// Which emojis this phone's font can draw, worked out once per app run:
// the list holds everything Unicode defines, and a newer emoji on an
// older Android would show as an empty box.
let supportedPromise: Promise<Set<string>> | null = null;
function supportedEmojis(): Promise<Set<string>> {
  if (!supportedPromise) {
    const all = EMOJI_CATEGORIES.flatMap(category => category.emojis.flatMap(entryEmojis));
    supportedPromise = EmojiSupport.filterSupported(all).then(flags => {
      const supported = new Set<string>();
      all.forEach((emoji, index) => {
        if (flags[index]) supported.add(emoji);
      });
      return supported;
    });
  }
  return supportedPromise;
}

// Every category's cells, minus emojis the phone can't draw (an emoji
// whose base isn't drawable is dropped with its variants; a variant that
// isn't drawable is just left out).
function buildCells(category: EmojiCategory, supported: Set<string>): Cell[] {
  const cells: Cell[] = [];
  for (const entry of category.emojis) {
    const [base, ...variants] = entryEmojis(entry);
    if (!supported.has(base)) continue;
    const usable = variants.filter(variant => supported.has(variant));
    cells.push(usable.length > 0 ? {emoji: base, variants: usable} : {emoji: base});
  }
  return cells;
}

// One flat, continuous list across every category (rather than swapping
// the whole grid's contents per tab) - scrolling moves naturally through
// all emojis in sequence, and a category tab jumps the scroll position to
// that category's heading instead of feeling like a full page change.
// A plain FlatList + getItemLayout is used instead of SectionList: with
// every row's height known upfront, scrollToIndex can compute the target
// offset directly and jump there in one frame, rather than needing the
// list to have already measured everything up to that point (which
// SectionList's equivalent scrollToLocation doesn't do reliably for a
// section far from the current scroll position).
function buildList(categories: {id: string; cells: Cell[]}[]) {
  const rows: ListRow[] = [];
  const offsets: number[] = [];
  const lengths: number[] = [];
  const headerIndex: Record<string, number> = {};
  // Where each category begins, for working out which one is in view.
  const categoryStarts: {id: string; offset: number}[] = [];
  let offset = 0;
  const push = (row: ListRow, length: number) => {
    rows.push(row);
    offsets.push(offset);
    lengths.push(length);
    offset += length;
  };
  for (const category of categories) {
    headerIndex[category.id] = rows.length;
    categoryStarts.push({id: category.id, offset});
    push({kind: 'header', categoryId: category.id, title: TITLES[category.id] ?? category.id}, HEADER_HEIGHT);
    for (const cells of chunk(category.cells, EMOJIS_PER_ROW)) {
      push({kind: 'cells', categoryId: category.id, cells}, ROW_HEIGHT);
    }
  }
  return {rows, offsets, lengths, headerIndex, categoryStarts};
}

export function EmojiPanel() {
  const theme = useKeyboardStore(state => state.theme);
  const addRecentEmoji = useKeyboardStore(state => state.addRecentEmoji);
  // Recently used (up to 16, newest first) as the first section. Taken
  // once when the panel opens, so the row doesn't reshuffle under the
  // finger while the user is tapping emojis from it.
  const [recent] = useState(() => useKeyboardStore.getState().recentEmojis);
  const [supported, setSupported] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    supportedEmojis().then(set => {
      if (!cancelled) setSupported(set);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    if (!supported) return [];
    const byId = new Map<string, Cell[]>();
    for (const category of EMOJI_CATEGORIES) {
      // People & Body joins Smileys as one "Smileys & People" section.
      const id = category.id === 'people' ? 'smileys' : category.id;
      byId.set(id, [...(byId.get(id) ?? []), ...buildCells(category, supported)]);
    }
    const list = [...byId.entries()]
      .map(([id, cells]) => ({id, cells}))
      .filter(category => category.cells.length > 0);
    // Recents the phone can draw (one saved before an OS downgrade, or
    // from another keyboard's data, might not be).
    const recentCells = recent.filter(emoji => supported.has(emoji)).map(emoji => ({emoji}));
    return recentCells.length > 0 ? [{id: RECENT_ID, cells: recentCells}, ...list] : list;
  }, [supported, recent]);
  const {rows, offsets, lengths, headerIndex, categoryStarts} = useMemo(() => buildList(categories), [categories]);

  // The tab that's lit follows the scroll: whichever category is at the top
  // of the list.
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const currentCategoryId = activeCategoryId ?? categories[0]?.id;
  const activeRef = useRef<string | null>(null);
  const lastJumpRef = useRef(0);
  const listRef = useRef<FlatList<ListRow>>(null);
  // The emoji whose variants are showing, if any.
  const [variantsOf, setVariantsOf] = useState<Cell | null>(null);

  const jumpToCategory = (categoryId: string) => {
    lastJumpRef.current = Date.now();
    activeRef.current = categoryId;
    setActiveCategoryId(categoryId);
    setVariantsOf(null);
    listRef.current?.scrollToIndex({index: headerIndex[categoryId], animated: true});
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Date.now() - lastJumpRef.current < JUMP_SETTLE_MS) return;
    // A little past the top edge, so a heading that's just scrolled up
    // counts as the current one.
    const top = event.nativeEvent.contentOffset.y + HEADER_HEIGHT;
    let current = categoryStarts[0]?.id ?? null;
    for (const start of categoryStarts) {
      if (start.offset <= top) current = start.id;
      else break;
    }
    if (current && current !== activeRef.current) {
      activeRef.current = current;
      setActiveCategoryId(current);
    }
  };

  const sendEmoji = (emoji: string) => {
    InputConnection.commitText(emoji);
    addRecentEmoji(emoji);
    setVariantsOf(null);
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      <View style={styles.categoryTabs}>
        {categories.map(category => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryTab,
              category.id === currentCategoryId && {backgroundColor: theme.accent + '44'},
            ]}
            onPress={() => jumpToCategory(category.id)}>
            <Text style={styles.tabEmoji}>{TAB_EMOJIS[category.id] ?? '🙂'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.gridArea}>
        <FlatList
          ref={listRef}
          style={styles.grid}
          data={rows}
          keyExtractor={(row, index) => `${row.categoryId}-${row.kind}-${index}`}
          getItemLayout={(_data, index) => ({length: lengths[index], offset: offsets[index], index})}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          onScroll={onScroll}
          scrollEventThrottle={32}
          onScrollBeginDrag={() => setVariantsOf(null)}
          renderItem={({item: row}) =>
            row.kind === 'header' ? (
              <View style={styles.header}>
                <Text style={[styles.headerText, {color: theme.keyText + 'CC'}]}>{row.title}</Text>
              </View>
            ) : (
              <View style={styles.row}>
                {row.cells.map(cell => (
                  <TouchableOpacity
                    key={cell.emoji}
                    style={styles.cell}
                    onPress={() => sendEmoji(cell.emoji)}
                    onLongPress={cell.variants ? () => setVariantsOf(cell) : undefined}>
                    <Text style={styles.emoji}>{cell.emoji}</Text>
                    {cell.variants && <View style={[styles.variantDot, {backgroundColor: theme.keyText + '55'}]} />}
                  </TouchableOpacity>
                ))}
                {/* Empty cells so a short last row stays on the grid. */}
                {Array.from({length: EMOJIS_PER_ROW - row.cells.length}, (_, i) => (
                  <View key={`pad-${i}`} style={styles.cell} />
                ))}
              </View>
            )
          }
        />

        {/* Skin tones (and other variants) of the emoji that was held. */}
        {variantsOf?.variants && (
          <View style={[styles.variantBar, {backgroundColor: theme.keyBackground, borderColor: theme.keyText + '22'}]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
              {[variantsOf.emoji, ...variantsOf.variants].map(variant => (
                <TouchableOpacity key={variant} style={styles.variantCell} onPress={() => sendEmoji(variant)}>
                  <Text style={styles.emoji}>{variant}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.variantClose} onPress={() => setVariantsOf(null)}>
              <Icon name="close" size={18} color={theme.keyText} />
            </TouchableOpacity>
          </View>
        )}
      </View>
      <ExpressionModeBar active="emoji" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 300,
    padding: 4,
  },
  categoryTabs: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#00000014',
  },
  categoryTab: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabEmoji: {
    fontSize: 20,
  },
  gridArea: {
    flex: 1,
  },
  grid: {
    flex: 1,
  },
  header: {
    height: HEADER_HEIGHT,
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 24,
  },
  // A tiny corner mark on emojis that have variants (hold for them).
  variantDot: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  variantBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    elevation: 6,
  },
  variantCell: {
    width: 46,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantClose: {
    width: 36,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
