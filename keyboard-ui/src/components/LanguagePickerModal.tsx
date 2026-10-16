import React from 'react';
import {FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {TranslationPanelState} from '../hooks/useTranslationPanel';

/**
 * Full-panel modal overlay for picking the translate source/target
 * language - rendered as a sibling covering the whole keyboard root
 * (see App.tsx), not nested inside TranslatePanel, so the dimmed
 * backdrop sits over the toolbar and keys too, matching the reference
 * Gboard screenshot rather than just dimming the header card.
 */
export function LanguagePickerModal({state}: {state: TranslationPanelState}) {
  const {theme} = useKeyboardStore();
  const {
    picker,
    setPicker,
    sourceLanguages,
    targetLanguages,
    languagesError,
    translateSourceLocale,
    translateTargetLocale,
    selectSource,
    selectTarget,
  } = state;

  if (!picker) return null;

  return (
    <View style={styles.pickerOverlay}>
      <View style={[styles.pickerCard, {backgroundColor: theme.backgroundBase ?? theme.panelBackground}]}>
        <Text style={[styles.pickerTitle, {color: theme.keyText}]}>
          {picker === 'source' ? 'Translate from' : 'Translate to'}
        </Text>
        {picker === 'source' && (
          <TouchableOpacity style={styles.pickerDetectRow} onPress={() => selectSource(null)}>
            <View style={styles.pickerDetectCheck}>
              {!translateSourceLocale && <Icon name="check" size={18} color={theme.accent} />}
            </View>
            <Text style={[styles.pickerDetectText, {color: theme.accent}]}>Detect language</Text>
            <Icon name="auto-awesome" size={14} color={theme.accent} />
          </TouchableOpacity>
        )}
        <View style={[styles.pickerDivider, {backgroundColor: theme.keyText + '22'}]} />
        {languagesError ? (
          <Text style={{color: theme.keyText, opacity: 0.7, padding: 12}}>{languagesError}</Text>
        ) : (
          <FlatList
            data={picker === 'source' ? sourceLanguages : targetLanguages}
            keyExtractor={item => item.language}
            style={styles.pickerList}
            ListEmptyComponent={
              <Text style={{color: theme.keyText, opacity: 0.7, padding: 12}}>Loading languages…</Text>
            }
            renderItem={({item}) => {
              const active =
                picker === 'source' ? translateSourceLocale === item.language : translateTargetLocale === item.language;
              return (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => (picker === 'source' ? selectSource(item.language) : selectTarget(item.language))}>
                  <View style={styles.pickerDetectCheck}>
                    {active && <Icon name="check" size={18} color={theme.accent} />}
                  </View>
                  <Text style={{color: theme.keyText}}>{item.name}</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
        <TouchableOpacity style={styles.pickerClose} onPress={() => setPicker(null)} hitSlop={8}>
          <Icon name="close" size={20} color={theme.keyText} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  pickerCard: {
    width: '88%',
    maxHeight: '90%',
    borderRadius: 18,
    paddingTop: 14,
    paddingBottom: 6,
    elevation: 8,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    paddingBottom: 8,
  },
  pickerDetectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pickerDetectCheck: {
    width: 22,
    alignItems: 'center',
  },
  pickerDetectText: {
    flex: 1,
    fontWeight: '600',
  },
  pickerDivider: {
    height: 1,
    marginHorizontal: 12,
    marginBottom: 4,
  },
  pickerList: {
    maxHeight: 220,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pickerClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
  },
});
