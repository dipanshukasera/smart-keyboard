import React from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {TranslationPanelState} from '../hooks/useTranslationPanel';
import {PanelSheet} from './PanelSheet';

/**
 * The translate sheet: a language-pair row, a live "YOU TYPED" echo of
 * what's been typed (redirected into sourceText - see App.tsx's
 * renderPanel 'translate' case, which still renders the actual embedded
 * keyboard below this), a "TRANSLATION" preview, and an explicit
 * "Replace text with translation" button - matching the "Keyboard Toolbar
 * Explorations" reference. This replaces the previous design, which
 * silently replaced the real field's content on every keystroke; typing
 * here no longer touches the real field at all until this button is
 * pressed.
 */
export function TranslatePanel({state}: {state: TranslationPanelState}) {
  const {theme} = useKeyboardStore();
  const {
    sourceText,
    translatedText,
    cursorVisible,
    loading,
    error,
    sourceLabel,
    targetLabel,
    translateTargetLocale,
    setPicker,
    replaceText,
  } = state;

  return (
    <PanelSheet title="Translate">
      <View style={styles.pillRow}>
        <TouchableOpacity
          style={[styles.pill, {backgroundColor: theme.keyBackground}]}
          onPress={() => setPicker('source')}>
          <Text style={{color: theme.keyText}} numberOfLines={1}>
            {sourceLabel}
          </Text>
        </TouchableOpacity>
        <Icon name="swap-horiz" size={18} color={theme.keyText + '99'} style={styles.pillArrow} />
        <TouchableOpacity
          style={[styles.pill, {backgroundColor: theme.keyBackground}]}
          onPress={() => setPicker('target')}>
          <Text
            style={{
              color: translateTargetLocale ? theme.keyText : theme.accent,
              fontWeight: translateTargetLocale ? '400' : '600',
            }}
            numberOfLines={1}>
            {targetLabel}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, {color: theme.keyText + '99'}]}>YOU TYPED</Text>
      <View style={[styles.box, {backgroundColor: theme.keyBackground}]}>
        {!sourceText && (
          <Text style={{color: theme.keyText + '99'}} numberOfLines={2}>
            Type to translate
          </Text>
        )}
        {!!sourceText && (
          <View style={styles.boxContent}>
            <Text style={{color: theme.keyText, flexShrink: 1}} numberOfLines={4}>
              {sourceText}
            </Text>
            <View style={[styles.cursor, {backgroundColor: theme.keyText, opacity: cursorVisible ? 1 : 0}]} />
          </View>
        )}
      </View>

      <Text style={[styles.sectionLabel, {color: theme.keyText + '99', marginTop: 12}]}>TRANSLATION</Text>
      <View style={[styles.box, styles.translationBox, {borderColor: theme.accent, backgroundColor: theme.keyBackground}]}>
        {loading && <ActivityIndicator color={theme.accent} size="small" />}
        {!loading && !!translatedText && (
          <Text style={{color: theme.keyText}} numberOfLines={4}>
            {translatedText}
          </Text>
        )}
        {!loading && !translatedText && (
          <Text style={{color: theme.keyText + '77'}} numberOfLines={2}>
            {error ?? (translateTargetLocale ? 'Translation will appear here' : 'Pick a target language above')}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.replaceButton, {backgroundColor: theme.accent, opacity: translatedText ? 1 : 0.4}]}
        disabled={!translatedText}
        onPress={replaceText}>
        <Text style={styles.replaceButtonText}>Replace text with translation</Text>
      </TouchableOpacity>
    </PanelSheet>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pill: {
    flexShrink: 1,
    maxWidth: '42%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  pillArrow: {
    marginHorizontal: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  box: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  boxContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cursor: {
    width: 2,
    height: 16,
    marginLeft: 2,
  },
  translationBox: {
    borderWidth: 1,
  },
  replaceButton: {
    marginTop: 16,
    borderRadius: 22,
    paddingVertical: 13,
    alignItems: 'center',
  },
  // Matches the app's existing convention for text on an accent-colored
  // background (see GifStickerPanel's feedbackBanner) rather than a
  // fixed dark color tuned to just one theme's particular accent.
  replaceButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
