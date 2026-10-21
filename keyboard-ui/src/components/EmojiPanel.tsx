import React, {useEffect, useMemo, useRef, useState} from 'react';
import {FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
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
const RECENT_ID = 'recent';

interface Cell {
  emoji: string;
  // Skin-tone (or other) variants, shown on long-press.
  variants?: string[];
}

interface EmojiRow {
  categoryId: string;
  cells: Cell[];
}

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
// that category's first row instead of feeling like a full page change.
// A plain FlatList + getItemLayout is used instead of SectionList: with
// every row's height known upfront, scrollToIndex can compute the target
// offset directly and jump there in one frame, rather than needing the
// list to have already measured everything up to that point (which
// SectionList's equivalent scrollToLocation doesn't do reliably for a
// section far from the current scroll position).
function buildRows(categories: {id: string; cells: Cell[]}[]) {
  const rows: EmojiRow[] = [];
  const startIndex: Record<string, number> = {};
  for (const category of categories) {
    startIndex[category.id] = rows.length;
    for (const cells of chunk(category.cells, EMOJIS_PER_ROW)) rows.push({categoryId: category.id, cells});
  }
  return {rows, startIndex};
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
    const list: {id: string; icon: string; cells: Cell[]}[] = EMOJI_CATEGORIES.map(category => ({
      id: category.id,
      icon: category.icon,
      cells: buildCells(category, supported),
    })).filter(category => category.cells.length > 0);
    // Recents the phone can draw (one saved before an OS downgrade, or
    // from another keyboard's data, might not be).
    const recentCells = recent.filter(emoji => supported.has(emoji)).map(emoji => ({emoji}));
    return recentCells.length > 0 ? [{id: RECENT_ID, icon: 'history', cells: recentCells}, ...list] : list;
  }, [supported, recent]);
  const {rows, startIndex} = useMemo(() => buildRows(categories), [categories]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const currentCategoryId = activeCategoryId ?? categories[0]?.id;
  const listRef = useRef<FlatList<EmojiRow>>(null);
  // The emoji whose variants are showing, if any.
  const [variantsOf, setVariantsOf] = useState<Cell | null>(null);

  const jumpToCategory = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    setVariantsOf(null);
    listRef.current?.scrollToIndex({index: startIndex[categoryId], animated: true});
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
              category.id === currentCategoryId && {backgroundColor: theme.accent + '33'},
            ]}
            onPress={() => jumpToCategory(category.id)}>
            <Icon
              name={category.icon}
              size={18}
              color={category.id === currentCategoryId ? theme.accent : theme.keyText}
            />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.gridArea}>
        <FlatList
          ref={listRef}
          style={styles.grid}
          data={rows}
          keyExtractor={(row, index) => `${row.categoryId}-${index}`}
          getItemLayout={(_data, index) => ({length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index})}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          onScrollBeginDrag={() => setVariantsOf(null)}
          renderItem={({item: row}) => (
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
          )}
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
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridArea: {
    flex: 1,
  },
  grid: {
    flex: 1,
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
