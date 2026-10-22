import React, {useEffect, useRef, useState} from 'react';
import {
  DeviceEventEmitter,
  Image,
  LayoutChangeEvent,
  NativeModules,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore, ToolId, DIM_LEVELS} from './store';
import {KeyboardLayout} from './components/KeyboardLayout';
import {EmojiPanel} from './components/EmojiPanel';
import {GifStickerPanel} from './components/GifStickerPanel';
import {SymbolsNumberPanel} from './components/SymbolsNumberPanel';
import {LanguagePackPanel} from './components/LanguagePackPanel';
import {TranslatePanel} from './components/TranslatePanel';
import {LanguagePickerModal} from './components/LanguagePickerModal';
import {ThemeCustomizer} from './components/ThemeCustomizer';
import {ClipboardPanel} from './components/ClipboardPanel';
import {LearnedWordsPanel} from './components/LearnedWordsPanel';
import {NumericPanel} from './components/NumericPanel';
import {NumberKeypad} from './components/NumberKeypad';
import {AllToolsSheet} from './components/AllToolsSheet';
import {FontPanel} from './components/FontPanel';
import {SettingsPanel} from './components/SettingsPanel';
import {ToolbarOrderPanel} from './components/ToolbarOrderPanel';
import {VoicePanel} from './components/VoicePanel';
import {InputConnection} from './native-bridge/InputConnection';
import {useTranslationPanel} from './hooks/useTranslationPanel';
import {useHindiSuggestion} from './hooks/useHindiSuggestion';
import {prefetchFeed} from './services/gifFeedCache';
import {readLatestCopy} from './services/clipSuggestion';
import {FloatingKeyboard} from './native-bridge/FloatingKeyboard';
import {backgroundFrame} from './themes/imageTheme';
import {BackgroundAdjust} from './components/BackgroundAdjust';
import {BackgroundImage} from './native-bridge/BackgroundImage';

const {ClipboardModule, KeyboardSizeModule} = NativeModules;

export default function App() {
  const {
    activePanel,
    setActivePanel,
    theme,
    hydrate,
    suggestions,
    emojiSuggestion,
    clipSuggestion,
    isNumericField,
    typedWord,
    isToolbarExpanded,
    setToolbarExpanded,
    updateTypedWord,
    addClipboardEntry,
    setSensitiveField,
    setNumericField,
    setLastSuggestion,
    resetTypingSession,
    setShiftActive,
    toolbarOrder,
    keyboardDimLevel,
    cycleKeyboardDim,
  } = useKeyboardStore();
  const lastReportedHeight = useRef(0);
  const [rootSize, setRootSize] = useState({width: 0, height: 0});
  const pendingPhoto = useKeyboardStore(state => state.pendingPhoto);
  // Called unconditionally (Rules of Hooks) - its internal effects
  // self-gate on activePanel === 'translate', so this is a no-op the rest
  // of the time. Holding it here (instead of inside a panel component)
  // lets the header card (rendered above the toolbar) and the embedded
  // keyboard (rendered by renderPanel, below the toolbar) share one copy
  // of the same state instead of each needing their own.
  const translation = useTranslationPanel();
  const hindi = useHindiSuggestion();
  // See KeyboardLayout.tsx's verticalScale comment - the toolbar's own
  // fixed vertical padding contributes to the same landscape overflow, so
  // it needs to shrink there too.
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  useEffect(() => {
    // A head start for the GIF, sticker and (if switched on) 18+ panels:
    // wakes the server if it was asleep and downloads the first previews
    // (see gifFeedCache). Waits for the saved settings, so 18+ is only
    // fetched for someone who turned it on.
    refreshClipSuggestion();
    // Is the keyboard floating (it remembers across sessions)? Native owns
    // that; this and the event below keep the store in step.
    FloatingKeyboard.isFloating().then(on => useKeyboardStore.getState().setFloatingState(on));
    const floatingSubscription = DeviceEventEmitter.addListener('onFloatingChanged', (event: {floating: boolean}) => {
      useKeyboardStore.getState().setFloatingState(!!event?.floating);
    });
    hydrate().then(() => {
      prefetchFeed('/api/gif/trending');
      prefetchFeed('/api/gif/stickers/trending');
      if (useKeyboardStore.getState().adultGifsEnabled) prefetchFeed('/api/gif/adult/trending');
    });
    return () => floatingSubscription.remove();
  }, [hydrate]);

  // The strip under a floating keyboard's keys (its drag handle) takes the
  // theme's colours: the panel colour (a photo theme's base colour) and the
  // key text colour for the grip.
  useEffect(() => {
    const surface = theme.backgroundBase ?? theme.panelBackground;
    const toHex = (color: string, fallback: string) => (/^#[0-9a-fA-F]{6}/.test(color) ? color.slice(0, 7) : fallback);
    FloatingKeyboard.setHandleColors(toHex(surface, '#F3F5F8'), toHex(theme.keyText, '#808080'));
  }, [theme]);

  // Emitted by KeyboardReactView (native) every time focus moves to a
  // different field - not just once at mount - so a password field is
  // detected even when the user switches to it mid-session without the
  // keyboard's own RN surface ever remounting.
  useEffect(() => {
    // The event can fire before this JS has loaded (the first time the
    // keyboard opens after its process starts - a phone field then got
    // QWERTY), so ask for the current field once on mount too.
    InputConnection.getFieldInfo().then(info => {
      if (!info) return;
      setSensitiveField(info.isPasswordField);
      setNumericField(info.isNumericField, info.allowDecimal, info.allowSign);
    });
    const subscription = DeviceEventEmitter.addListener(
      'onInputFieldChanged',
      (event: {isPasswordField: boolean; isNumericField: boolean; allowDecimal: boolean; allowSign: boolean}) => {
        setSensitiveField(!!event?.isPasswordField);
        setNumericField(!!event?.isNumericField, !!event?.allowDecimal, !!event?.allowSign);
        // The keyboard opened (or moved to another field): offer whatever was
        // copied last, unless it was already used or the field is a password.
        refreshClipSuggestion();
        // Every field - including the same app's field after reopening the
        // keyboard - starts with a fresh typing session: no word or
        // suggestions carried over from wherever the keyboard was last.
        resetTypingSession();
        translation.resetSource();
      },
    );
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSensitiveField, setNumericField, resetTypingSession]);

  // The microphone prompt (first voice typing use) opens over the app, which
  // hides the keyboard and resets it to letters. Once it's allowed, go
  // straight back to voice typing - that's what the user was doing.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('onVoiceEvent', (event: {type: string; granted?: boolean}) => {
      if (event.type === 'permission' && event.granted) setActivePanel('voice');
    });
    return () => subscription.remove();
  }, [setActivePanel]);

  // Emitted (ImeService.onUpdateSelection) whenever the cursor arrives at
  // the very start of the field: the user deleted everything, selected all
  // and deleted, or the app cleared the box after sending. Like Gboard,
  // the next letter is then capitalised - and there's no word in progress.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('onCursorAtStart', () => {
      // Replacing the first word in the box (auto-correct, a suggestion
      // chip) deletes it before typing the new one, so the field is empty
      // for a moment - which used to reset the session, losing the undo
      // and capitalising the next word. Only act if it's still empty.
      InputConnection.getCursorPosition()
        .then(pos => {
          if (pos !== 0) return;
          setShiftActive(true);
          resetTypingSession();
        })
        .catch(() => {});
    });
    return () => subscription.remove();
  }, [setShiftActive, resetTypingSession]);

  // Emitted when the keyboard's view actually goes away (leaving the chat/
  // app, not just moving between fields within it - see ImeService's
  // onFinishInputView) - without this, whatever panel was open (GIF,
  // emoji, settings...) is still what shows the next time the keyboard is
  // summoned anywhere else, which reads as "stuck" rather than a keyboard
  // that reset for a new context.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('onKeyboardClosed', () => {
      // Closing the keyboard takes the copied-text chip off the tray; it
      // only comes back for something copied afterwards.
      useKeyboardStore.getState().finishClipSuggestion();
      setActivePanel('keyboard');
      resetTypingSession();
      translation.resetSource();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActivePanel, resetTypingSession]);

  // Gboard's clipboard icon opens a history panel (multiple recent
  // copies), not an instant single paste - capture whatever's on the
  // clipboard right now as we open it, since there's no live clipboard
  // listener (see ClipboardPanel's note on why).
  // Reads the latest copy and offers it as a chip (see gifFeedCache for the
  // same fire-and-forget pattern); the store drops it if already handled.
  const refreshClipSuggestion = () => {
    readLatestCopy().then(clip => useKeyboardStore.getState().offerClipSuggestion(clip));
  };

  // The chip: pastes the copied text and takes the chip off the tray.
  const pasteClip = () => {
    const clip = useKeyboardStore.getState().clipSuggestion;
    if (!clip) return;
    InputConnection.commitText(clip.text);
    useKeyboardStore.getState().finishClipSuggestion();
  };

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
    // Learns the word and shows what usually comes after it - the strip
    // stays up for the next word instead of hiding.
    useKeyboardStore.getState().completeWord(word);
  };

  // Keeps the typed word and adds the emoji after it ("love" -> "love ❤️ "),
  // as Gboard's emoji chip does. Recorded the same way as a word
  // suggestion, so an immediate backspace takes it back off again.
  const applyEmojiSuggestion = (emoji: string) => {
    InputConnection.deleteBackward(typedWord.length);
    const applied = `${typedWord} ${emoji}`;
    InputConnection.commitText(applied + ' ');
    setLastSuggestion({original: typedWord, applied});
    useKeyboardStore.getState().completeWord(typedWord);
    useKeyboardStore.getState().addRecentEmoji(emoji);
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
    // A photo being framed takes over the keyboard until Apply or Cancel,
    // whichever panel the keyboard reset to after the photo picker.
    if (pendingPhoto) {
      const {addCustomTheme, updateCustomTheme, setPendingPhoto} = useKeyboardStore.getState();
      return (
        <BackgroundAdjust
          theme={pendingPhoto.theme}
          onApply={framed => {
            if (pendingPhoto.isNew) addCustomTheme(framed);
            else updateCustomTheme(framed);
            setPendingPhoto(null);
            setActivePanel('themeCustomizer');
          }}
          onCancel={() => {
            // A photo that was just picked and isn't going to be used: its
            // saved copy goes too.
            if (pendingPhoto.isNew && pendingPhoto.theme.backgroundImage) {
              BackgroundImage.remove(pendingPhoto.theme.backgroundImage);
            }
            setPendingPhoto(null);
            setActivePanel('themeCustomizer');
          }}
        />
      );
    }
    switch (activePanel) {
      case 'emoji':
        return <EmojiPanel />;
      // Keyed by type so switching between them remounts with a clean
      // search, tags and results.
      case 'gif':
        return <GifStickerPanel key="gif" contentType="gif" />;
      case 'stickers':
        return <GifStickerPanel key="sticker" contentType="sticker" />;
      case 'adultGifs':
        return <GifStickerPanel key="adult" contentType="adult" />;
      case 'translate':
        return (
          <>
            <TranslatePanel state={translation} />
            {/* The pills + typed/translation sheet render above (this is
                just the redirected-keystrokes keyboard feeding sourceText,
                same slot every other panel's keyboard/content occupies). */}
            <KeyboardLayout
              showSuggestions={false}
              compact
              onCommitText={translation.appendToSource}
              onDeleteBackward={translation.deleteFromSource}
              onEnter={() => translation.appendToSource('\n')}
            />
          </>
        );
      case 'symbols':
        return <SymbolsNumberPanel />;
      case 'themeCustomizer':
        return <ThemeCustomizer />;
      case 'clipboard':
        return <ClipboardPanel />;
      case 'learnedWords':
        return <LearnedWordsPanel />;
      case 'numericPad':
        // A real number field gets the plain pad; the full keypad (+ - * /,
        // %, =) is what the symbols panel's "1234" key opens.
        return isNumericField ? <NumericPanel /> : <NumberKeypad />;
      case 'allTools':
        return <AllToolsSheet onOpenClipboard={openClipboardPanel} />;
      case 'font':
        return <FontPanel />;
      case 'settings':
        return <SettingsPanel />;
      case 'toolbarOrder':
        return <ToolbarOrderPanel />;
      case 'voice':
        return <VoicePanel />;
      case 'languages':
        return <LanguagePackPanel />;
      case 'keyboard':
      default:
        return <KeyboardLayout />;
    }
  };

  // Like Gboard: while there's a live suggestion for the word being typed,
  // the icon row collapses down to one icon (tap to bring the icons back)
  // and the rest of the row shows suggestion chips instead - previously
  // the icons and suggestions occupied separate rows at the same time.
  // The copied-text chip leads the tray whenever nothing is being typed.
  const clipChip = typedWord === '' ? clipSuggestion : null;
  const showSuggestionStrip =
    activePanel === 'keyboard' &&
    !isToolbarExpanded &&
    (suggestions.length > 0 || !!emojiSuggestion || !!hindi.suggestion || !!clipChip);

  // Strip order: English words, then the Hindi (Devanagari) form of the
  // word, then the emoji. While Hinglish is in play the English words drop
  // to two, so all of it fits on one row.
  type Chip = {key: string; kind: 'clip' | 'word' | 'hindi' | 'emoji'; disabled?: boolean};
  const suggestionChips: Chip[] = [
    ...(clipChip ? [{key: clipChip.text, kind: 'clip' as const}] : []),
    ...(hindi.active || clipChip ? suggestions.slice(0, 2) : suggestions).map(word => ({key: word, kind: 'word' as const})),
    ...(hindi.suggestion
      ? [{key: hindi.suggestion.text, kind: 'hindi' as const, disabled: !hindi.suggestion.fresh}]
      : []),
    ...(emojiSuggestion ? [{key: emojiSuggestion, kind: 'emoji' as const}] : []),
  ];

  // The tool icons show on the letter keyboard and on ?123, which share a
  // toolbar like Gboard's (so switching between them doesn't resize the
  // window). Every other panel has no toolbar row at all: there used to be
  // a lone "back to keyboard" icon here, but each of them now has its own
  // way back - the ABC key (GIF, emoji, ?123) or a close button (clipboard,
  // learned words, settings and the other sheets). A numeric field's
  // number pad gets no toolbar either - it's single-purpose, and Gboard
  // shows no icon row there.
  const showsToolbarRow =
    !pendingPhoto &&
    (activePanel === 'keyboard' || activePanel === 'symbols' || (activePanel === 'numericPad' && !isNumericField));

  // Where a framed photo theme's picture sits behind the keyboard, worked out
  // from the keyboard's current size (null until it has one, or for a theme
  // that was never framed).
  const photoFrame =
    theme.backgroundZoom != null && theme.backgroundAspect && rootSize.width > 0 && rootSize.height > 0
      ? backgroundFrame(
          rootSize.width,
          rootSize.height,
          theme.backgroundAspect,
          theme.backgroundZoom,
          theme.backgroundOffsetX ?? 0,
          theme.backgroundOffsetY ?? 0,
        )
      : null;

  return (
    <View
      style={[styles.root, {backgroundColor: theme.backgroundBase ?? theme.panelBackground}]}
      onLayout={event => setRootSize(event.nativeEvent.layout)}>
      {/* A photo theme's picture behind everything (themes/imageTheme.ts),
          with a light or dark wash so keys and text stay readable. The
          whole photo is shown, scaled to fit whatever height and width
          the current panel has; a blurred, zoomed copy of it fills the
          space either side, so there are no empty bars and nothing is
          cropped or stretched. */}
      {theme.backgroundImage && (
        <>
          <Image
            source={{uri: theme.backgroundImage}}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            resizeMethod="resize"
            blurRadius={18}
            fadeDuration={0}
          />
          {photoFrame ? (
            <Image
              source={{uri: theme.backgroundImage}}
              style={{position: 'absolute', ...photoFrame}}
              fadeDuration={0}
            />
          ) : (
            // Photo themes made before framing existed: the whole photo, fitted.
            <Image source={{uri: theme.backgroundImage}} style={StyleSheet.absoluteFill} resizeMode="contain" fadeDuration={0} />
          )}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, {backgroundColor: theme.backgroundScrim}]} />
        </>
      )}
      <View onLayout={handleContentLayout}>
        {showsToolbarRow && (
        <View style={[styles.toolbar, isLandscape && styles.toolbarLandscape]}>
          {showSuggestionStrip ? (
            <>
              <ToolbarIcon
                iconName="more-vert"
                onPress={() => setToolbarExpanded(true)}
                theme={theme}
                compact={isLandscape}
              />
              {/* A thin divider between neighbouring chips, as in Gboard's
                  strip. A Hindi chip replaces the typed word, like a word
                  suggestion; an emoji chip is added after it. */}
              {suggestionChips.map((chip, index) => (
                <React.Fragment key={`${chip.kind}:${chip.key}`}>
                  {index > 0 && <View style={[styles.suggestionDivider, {backgroundColor: theme.keyText + '33'}]} />}
                  <TouchableOpacity
                    disabled={chip.disabled}
                    onPress={() =>
                      chip.kind === 'clip'
                        ? pasteClip()
                        : chip.kind === 'emoji'
                          ? applyEmojiSuggestion(chip.key)
                          : applySuggestion(chip.key)
                    }
                    style={[styles.suggestionChip, chip.disabled && styles.suggestionChipPending]}>
                    {chip.kind === 'clip' ? (
                      <View style={styles.clipChipInner}>
                        <Icon name="content-paste" size={15} color={theme.accent} />
                        <Text style={{color: theme.keyText, fontSize: 14, flexShrink: 1}} numberOfLines={1}>
                          {chip.key.replace(/\s+/g, ' ')}
                        </Text>
                      </View>
                    ) : (
                      <Text style={{color: theme.keyText, fontSize: chip.kind === 'emoji' ? 20 : chip.kind === 'hindi' ? 16 : 14}} numberOfLines={1}>
                        {chip.key}
                      </Text>
                    )}
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </>
          ) : (
            <>
              {/* Opens All tools - a gear rather than "..." so it reads as
                  where the keyboard's tools and options live. */}
              <ToolbarIcon
                iconName="settings"
                onPress={() => setActivePanel('allTools')}
                theme={theme}
                compact={isLandscape}
              />
              <View style={[styles.divider, {backgroundColor: theme.keyText + '33'}]} />
              {toolbarOrder.map(id => (
                <ToolRow
                  key={id}
                  id={id}
                  theme={theme}
                  compact={isLandscape}
                  dimLevel={keyboardDimLevel}
                  onPress={() => {
                    switch (id) {
                      case 'gif':
                        setActivePanel('gif');
                        return;
                      case 'translate':
                        setActivePanel('translate');
                        return;
                      case 'clipboard':
                        openClipboardPanel();
                        return;
                      case 'themes':
                        setActivePanel('themeCustomizer');
                        return;
                      case 'brightness':
                        cycleKeyboardDim();
                        return;
                      case 'emoji':
                        setActivePanel('emoji');
                        return;
                      case 'voice':
                        setActivePanel('voice');
                        return;
                    }
                  }}
                />
              ))}
            </>
          )}
        </View>
        )}

        {renderPanel()}

        {keyboardDimLevel > 0 && (
          <View
            pointerEvents="none"
            style={[styles.dimOverlay, {opacity: 1 - DIM_LEVELS[keyboardDimLevel]}]}
          />
        )}
      </View>

      {activePanel === 'translate' && <LanguagePickerModal state={translation} />}
    </View>
  );
}

// One toolbar-row entry for a given tool id - "GIF" is a text label
// (mint/accent-colored, matching the reference) rather than an icon like
// every other tool.
function ToolRow({
  id,
  theme,
  compact,
  onPress,
  dimLevel,
}: {
  id: ToolId;
  theme: {keyBackground: string; keyText: string; accent: string};
  compact?: boolean;
  onPress: () => void;
  dimLevel: number;
}) {
  if (id === 'gif') {
    return (
      <ToolbarIcon
        label="GIF"
        onPress={onPress}
        theme={theme}
        textStyle={[styles.gifLabel, {color: theme.accent}]}
        compact={compact}
      />
    );
  }
  const iconName: Record<Exclude<ToolId, 'gif'>, string> = {
    translate: 'translate',
    clipboard: 'content-paste',
    themes: 'contrast',
    brightness: 'wb-sunny',
    emoji: 'mood',
    voice: 'mic',
  };
  // Brightness has no separate "on" screen to reflect its state - the
  // number of dots below the icon says which of the three dim steps is
  // active, so tapping repeatedly reads as a real cycle instead of a
  // button that silently does something each time.
  return (
    <View style={styles.toolWithIndicator}>
      <ToolbarIcon iconName={iconName[id as Exclude<ToolId, 'gif'>]} onPress={onPress} theme={theme} compact={compact} />
      {id === 'brightness' && (
        <View style={styles.dimDots}>
          {DIM_LEVELS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dimDot,
                {backgroundColor: i === dimLevel ? theme.accent : theme.keyText + '44'},
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ToolbarIcon({
  label,
  iconName,
  onPress,
  theme,
  textStyle,
  compact,
}: {
  label?: string;
  iconName?: string;
  onPress: () => void;
  theme: {keyBackground: string; keyText: string};
  textStyle?: object | object[];
  // Landscape's much shorter screen otherwise clips the keyboard's bottom
  // row off-screen (see KeyboardLayout.tsx's verticalScale) - this
  // button's own fixed 36x36 size is part of that same overflow budget.
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.toolbarIcon, compact && styles.toolbarIconCompact, {backgroundColor: theme.keyBackground}]}
      onPress={onPress}>
      {iconName ? (
        <Icon name={iconName} size={compact ? 16 : 20} color={theme.keyText} />
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
    // Fixed rather than content-sized: the icon row (brightness icon + its
    // dim dots underneath, 42dp) is taller than the suggestion strip
    // (plain 36dp chips), so swapping between them on every keystroke
    // resized the whole keyboard window and made it visibly jump.
    height: 54,
  },
  // Landscape's much shorter screen otherwise clips the keyboard's bottom
  // row off-screen (see KeyboardLayout.tsx's verticalScale) - the
  // toolbar's own fixed padding is part of that same overflow budget.
  toolbarLandscape: {
    paddingVertical: 2,
    // Tallest landscape item is the toolbar icons' fixed 36dp buttons.
    height: 40,
  },
  toolbarIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarIconCompact: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  divider: {
    width: 1,
    height: 22,
    marginHorizontal: 2,
  },
  gifLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  toolWithIndicator: {
    alignItems: 'center',
  },
  dimDots: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 3,
  },
  dimDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  suggestionChipPending: {
    opacity: 0.4,
  },
  clipChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  suggestionDivider: {
    width: 1,
    height: 20,
  },
  suggestionChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  // A flat black scrim over the entire keyboard - real dimming, not a
  // decorative icon state. pointerEvents="none" so it never blocks taps
  // on the keys/toolbar underneath.
  dimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
});
