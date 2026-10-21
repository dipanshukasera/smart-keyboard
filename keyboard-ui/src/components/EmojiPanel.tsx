import React, {useMemo, useRef, useState} from 'react';
import {FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {ExpressionModeBar} from './ExpressionModeBar';
import {EMOJI_CATEGORIES} from '../data/emojiPacks';

const EMOJIS_PER_ROW = 8;
// Matches the rendered row's height (paddingVertical:8 top+bottom + the
// emoji glyphs' own line height) closely enough for scrollToIndex's
// getItemLayout math - it only needs to be consistent across every row,
// not pixel-exact, since all rows share this same estimate.
const ROW_HEIGHT = 44;

interface EmojiRow {
  categoryId: string;
  emojis: string[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
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
const RECENT_ID = 'recent';

interface Category {
  id: string;
  icon: string;
  emojis: string[];
}

// Every row of every category, in order, plus where each category starts.
function buildRows(categories: Category[]) {
  const rows: EmojiRow[] = [];
  const startIndex: Record<string, number> = {};
  for (const category of categories) {
    startIndex[category.id] = rows.length;
    for (const emojis of chunk(category.emojis, EMOJIS_PER_ROW)) rows.push({categoryId: category.id, emojis});
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
  const categories: Category[] = useMemo(
    () => (recent.length > 0 ? [{id: RECENT_ID, icon: 'history', emojis: recent}, ...EMOJI_CATEGORIES] : EMOJI_CATEGORIES),
    [recent],
  );
  const {rows, startIndex} = useMemo(() => buildRows(categories), [categories]);
  const [activeCategoryId, setActiveCategoryId] = useState(categories[0].id);
  const listRef = useRef<FlatList<EmojiRow>>(null);

  const jumpToCategory = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    listRef.current?.scrollToIndex({index: startIndex[categoryId], animated: true});
  };

  const sendEmoji = (emoji: string) => {
    InputConnection.commitText(emoji);
    addRecentEmoji(emoji);
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      <View style={styles.categoryTabs}>
        {categories.map(category => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryTab,
              category.id === activeCategoryId && {backgroundColor: theme.accent + '33'},
            ]}
            onPress={() => jumpToCategory(category.id)}>
            <Icon
              name={category.icon}
              size={18}
              color={category.id === activeCategoryId ? theme.accent : theme.keyText}
            />
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        ref={listRef}
        style={styles.grid}
        data={rows}
        keyExtractor={(row, index) => `${row.categoryId}-${index}`}
        getItemLayout={(_data, index) => ({length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index})}
        renderItem={({item: row}) => (
          <View style={styles.row}>
            {row.emojis.map(emoji => (
              <TouchableOpacity key={emoji} style={styles.cell} onPress={() => sendEmoji(emoji)}>
                <Text style={styles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
            {/* Empty cells so a short last row stays on the grid. */}
            {Array.from({length: EMOJIS_PER_ROW - row.emojis.length}, (_, i) => (
              <View key={`pad-${i}`} style={styles.cell} />
            ))}
          </View>
        )}
      />
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
});
