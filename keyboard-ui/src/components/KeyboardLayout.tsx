import React, {useEffect, useRef, useState} from 'react';
import {
  DeviceEventEmitter,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {InputConnection, ImeAction} from '../native-bridge/InputConnection';
import {KeySound} from '../native-bridge/SoundModule';
import {ImeSwitcher} from '../native-bridge/ImeSwitcher';
import type {KeyDef, LayoutDef} from '../layouts/types';
import {buildStyledLayout} from '../layouts/layoutStyles';
import {HoldRepeatKeyView, HoldRepeatPressEndEvent, HoldRepeatDragMoveEvent} from './HoldRepeatKeyView';
import {useKeyPreview} from '../hooks/useKeyPreview';

// A full row of digit keys shown above the top letter row when the
// "Number row" setting is on - distinct from NUMBER_HINTS below (the
// existing per-key long-press hint), which stays available regardless.
const NUMBER_ROW_DIGITS = '1234567890'.split('');

import enUS from '../layouts/en-US.json';
import hiIN from '../layouts/hi-IN.json';
import esES from '../layouts/es-ES.json';

const LAYOUTS: Record<string, LayoutDef> = {
  'en-US': enUS as LayoutDef,
  'hi-IN': hiIN as LayoutDef,
  'es-ES': esES as LayoutDef,
};

// Gboard shows 1-2-3...0 above the top letter row regardless of language,
// and keeps the ?123/ABC pill a fixed dark gray in both its light and dark
// themes - these aren't derived from the user's chosen KeyboardTheme.
const NUMBER_HINTS = '1234567890';
const DOUBLE_SPACE_PERIOD_WINDOW_MS = 300;
// Auto-capitalization: like Gboard, shift auto-activates for the very next
// letter at the start of a fresh field and after a sentence-ending
// punctuation mark is followed by a space (or Enter, which always starts a
// new line/context) - commitChar's existing single-shot un-shift (typing
// one letter turns shift back off) already handles the rest.
const SENTENCE_END_CHARS = new Set(['.', '!', '?']);
const LONG_PRESS_NUMBER_DELAY_MS = 350;
// Cursor & Text Control tuning: how far (in dp) a drag has to travel
// before backspace switches from hold-to-repeat into select-and-delete, and
// before the spacebar starts moving the cursor instead of registering a
// tap - and how many dp of further drag equal one more character.
//
// Deliberately generous: a finger held still for a repeat-delete or a
// long-press is never perfectly stationary (natural tremor alone easily
// covers 12-15dp over a 1-2s hold) - too small a threshold here meant
// ordinary holding silently flipped into drag mode and killed the repeat
// before it ever got going. An intentional drag-to-select gesture covers
// this distance immediately, so raising it doesn't hurt that gesture.
const DRAG_MODE_THRESHOLD_PX = 30;
const PIXELS_PER_CHAR = 18;
// How long to hold before backspace starts repeating, and how often once
// it does - timed natively (HoldRepeatKeyView.java), not via a JS timer,
// since a held key's PanResponder move-event stream starves setInterval.
const HOLD_REPEAT_INITIAL_DELAY_MS = 400;
const HOLD_REPEAT_INTERVAL_MS = 60;
export const PILL_BACKGROUND = '#5F6368';
export const PILL_TEXT = '#FFFFFF';

// Gboard swaps the enter key's icon to match what the focused field
// actually asked for (a search box gets a magnifying glass, not a plain
// arrow) - see InputConnectionBridge.getImeAction / performEditorAction.
export const ENTER_ICON_BY_ACTION: Record<ImeAction, string> = {
  search: 'search',
  send: 'send',
  go: 'arrow-forward',
  done: 'done',
  next: 'arrow-forward',
  unspecified: 'keyboard-return',
};

interface KeyboardLayoutProps {
  // A keyboard's own window can't pop up another system keyboard on top of
  // itself, so panels that need text entry (e.g. GifStickerPanel's search
  // box) reuse this component but redirect key presses to a local string
  // instead of the real InputConnection. Omit all three to get normal
  // typing-into-the-focused-field behavior.
  onCommitText?: (text: string) => void;
  onDeleteBackward?: (count: number) => void;
  onEnter?: () => void;
  // False for GifStickerPanel's reused instance - suggestions are about
  // the real focused field's dictionary, meaningless for a search query,
  // and the word tracking lives in the shared store now (see App.tsx's
  // toolbar), which that instance has no business touching.
  showSuggestions?: boolean;
  // Only TranslatePanel's redirected instance needs this: it's the one
  // place this component renders *underneath* another whole screen's
  // worth of content (the language pills + YOU TYPED + TRANSLATION +
  // Replace button) rather than being the only content, so the two
  // together used to exceed KeyboardReactView.java's height clamp and
  // clip the bottom row of keys off entirely. Shrinks vertical padding
  // the same way landscape's verticalScale already does, just less
  // aggressively (there's more room to work with in portrait).
  compact?: boolean;
}

// Gboard renders shift/delete/enter/emoji as icon glyphs rather than words
// or raw emoji characters.
function actionIconName(keyDef: KeyDef, enterIconName: string): string | null {
  switch (keyDef.action) {
    case 'shift':
      return 'keyboard-capslock';
    case 'delete':
      return 'backspace';
    case 'enter':
      return enterIconName;
    case 'emoji':
      return 'mood';
    default:
      return null;
  }
}

export function KeyboardLayout({
  onCommitText,
  onDeleteBackward,
  onEnter,
  showSuggestions = true,
  compact = false,
}: KeyboardLayoutProps = {}) {
  const {
    activeLocale,
    layoutStyle,
    theme,
    isShiftActive,
    toggleShift,
    setShiftActive,
    setActivePanel,
    typedWord,
    updateTypedWord,
    learnWord,
    oneHandedMode,
    setOneHandedMode,
    isSensitiveField,
    lastSuggestion,
    setLastSuggestion,
    keyboardSizeScale,
    numberRowEnabled,
    hapticFeedbackEnabled,
    keySoundEnabled,
    keyFontFamily,
  } = useKeyboardStore();
  const lastSpaceTimeRef = useRef(0);
  // Auto-capitalization, mid-sentence case: set by commitChar whenever the
  // most recently typed character was a sentence-ender (. ! ?), consumed
  // the moment the following space arrives (see the space handler below).
  const pendingSentenceEndRef = useRef(false);
  // A redirected onEnter is only ever GifStickerPanel's search query today,
  // so default straight to the search icon there instead of the generic
  // arrow - the adaptive fetch below only runs for the real field anyway.
  const [enterIcon, setEnterIcon] = useState(onEnter ? 'search' : 'keyboard-return');
  // Live feedback while dragging: how many characters are currently
  // selected-for-deletion (backspace) or how many steps the cursor has
  // moved (spacebar) - 0 means no drag gesture in progress.
  const [dragDeleteCount, setDragDeleteCount] = useState(0);
  // Which key (by "row-col" id) is currently pressed, for a visible
  // highlight while held, plus the Gboard-style preview bubble above it -
  // see useKeyPreview (shared with SymbolsNumberPanel).
  const {pressedKeyId, setPressedKeyId, pressKey, releaseKey, onBodyLayout, trackRowLayout, trackKeyLayout, renderPreview} =
    useKeyPreview();
  // Which top-row key index is currently showing its number in an enlarged
  // popup above the key - Gboard shows this the moment the long-press
  // fires (not just silently swapping in the character), so holding
  // actually looks like it's inserting something rather than appearing to
  // do nothing until you let go.
  const [numberPreviewIndex, setNumberPreviewIndex] = useState<number | null>(null);

  // A row's height is fixed in dp regardless of orientation, but a
  // landscape screen is roughly half as tall as portrait - the same
  // absolute keyboard height that fits comfortably in portrait overflows
  // a landscape window and clips the bottom row (space/enter) off-screen
  // entirely. Gboard (and every other Android keyboard) compensates by
  // rendering visibly shorter rows in landscape - only the *vertical*
  // dimensions shrink here, not font/icon size, so keys get flatter, not
  // smaller-looking.
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const verticalScale = isLandscape ? 0.42 : compact ? 0.78 : 1;

  // Keyboard size setting (see ThemeCustomizer) - scales key padding/font/
  // icon size directly rather than needing any native change: the taller
  // or shorter result flows through App.tsx's existing onLayout ->
  // reportContentHeight -> native onMeasure pipeline automatically.
  const keyPaddingVertical = 10 * keyboardSizeScale * verticalScale;
  const keyFontSize = 15 * keyboardSizeScale;
  const keyIconSize = 20 * keyboardSizeScale;
  const rowMarginVertical = 2 * keyboardSizeScale * verticalScale;

  useEffect(() => {
    // Only meaningful for the real, non-redirected instance - GifStickerPanel's
    // reused instance always overrides onEnter with its own search action.
    if (!onEnter) {
      InputConnection.getImeAction()
        .then(action => setEnterIcon(ENTER_ICON_BY_ACTION[action]))
        .catch(() => {});
    }
  }, [onEnter]);

  // Auto-capitalization, start-of-field case: Gboard capitalizes the very
  // first letter of an empty field automatically. Checked once on mount
  // (covers switching back to this panel after a field was already
  // focused elsewhere) and again on every subsequent field-focus change
  // while this panel stays mounted - not meaningful for a redirected
  // instance (GifStickerPanel's fake search box), which has no real
  // InputConnection field to inspect.
  useEffect(() => {
    if (onCommitText) return;
    const checkEmptyField = () => {
      InputConnection.getCursorPosition()
        .then(pos => setShiftActive(pos === 0))
        .catch(() => {});
    };
    checkEmptyField();
    const subscription = DeviceEventEmitter.addListener('onInputFieldChanged', checkEmptyField);
    return () => subscription.remove();
  }, [onCommitText, setShiftActive]);

  const localeLayout = LAYOUTS[activeLocale] ?? LAYOUTS['en-US'];
  // Layout style (QWERTY/AZERTY/QWERTZ/Dvorak/Colemak) only makes sense for
  // English today - it's a Latin letter-arrangement choice, not a language.
  const layout = activeLocale === 'en-US' ? buildStyledLayout(layoutStyle, localeLayout) : localeLayout;

  // See styles.pressOverlay - a translucent wash that reads as "pressed"
  // regardless of which theme's specific key/pressed-background pair is
  // active, rather than relying on that pair alone being visibly distinct.
  const pressOverlayColor = theme.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';

  const commitText = (text: string) => {
    if (onCommitText) {
      onCommitText(text);
    } else {
      InputConnection.commitText(text);
    }
  };

  const deleteBackward = (count: number) => {
    if (onDeleteBackward) {
      onDeleteBackward(count);
    } else {
      InputConnection.deleteBackward(count);
    }
  };

  // A password field (or incognito) should behave like the suggestion
  // system doesn't exist at all - not merely "not learning from it".
  const effectiveShowSuggestions = showSuggestions && !isSensitiveField;

  const trackWord = (word: string) => {
    if (effectiveShowSuggestions) {
      updateTypedWord(word);
    }
  };

  const commitChar = (char: string) => {
    const output = isShiftActive ? char.toUpperCase() : char;
    commitText(output);
    trackWord(output === ' ' ? '' : typedWord + output);
    if (isShiftActive) {
      toggleShift();
    }
    // Remembers whether this char should trigger auto-cap once the
    // sentence-ending space arrives - see the space/enter handling below.
    pendingSentenceEndRef.current = SENTENCE_END_CHARS.has(char);
    // Any real typing invalidates a pending suggestion-undo - only the
    // *immediate* next backspace after applying a suggestion should revert
    // it.
    if (lastSuggestion) {
      setLastSuggestion(null);
    }
  };

  const deleteOneCharacter = () => {
    deleteBackward(1);
    trackWord(typedWord.slice(0, -1));
  };

  // Gboard: a single backspace tap immediately after tapping a suggestion
  // chip undoes that substitution instead of deleting one character.
  // Consumed at press-time (not release) since the undo is a whole-word
  // action, not a per-character one.
  const maybeUndoSuggestion = (): boolean => {
    if (!lastSuggestion || onDeleteBackward) {
      // Only meaningful for the real field - a redirected instance (GIF
      // search) has no suggestion chips to have applied in the first place.
      return false;
    }
    deleteBackward(lastSuggestion.applied.length + 1); // +1 for the trailing space
    commitText(lastSuggestion.original);
    trackWord(lastSuggestion.original);
    setLastSuggestion(null);
    return true;
  };

  // Adds a word to the shared personal dictionary once it's actually
  // finished (space/enter), so it starts showing up as a suggestion the
  // next time its prefix is typed - previously the dictionary was a fixed
  // list that never grew from what the user actually types.
  const maybeLearnWord = () => {
    if (effectiveShowSuggestions && typedWord.length >= 3) {
      learnWord(typedWord);
    }
  };

  // Shared by every real key-press path (a plain tap, a held-delete repeat
  // tick, and the number-hint long-press) rather than baked into just one
  // of them, so turning either setting on actually covers typing in
  // general, not just a slice of it.
  const fireKeyFeedback = () => {
    if (hapticFeedbackEnabled) Vibration.vibrate(8);
    if (keySoundEnabled) KeySound.playKeyClick();
  };

  const handleKeyPress = (keyDef: KeyDef) => {
    fireKeyFeedback();
    switch (keyDef.action) {
      case 'shift':
        toggleShift();
        return;
      case 'space': {
        const now = Date.now();
        let endsSentence = pendingSentenceEndRef.current;
        if (now - lastSpaceTimeRef.current < DOUBLE_SPACE_PERIOD_WINDOW_MS) {
          // Gboard: two quick taps of space turns "word  " into "word. ".
          deleteBackward(1);
          commitText('. ');
          lastSpaceTimeRef.current = 0;
          endsSentence = true;
        } else {
          commitText(' ');
          lastSpaceTimeRef.current = now;
        }
        // Auto-capitalize the next letter after a sentence-ending space,
        // same as Gboard - see SENTENCE_END_CHARS.
        if (endsSentence) setShiftActive(true);
        pendingSentenceEndRef.current = false;
        maybeLearnWord();
        trackWord('');
        if (lastSuggestion) setLastSuggestion(null);
        return;
      }
      case 'enter':
        // A newline always starts a fresh line/context - Gboard
        // capitalizes the next letter here unconditionally.
        setShiftActive(true);
        pendingSentenceEndRef.current = false;
        maybeLearnWord();
        if (onEnter) {
          onEnter();
        } else {
          InputConnection.sendEnter();
        }
        trackWord('');
        if (lastSuggestion) setLastSuggestion(null);
        return;
      case 'symbols':
        trackWord('');
        setActivePanel('symbols');
        return;
      case 'emoji':
        trackWord('');
        setActivePanel('emoji');
        return;
      default:
        commitChar(keyDef.key);
    }
  };

  // --- Cursor & Text Control -------------------------------------------
  // Both gestures are only wired up against the real InputConnection - a
  // redirected instance (GIF search query) has no real cursor to move or
  // selection to make, so those keys keep their plain tap behavior there.
  const cursorControlEnabled = !onCommitText;

  // The space PanResponder (below) is created once (useRef) so an
  // in-flight gesture's identity is stable, but that means its closures
  // would otherwise freeze the very first render's versions of these
  // values - routing through refs keeps them current across every render
  // instead. (The delete key no longer needs this: HoldRepeatKeyView's
  // handlers are passed fresh as props every render, same as any other
  // React event handler, since it's a real native UI component rather
  // than a manually-managed PanResponder instance.)
  const handleKeyPressRef = useRef(handleKeyPress);
  handleKeyPressRef.current = handleKeyPress;
  const setPressedKeyIdRef = useRef(setPressedKeyId);
  setPressedKeyIdRef.current = setPressedKeyId;
  const releaseKeyRef = useRef(releaseKey);
  releaseKeyRef.current = releaseKey;

  // --- Delete key: native HoldRepeatKeyView handlers --------------------
  // See android-shell/.../HoldRepeatKeyView.java for why hold-to-repeat and
  // drag-to-select both moved to a native touch handler: neither
  // TouchableOpacity+setTimeout nor PanResponder+setInterval turned out to
  // be reliable for this, for two different reasons documented there.
  const deleteDragCursorRef = useRef<number | null>(null);
  const deleteDragCharsRef = useRef(0);
  // Set when a suggestion-undo consumes the press (see maybeUndoSuggestion)
  // so the native repeat ticks that follow the initial one don't also
  // delete characters on top of the undo.
  const deleteSuppressRepeatRef = useRef(false);

  const handleDeletePressStart = () => {
    setPressedKeyId('delete');
    deleteSuppressRepeatRef.current = maybeUndoSuggestion();
    if (deleteSuppressRepeatRef.current) {
      return;
    }
    if (cursorControlEnabled) {
      deleteDragCursorRef.current = null;
      InputConnection.getCursorPosition().then(pos => {
        deleteDragCursorRef.current = pos;
      });
    }
  };

  const handleDeleteRepeatTick = () => {
    if (deleteSuppressRepeatRef.current) return;
    fireKeyFeedback();
    deleteOneCharacter();
  };

  const handleDeleteDragMove = (event: HoldRepeatDragMoveEvent) => {
    if (!cursorControlEnabled) return;
    const cursorPos = deleteDragCursorRef.current;
    if (cursorPos == null) return;
    // Dragging left (negative dx) selects backward from the cursor,
    // matching the direction the backspace key itself deletes in.
    const chars = Math.max(0, Math.min(cursorPos, Math.round(-event.nativeEvent.dx / PIXELS_PER_CHAR)));
    deleteDragCharsRef.current = chars;
    setDragDeleteCount(chars);
    // Best-effort live highlight only - some fields (e.g. Chrome's address
    // bar, which re-anchors selection for its own inline-autocomplete
    // logic) silently fight/undo this. The actual deletion on release
    // below never depends on this having stuck.
    InputConnection.setSelection(cursorPos - chars, cursorPos);
  };

  const handleDeletePressEnd = (event: HoldRepeatPressEndEvent) => {
    setPressedKeyId(null);
    if (event.nativeEvent.dragMode) {
      if (deleteDragCharsRef.current > 0) {
        // deleteBackward (deleteSurroundingText) rather than deleteSelection:
        // it deletes relative to wherever the cursor actually is right now,
        // with no dependency on a selection range set moments earlier
        // surviving untouched - some fields (Chrome's address bar chief
        // among them) reset an externally-set selection almost immediately,
        // which made deleteSelection() silently no-op there.
        InputConnection.deleteBackward(deleteDragCharsRef.current);
        trackWord('');
      }
      setDragDeleteCount(0);
    }
  };

  // --- Number-hint keys (row 0): native HoldRepeatKeyView handlers ------
  const handleNumberHintPressStart = (keyId: string, label: string) => pressKey(keyId, label);

  const handleNumberHintLongPress = (keyIndex: number) => {
    fireKeyFeedback();
    setNumberPreviewIndex(keyIndex);
    commitText(NUMBER_HINTS[keyIndex]);
    trackWord('');
    pendingSentenceEndRef.current = false;
  };

  const handleNumberHintPressEnd = (keyDef: KeyDef, event: HoldRepeatPressEndEvent) => {
    releaseKey();
    setNumberPreviewIndex(null);
    const {longPressFired, movedOutside, dragMode} = event.nativeEvent;
    if (!longPressFired && !movedOutside && !dragMode) {
      handleKeyPressRef.current(keyDef);
    }
  };

  const spaceKeyDef: KeyDef = {key: 'space', action: 'space'};
  const spaceDragModeRef = useRef(false);
  const spaceDragStepsRef = useRef(0);
  // Gboard: holding the spacebar (without dragging - see the cursor-move
  // gesture below, which is a different, intentional use of the same key)
  // opens Android's own keyboard-switcher dialog. Fired from a plain JS
  // timer rather than HoldRepeatKeyView's native one - unlike the delete
  // key, nothing here needs a *repeating* action, and the space key
  // already has its own working gesture handling via this PanResponder,
  // so adding a native view just for this one timer isn't worth it.
  const spaceLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spaceLongPressFiredRef = useRef(false);
  const spacePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        spaceDragModeRef.current = false;
        spaceDragStepsRef.current = 0;
        spaceLongPressFiredRef.current = false;
        setPressedKeyIdRef.current('space');
        spaceLongPressTimerRef.current = setTimeout(() => {
          // A drag already in progress (cursor move) is a different,
          // already-committed gesture - don't also pop the picker over it.
          if (spaceDragModeRef.current) return;
          spaceLongPressFiredRef.current = true;
          fireKeyFeedback();
          setPressedKeyIdRef.current(null);
          ImeSwitcher.showPicker();
        }, LONG_PRESS_NUMBER_DELAY_MS);
      },
      onPanResponderMove: (_evt, gestureState) => {
        // A redirected instance (GIF search) has no real cursor to move -
        // leave drag-mode permanently false so release always falls
        // through to a normal space-bar tap.
        if (!cursorControlEnabled) return;
        if (!spaceDragModeRef.current && Math.abs(gestureState.dx) > DRAG_MODE_THRESHOLD_PX) {
          spaceDragModeRef.current = true;
          // Dragging to move the cursor is unambiguous intent - cancel the
          // pending picker so it can't fire out from under an in-progress
          // drag a moment later.
          if (spaceLongPressTimerRef.current) {
            clearTimeout(spaceLongPressTimerRef.current);
            spaceLongPressTimerRef.current = null;
          }
        }
        if (!spaceDragModeRef.current) return;
        const targetSteps = Math.trunc(gestureState.dx / PIXELS_PER_CHAR);
        const delta = targetSteps - spaceDragStepsRef.current;
        if (delta !== 0) {
          const direction = delta > 0 ? 1 : -1;
          for (let i = 0; i < Math.abs(delta); i++) {
            InputConnection.moveCursor(direction);
          }
          spaceDragStepsRef.current = targetSteps;
        }
      },
      onPanResponderRelease: () => {
        if (spaceLongPressTimerRef.current) {
          clearTimeout(spaceLongPressTimerRef.current);
          spaceLongPressTimerRef.current = null;
        }
        if (!spaceDragModeRef.current && !spaceLongPressFiredRef.current) {
          handleKeyPressRef.current(spaceKeyDef);
        }
        spaceDragModeRef.current = false;
        spaceDragStepsRef.current = 0;
        releaseKeyRef.current();
      },
    }),
  ).current;

  // Only the real keyboard (not GifStickerPanel's redirected reuse) can go
  // one-handed - a search-query mini keyboard has no need for it.
  const isOneHanded = showSuggestions && oneHandedMode !== 'off';

  // Same "real keyboard only" gating as one-handed mode above - a search
  // mini keyboard (GifStickerPanel) has no use for a persistent digit row
  // either. Deliberately a separate, plain row rather than reusing the
  // per-key long-press hint machinery (NUMBER_HINTS/showNumberHint) below:
  // that one stays exactly as it was, this is an addition on top of it.
  const showNumberRow = showSuggestions && numberRowEnabled;

  // While a top-row key's long-press is firing, the bubble shows its
  // number rather than the letter.
  const keyPreview = renderPreview({
    theme,
    scale: keyboardSizeScale,
    fontFamily: keyFontFamily,
    override:
      numberPreviewIndex != null ? {keyId: `0-${numberPreviewIndex}`, label: NUMBER_HINTS[numberPreviewIndex]} : null,
  });

  const keyboardBody = (
    <View
      onLayout={onBodyLayout}
      style={[
        styles.container,
        {backgroundColor: theme.panelBackground, paddingVertical: 4 * verticalScale},
        isOneHanded && styles.oneHandedFlex,
      ]}>
      {showNumberRow && (
        <View style={[styles.row, {marginVertical: rowMarginVertical}]} onLayout={trackRowLayout('numrow')}>
          {NUMBER_ROW_DIGITS.map((digit, index) => (
            <TouchableOpacity
              key={digit}
              style={[
                styles.key,
                {
                  flex: 1,
                  backgroundColor: pressedKeyId === `numrow-${index}` ? theme.keyPressedBackground : theme.keyBackground,
                  paddingVertical: keyPaddingVertical,
                },
              ]}
              activeOpacity={1}
              onLayout={trackKeyLayout(`numrow-${index}`, 'numrow')}
              onPressIn={() => {
                pressKey(`numrow-${index}`, digit);
                handleKeyPress({key: digit});
              }}
              onPressOut={releaseKey}>
              <Text style={{color: theme.keyText, fontSize: keyFontSize, fontFamily: keyFontFamily ?? undefined}}>
                {digit}
              </Text>
              {pressedKeyId === `numrow-${index}` && (
                <View pointerEvents="none" style={[styles.pressOverlay, {backgroundColor: pressOverlayColor}]} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
      {layout.rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[styles.row, {marginVertical: rowMarginVertical}]}
          onLayout={trackRowLayout(String(rowIndex))}>
          {row.map((keyDef, keyIndex) => {
            const keyId = `${rowIndex}-${keyIndex}`;
            const keyLabel = isShiftActive ? keyDef.key.toUpperCase() : keyDef.key;
            const isPressed = pressedKeyId === keyId;
            const isPill = keyDef.action === 'symbols';
            const isAccent = keyDef.action === 'enter';
            const isShiftKey = keyDef.action === 'shift';
            const isDeleteKey = keyDef.action === 'delete';
            const isSpaceKey = keyDef.action === 'space';
            const showNumberHint = rowIndex === 0 && !keyDef.action && keyIndex < NUMBER_HINTS.length;
            const iconName = actionIconName(keyDef, enterIcon);

            // Resting appearance first (pill/accent/shift-active tinting),
            // then let an in-progress press override it on top - previously
            // this was a single if/else-if chain, so the pill (?123/ABC),
            // accent (enter) and shift keys short-circuited before ever
            // reaching the "is this key currently pressed" checks below,
            // and never showed press feedback at all.
            let backgroundColor = theme.keyBackground;
            if (isPill) backgroundColor = PILL_BACKGROUND;
            else if (isAccent) backgroundColor = theme.accent;
            else if (isShiftKey && isShiftActive) backgroundColor = theme.keyPressedBackground;

            const isKeyCurrentlyPressed = isDeleteKey
              ? dragDeleteCount > 0 || pressedKeyId === 'delete'
              : isSpaceKey
                ? pressedKeyId === 'space'
                : isPressed;
            if (isKeyCurrentlyPressed) backgroundColor = theme.keyPressedBackground;

            const textColor = isPill
              ? PILL_TEXT
              : isAccent
                ? '#FFFFFF'
                : isShiftKey && isShiftActive
                  ? theme.accent
                  : theme.keyText;

            const pressOverlay = isKeyCurrentlyPressed ? (
              <View
                pointerEvents="none"
                style={[
                  styles.pressOverlay,
                  isPill && styles.pressOverlayPill,
                  isAccent && styles.pressOverlayAccent,
                  {backgroundColor: pressOverlayColor},
                ]}
              />
            ) : null;

            // Delete: hold-to-repeat and drag-to-select both need reliable
            // native touch timing (see HoldRepeatKeyView.java for why plain
            // PanResponder/TouchableOpacity weren't good enough for this).
            // DRAG_MODE_THRESHOLD_PX is passed straight through as
            // dragThresholdDp: RN's gesture coordinates (what that constant
            // was tuned against, via the space key's PanResponder below) are
            // already in the same dp-equivalent space the native side
            // multiplies by density to get real pixels, so no unit
            // conversion is needed between the two.
            if (isDeleteKey) {
              return (
                <HoldRepeatKeyView
                  key={`${rowIndex}-${keyIndex}`}
                  mode="repeat"
                  longPressDelayMs={HOLD_REPEAT_INITIAL_DELAY_MS}
                  repeatIntervalMs={HOLD_REPEAT_INTERVAL_MS}
                  dragThresholdDp={DRAG_MODE_THRESHOLD_PX}
                  onPressStart={handleDeletePressStart}
                  onRepeatTick={handleDeleteRepeatTick}
                  onDragMove={handleDeleteDragMove}
                  onPressEnd={handleDeletePressEnd}
                  style={[
                    styles.key,
                    {flex: keyDef.width ?? 1, backgroundColor, paddingVertical: keyPaddingVertical},
                  ]}>
                  {dragDeleteCount > 0 ? (
                    <Text style={{color: textColor, fontSize: 13 * keyboardSizeScale, fontWeight: '700'}}>
                      -{dragDeleteCount}
                    </Text>
                  ) : iconName ? (
                    <Icon name={iconName} size={keyIconSize} color={textColor} />
                  ) : null}
                  {pressOverlay}
                </HoldRepeatKeyView>
              );
            }

            // Space's cursor-drag gesture stays on RN's PanResponder - it's
            // not affected by the timer-starvation problem (no repeat timer
            // to starve) or by TouchableOpacity's cancel-on-move heuristic
            // (it was never a TouchableOpacity), so there was no reason to
            // move it to the native view.
            if (isSpaceKey) {
              return (
                <View
                  key={`${rowIndex}-${keyIndex}`}
                  style={[
                    styles.key,
                    {flex: keyDef.width ?? 1, backgroundColor, paddingVertical: keyPaddingVertical},
                  ]}
                  {...spacePanResponder.panHandlers}>
                  {iconName ? <Icon name={iconName} size={keyIconSize} color={textColor} /> : null}
                  {pressOverlay}
                </View>
              );
            }

            // Gboard: holding a top-row letter key types its number hint
            // instead - a short tap still types the letter as normal. Same
            // native-timing reasoning as the delete key applies here (a
            // held finger's tremor could cancel a JS setTimeout-driven
            // TouchableOpacity long-press before it ever fires).
            if (showNumberHint) {
              return (
                <HoldRepeatKeyView
                  key={`${rowIndex}-${keyIndex}`}
                  mode="longPressOnce"
                  longPressDelayMs={LONG_PRESS_NUMBER_DELAY_MS}
                  onPressStart={() => handleNumberHintPressStart(keyId, keyLabel)}
                  onLayout={trackKeyLayout(keyId, String(rowIndex))}
                  onLongPress={() => handleNumberHintLongPress(keyIndex)}
                  onPressEnd={event => handleNumberHintPressEnd(keyDef, event)}
                  style={[
                    styles.key,
                    isPill && styles.pillKey,
                    isAccent && styles.accentKey,
                    {flex: keyDef.width ?? 1, backgroundColor, paddingVertical: keyPaddingVertical},
                  ]}>
                  <Text style={[styles.numberHint, {color: theme.keyText, fontSize: 10 * keyboardSizeScale}]}>
                    {NUMBER_HINTS[keyIndex]}
                  </Text>
                  {iconName ? (
                    <Icon name={iconName} size={keyIconSize} color={textColor} />
                  ) : (
                    <Text style={{color: textColor, fontSize: keyFontSize, fontFamily: keyFontFamily ?? undefined}}>
                      {isShiftActive ? keyDef.key.toUpperCase() : keyDef.key}
                    </Text>
                  )}
                  {pressOverlay}
                </HoldRepeatKeyView>
              );
            }

            // onPressIn (not onPress, which only fires on release after
            // TouchableOpacity finishes checking the touch stayed in
            // bounds) so a key registers the instant it's touched - the
            // gap between the two was the main source of typing feeling
            // laggy, especially typing quickly with overlapping taps.
            return (
              <TouchableOpacity
                key={`${rowIndex}-${keyIndex}`}
                style={[
                  styles.key,
                  isPill && styles.pillKey,
                  isAccent && styles.accentKey,
                  {flex: keyDef.width ?? 1, backgroundColor, paddingVertical: keyPaddingVertical},
                ]}
                // activeOpacity 1: TouchableOpacity's default fades the whole
                // key (pressOverlay included) to 20% while held, which on
                // the light theme blended a white key into the near-white
                // tray - the press highlight was effectively invisible.
                activeOpacity={1}
                onLayout={keyDef.action ? undefined : trackKeyLayout(keyId, String(rowIndex))}
                onPressIn={() => {
                  // Only character keys get a preview bubble - shift, ?123,
                  // enter etc. just take the pressed highlight, as in Gboard.
                  pressKey(keyId, keyDef.action ? null : keyLabel);
                  handleKeyPress(keyDef);
                }}
                onPressOut={releaseKey}>
                {iconName ? (
                  <Icon name={iconName} size={keyIconSize} color={textColor} />
                ) : (
                  <Text style={{color: textColor, fontSize: keyFontSize, fontFamily: keyFontFamily ?? undefined}}>
                    {isShiftActive ? keyDef.key.toUpperCase() : keyDef.key}
                  </Text>
                )}
                {pressOverlay}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      {keyPreview}
    </View>
  );

  if (!isOneHanded) {
    return keyboardBody;
  }

  // Gboard's one-handed mode: the keyboard itself shrinks and hugs one
  // side of the screen, with a narrow strip of controls filling the
  // freed-up space on the other side (switch side, or exit back to full
  // width) instead of leaving that space empty.
  const sideStrip = (
    <View style={styles.oneHandedStrip}>
      <TouchableOpacity
        style={styles.oneHandedStripButton}
        onPress={() => setOneHandedMode(oneHandedMode === 'left' ? 'right' : 'left')}>
        <Icon name="swap-horiz" size={20} color={theme.keyText + '99'} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.oneHandedStripButton} onPress={() => setOneHandedMode('off')}>
        <Icon name="close-fullscreen" size={18} color={theme.keyText + '99'} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.oneHandedRow, {backgroundColor: theme.panelBackground}]}>
      {oneHandedMode === 'right' && sideStrip}
      {keyboardBody}
      {oneHandedMode === 'left' && sideStrip}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 3,
  },
  key: {
    marginHorizontal: 2,
    // 13px per the "Keyboard Toolbar Explorations" design board (was 6).
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pillKey: {
    borderRadius: 20,
  },
  accentKey: {
    borderRadius: 24,
  },
  // A clearly-visible press highlight on top of the resting-state
  // backgroundColor swap above - that swap alone (theme.keyPressedBackground)
  // is too close to theme.keyBackground on several themes to read as
  // "this key is pressed" rather than just looking slightly different in
  // a screenshot. A translucent white-on-dark/black-on-light wash is
  // visible against literally any theme's key color, unlike a fixed
  // tint tuned to one palette.
  pressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 13,
  },
  pressOverlayPill: {
    borderRadius: 20,
  },
  pressOverlayAccent: {
    borderRadius: 24,
  },
  numberHint: {
    position: 'absolute',
    top: 2,
    right: 6,
    fontSize: 10,
    opacity: 0.6,
  },
  oneHandedFlex: {
    flex: 4,
  },
  oneHandedRow: {
    flexDirection: 'row',
  },
  oneHandedStrip: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  oneHandedStripButton: {
    paddingVertical: 10,
  },
});
