import React from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {TranslationPanelState} from '../hooks/useTranslationPanel';

/**
 * The language-pair pills + typed-text box for the translate panel,
 * rendered by App.tsx ABOVE the generic icon toolbar as its own card (see
 * the reference Gboard screenshots) rather than merged into the keyboard's
 * flat background. The picker it opens (LanguagePickerModal) is a separate
 * full-panel overlay, not part of this card.
 */
export function TranslationHeader({state}: {state: TranslationPanelState}) {
  const {theme} = useKeyboardStore();
  const {sourceText, cursorVisible, loading, error, sourceLabel, targetLabel, translateTargetLocale, setPicker} =
    state;

  // A neutral white/black tint over the panel ends up a plain gray in the
  // same family as theme.keyBackground (measured ~15/255 apart on the
  // default dark theme) - close enough that the card just reads as "more
  // keyboard gray" instead of a distinct section, which was the actual
  // "keyboard extended into the translation div" complaint. Tinting with
  // the theme's own accent color instead makes the card unmistakably
  // different from both the panel and the ordinary keys, not just a
  // slightly lighter/darker shade of the same neutral gray.
  const cardTint = theme.accent + '2E';

  // Landscape's much shorter screen otherwise clips the keyboard's bottom
  // row off-screen once this header's own height is added on top of the
  // already-compacted toolbar+keys (see KeyboardLayout.tsx's
  // verticalScale) - this card's vertical padding needs the same
  // treatment.
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: cardTint,
          borderColor: theme.accent + '55',
          paddingTop: isLandscape ? 2 : 8,
          paddingBottom: isLandscape ? 1 : 6,
        },
      ]}>
      <View style={[styles.pillRow, isLandscape && styles.pillRowLandscape]}>
        <TouchableOpacity
          style={[styles.pill, isLandscape && styles.pillLandscape, {backgroundColor: theme.panelBackground}]}
          onPress={() => setPicker('source')}>
          <Text style={{color: theme.keyText}} numberOfLines={1}>
            {sourceLabel}
          </Text>
        </TouchableOpacity>
        <Icon name="arrow-forward" size={16} color={theme.keyText + '99'} style={styles.pillArrow} />
        <TouchableOpacity
          style={[styles.pill, isLandscape && styles.pillLandscape, {backgroundColor: theme.panelBackground}]}
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

      <View
        style={[
          styles.inputBox,
          isLandscape && styles.inputBoxLandscape,
          {backgroundColor: theme.panelBackground, borderColor: theme.accent},
        ]}>
        <View style={styles.inputBoxContent}>
          {!sourceText && (
            <Text style={{color: theme.keyText + '99'}} numberOfLines={1}>
              Type to translate
            </Text>
          )}
          {!!sourceText && (
            <>
              <Text style={{color: theme.keyText}} numberOfLines={1}>
                {sourceText}
              </Text>
              <View style={[styles.cursor, {backgroundColor: theme.keyText, opacity: cursorVisible ? 1 : 0}]} />
            </>
          )}
        </View>
        {loading && <ActivityIndicator color={theme.accent} size="small" />}
      </View>

      {error && (
        <Text style={{color: theme.keyText + '99', fontSize: 12, paddingHorizontal: 4, paddingTop: 4}} numberOfLines={1}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Full-bleed, not a floating inset card: the previous marginHorizontal/
    // marginTop left the plain black panelBackground visible around all
    // four sides, which read as "black behind the card" no matter how
    // distinct the card's own fill color was made. Flush on three sides,
    // with rounding only on the two bottom corners (nothing above it to
    // separate from - it's already the top of the keyboard content - but
    // it needs to visually hand off into the toolbar below it).
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
    // No elevation here deliberately - Android's elevation shadow on a
    // View with a translucent (rgba) backgroundColor draws as a plain
    // rectangle that ignores borderRadius, showing up as a black box
    // poking out from behind the rounded corners. The tint + border
    // alone already give a solid, measured contrast against the panel.
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 6,
  },
  pillRowLandscape: {
    paddingBottom: 0,
  },
  pill: {
    flexShrink: 1,
    maxWidth: '45%',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pillLandscape: {
    paddingVertical: 1,
  },
  pillArrow: {
    marginHorizontal: 8,
  },
  inputBox: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputBoxLandscape: {
    paddingVertical: 1,
  },
  inputBoxContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  cursor: {
    width: 2,
    height: 16,
    marginLeft: 2,
  },
});
