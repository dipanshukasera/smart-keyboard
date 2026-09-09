import React, {useEffect, useRef} from 'react';
import {
  DeviceEventEmitter,
  LayoutChangeEvent,
  NativeModules,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from './store';
import {KeyboardLayout} from './components/KeyboardLayout';
import {EmojiPanel} from './components/EmojiPanel';
import {GifStickerPanel} from './components/GifStickerPanel';
import {SymbolsNumberPanel} from './components/SymbolsNumberPanel';
import {LanguageSwitcher} from './components/LanguageSwitcher';
import {TranslationBar} from './components/TranslationBar';
import {ThemeCustomizer} from './components/ThemeCustomizer';
import {ClipboardPanel} from './components/ClipboardPanel';
import {LearnedWordsPanel} from './components/LearnedWordsPanel';
import {NumericPanel} from './components/NumericPanel';
import {InputConnection} from './native-bridge/InputConnection';

const {ClipboardModule, KeyboardSizeModule} = NativeModules;

export default function App() {
  const {
    activePanel,
    setActivePanel,
    translationBarVisible,
    setTranslationBarVisible,
    theme,
    hydrate,
    suggestions,
    typedWord,
    isToolbarExpanded,
    setToolbarExpanded,
    updateTypedWord,
    addClipboardEntry,
    setSensitiveField,
    setNumericField,
    setLastSuggestion,
  } = useKeyboardStore();
  const lastReportedHeight = useRef(0);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Emitted by KeyboardReactView (native) every time focus moves to a
  // different field - not just once at mount - so a password field is
  // detected even when the user switches to it mid-session without the
  // keyboard's own RN surface ever remounting.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'onInputFieldChanged',
      (event: {isPasswordField: boolean; isNumericField: boolean; allowDecimal: boolean; allowSign: boolean}) => {
        setSensitiveField(!!event?.isPasswordField);
        setNumericField(!!event?.isNumericField, !!event?.allowDecimal, !!event?.allowSign);
      },
    );
    return () => subscription.remove();
  }, [setSensitiveField, setNumericField]);

  // Emitted when the keyboard's view actually goes away (leaving the chat/
  // app, not just moving between fields within it - see ImeService's
  // onFinishInputView) - without this, whatever panel was open (GIF,
  // emoji, settings...) is still what shows the next time the keyboard is
  // summoned anywhere else, which reads as "stuck" rather than a keyboard
  // that reset for a new context.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('onKeyboardClosed', () => {
      setActivePanel('keyboard');
    });
    return () => subscription.remove();
  }, [setActivePanel]);

  // Gboard's clipboard icon opens a history panel (multiple recent
  // copies), not an instant single paste - capture whatever's on the
  // clipboard right now as we open it, since there's no live clipboard
  // listener (see ClipboardPanel's note on why).
  const openClipboardPanel = async () => {
    const text: string = (await ClipboardModule?.getClipboardText?.()) ?? '';
    if (text) {
      addClipboardEntry(text);
    }
    setActivePanel('clipboard');
  };

  // Only ever populated while actively typing on the main keyboard (see
  // KeyboardLayout's showSuggestions guard), so it's safe to act on the
  // real InputConnection directly here without any redirect plumbing.
  const applySuggestion = (word: string) => {
    InputConnection.deleteBackward(typedWord.length);
    InputConnection.commitText(word + ' ');
    // Lets an immediate next backspace revert this exact substitution -
    // see KeyboardLayout's maybeUndoSuggestion.
    setLastSuggestion({original: typedWord, applied: word});
    updateTypedWord('');
  };

  // The outer root View is forced to a fixed native height (see
  // KeyboardReactView.java's onMeasure override) so it doesn't balloon to
  // fill the whole screen. This inner wrapper isn't stretched to match, so
  // its onLayout reports the *actual* content height for whatever's
  // currently showing (main keys vs. symbols vs. GIF search-typing all
  // differ) - reported back so native can resize the window to fit it.
  const handleContentLayout = (e: LayoutChangeEvent) => {
    const height = Math.ceil(e.nativeEvent.layout.height);
    if (Math.abs(height - lastReportedHeight.current) > 1) {
      lastReportedHeight.current = height;
      KeyboardSizeModule?.reportContentHeight?.(height);
    }
  };

  const renderPanel = () => {
    switch (activePanel) {
      case 'emoji':
        return <EmojiPanel />;
      case 'gif':
        return <GifStickerPanel />;
      case 'symbols':
        return <SymbolsNumberPanel />;
      case 'themeCustomizer':
        return <ThemeCustomizer />;
      case 'clipboard':
        return <ClipboardPanel />;
      case 'learnedWords':
        return <LearnedWordsPanel />;
      case 'numericPad':
        return <NumericPanel />;
      case 'keyboard':
      default:
        return <KeyboardLayout />;
    }
  };

  // Like Gboard: while there's a live suggestion for the word being typed,
  // the icon row collapses down to one icon (tap to bring the icons back)
  // and the rest of the row shows suggestion chips instead - previously
  // the icons and suggestions occupied separate rows at the same time.
  const showSuggestionStrip = activePanel === 'keyboard' && !isToolbarExpanded && suggestions.length > 0;

  // A payment/PIN/phone-number field gets *only* the number pad - no
  // toolbar, no translation bar. Those are chrome for a general typing
  // surface; a numeric field is single-purpose and Gboard doesn't show
  // its icon row there either.
  const isNumericPad = activePanel === 'numericPad';

  return (
    <View style={[styles.root, {backgroundColor: theme.panelBackground}]}>
      <View onLayout={handleContentLayout}>
        {!isNumericPad && <TranslationBar />}

        {!isNumericPad && (
        <View style={styles.toolbar}>
          {showSuggestionStrip ? (
            <>
              <ToolbarIcon iconName="more-vert" onPress={() => setToolbarExpanded(true)} theme={theme} />
              {suggestions.map(word => (
                <TouchableOpacity key={word} onPress={() => applySuggestion(word)} style={styles.suggestionChip}>
                  <Text style={{color: theme.keyText}} numberOfLines={1}>
                    {word}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              {activePanel === 'keyboard' ? (
                <LanguageSwitcher />
              ) : (
                // Every non-keyboard panel (emoji, GIF, symbols, theme)
                // needs a way back - without this, a panel with no
                // "done"/"ABC" button of its own (emoji, GIF) strands the
                // user with no keyboard visible.
                <ToolbarIcon iconName="keyboard" onPress={() => setActivePanel('keyboard')} theme={theme} />
              )}
              <ToolbarIcon
                label="GIF"
                onPress={() => setActivePanel('gif')}
                theme={theme}
                textStyle={styles.gifLabel}
              />
              <ToolbarIcon iconName="content-paste" onPress={openClipboardPanel} theme={theme} />
              <ToolbarIcon
                iconName="translate"
                onPress={() => setTranslationBarVisible(!translationBarVisible)}
                theme={theme}
              />
              <ToolbarIcon iconName="palette" onPress={() => setActivePanel('themeCustomizer')} theme={theme} />
            </>
          )}
        </View>
        )}

        {renderPanel()}
      </View>
    </View>
  );
}

function ToolbarIcon({
  label,
  iconName,
  onPress,
  theme,
  textStyle,
}: {
  label?: string;
  iconName?: string;
  onPress: () => void;
  theme: {keyBackground: string; keyText: string};
  textStyle?: object;
}) {
  return (
    <TouchableOpacity
      style={[styles.toolbarIcon, {backgroundColor: theme.keyBackground}]}
      onPress={onPress}>
      {iconName ? (
        <Icon name={iconName} size={20} color={theme.keyText} />
      ) : (
        <Text style={[{color: theme.keyText}, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    height: '100%',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  toolbarIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gifLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  suggestionChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
