import React from 'react';
import {FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';

// CleverKeys calls this a "learned-data manager": every word the personal
// dictionary has picked up from actual typing (see store's learnWord),
// browsable and individually deletable - not just an opaque on/off switch.
export function LearnedWordsPanel() {
  const {theme, learnedWords, removeLearnedWord} = useKeyboardStore();

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground}]}>
      <View style={styles.header}>
        <Text style={{color: theme.keyText, fontWeight: '600'}}>Learned Words</Text>
        <Text style={{color: theme.keyText + '99', fontSize: 12}}>{learnedWords.length}</Text>
      </View>

      {learnedWords.length === 0 ? (
        <Text style={[styles.empty, {color: theme.keyText + '99'}]}>
          Nothing learned yet - words you type get added here once you finish them.
        </Text>
      ) : (
        <FlatList
          style={styles.list}
          data={learnedWords}
          keyExtractor={item => item}
          renderItem={({item}) => (
            <View style={[styles.row, {backgroundColor: theme.keyBackground}]}>
              <Text style={{color: theme.keyText, flex: 1}} numberOfLines={1}>
                {item}
              </Text>
              <TouchableOpacity style={styles.rowDelete} onPress={() => removeLearnedWord(item)}>
                <Icon name="close" size={16} color={theme.keyText + '99'} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 260,
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  rowDelete: {
    paddingLeft: 10,
  },
});
