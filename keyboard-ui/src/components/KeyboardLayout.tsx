import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  DeviceEventEmitter,
  findNodeHandle,
  GestureResponderEvent,
  LayoutChangeEvent,
  NativeTouchEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useShallow} from 'zustand/react/shallow';
import {useKeyboardStore} from '../store';
import {InputConnection, ImeAction} from '../native-bridge/InputConnection';
import type {KeyDef, LayoutDef} from '../layouts/types';
import {HoldRepeatKeyView, HoldRepeatPressEndEvent, HoldRepeatDragMoveEvent} from './HoldRepeatKeyView';
import {useKeyPreview} from '../hooks/useKeyPreview';
import {useKeyFeedback} from '../hooks/useKeyFeedback';
import {keyDecor} from '../themes/keyStyle';
import {decodeSwipe, Point} from '../services/swipeDecoder';
import {getWordList} from '../services/dictionary';
import {SwipeTrail, SwipeTrailHandle} from './SwipeTrail';

// A full row of digit keys shown above the top letter row when the
// "Number row" setting is on - distinct from NUMBER_HINTS below (the
// existing per-key long-press hint), which stays available regardless.
const NUMBER_ROW_DIGITS = '1234567890'.split('');

import {LAYOUTS} from '../layouts/registry';

// Gboard shows 1-2-3...0 above the top letter row regardless of language,
// and keeps the ?123/ABC pill a fixed dark gray in both its light and dark
// themes - these aren't derived from the user's chosen KeyboardTheme.
const NUMBER_HINTS = '1234567890';
const DOUBLE_SPACE_PERIOD_WINDOW_MS = 300;
// Two taps of shift this close together switch caps lock on.
const SHIFT_DOUBLE_TAP_WINDOW_MS = 350;
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

// A row's width in key units (a key's `width`, defaulting to 1).
// `color` (#RRGGBB) at `alpha`, for the quieter keys of a layout. Anything
// else (a photo theme's #RRGGBBAA already has transparency) is left alone.
function dimmed(color: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return color + Math.round(alpha * 255).toString(16).padStart(2, '0');
}

function rowUnits(row: KeyDef[]): number {
  return row.reduce((sum, keyDef) => sum + (keyDef.width ?? 1), 0);
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

function KeyboardLayoutImpl({
  onCommitText,
  onDeleteBackward,
  onEnter,
  showSuggestions = true,
  compact = false,
}: KeyboardLayoutProps = {}) {
  // Only what this component draws (or passes on as stable setters). The
  // word being typed and the pending suggestion-undo change on every
  // keystroke but are only needed inside key handlers, so they're read
  // fresh from the store at that moment (currentTypedWord/
  // currentLastSuggestion) - subscribing to them re-rendered the whole
  // keyboard on every letter, which is what made fast typing lag.
  const {
    activeLocale,
    theme,
    isShiftActive,
    capsLock,
    toggleShift,
    setShiftActive,
    setActivePanel,
    updateTypedWord,
    completeWord,
    learnWord,
    oneHandedMode,
    setOneHandedMode,
    isSensitiveField,
    setLastSuggestion,
    keyboardSizeScale,
    numberRowEnabled,
    keyFontFamily,
    keyStyle,
    swipeTypingEnabled,
    swipeTypingTrailEnabled,
    setSwipeResult,
  } = useKeyboardStore(
    useShallow(state => ({
      activeLocale: state.activeLocale,
      theme: state.theme,
      isShiftActive: state.isShiftActive,
      capsLock: state.capsLock,
      toggleShift: state.toggleShift,
      setShiftActive: state.setShiftActive,
      setActivePanel: state.setActivePanel,
      updateTypedWord: state.updateTypedWord,
      completeWord: state.completeWord,
      learnWord: state.learnWord,
      oneHandedMode: state.oneHandedMode,
      setOneHandedMode: state.setOneHandedMode,
      isSensitiveField: state.isSensitiveField,
      setLastSuggestion: state.setLastSuggestion,
      keyboardSizeScale: state.keyboardSizeScale,
      numberRowEnabled: state.numberRowEnabled,
      keyFontFamily: state.keyFontFamily,
      keyStyle: state.keyStyle,
      swipeTypingEnabled: state.swipeTypingEnabled,
      swipeTypingTrailEnabled: state.swipeTypingTrailEnabled,
      setSwipeResult: state.setSwipeResult,
    })),
  );
  const currentTypedWord = () => useKeyboardStore.getState().typedWord;
  const currentLastSuggestion = () => useKeyboardStore.getState().lastSuggestion;
  const lastSpaceTimeRef = useRef(0);
  const lastShiftTapRef = useRef(0);
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
  // The pressed key's highlight and the Gboard-style preview bubble above
  // it - see useKeyPreview (shared with SymbolsNumberPanel). Press state
  // lives in that hook's own store, so a press never re-renders the keys.
  const {
    pressKey,
    releaseKey,
    clearPress,
    setPreviewOverride,
    onBodyLayout,
    trackRowLayout,
    trackKeyLayout,
    keyAt,
    keyBoxes,
    renderPreview,
  } = useKeyPreview();

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
    if (onEnter) return;
    const refresh = () => {
      InputConnection.getImeAction()
        .then(action => setEnterIcon(ENTER_ICON_BY_ACTION[action]))
        .catch(() => {});
    };
    refresh();
    // Again for each newly focused field - the keyboard stays mounted
    // across fields, so a search box's icon used to stick for the next one.
    const subscription = DeviceEventEmitter.addListener('onInputFieldChanged', refresh);
    return () => subscription.remove();
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

  const baseLayout = LAYOUTS[activeLocale] ?? LAYOUTS['en-GB'];
  // A layout with extra pages (Hindi's "1/4" key) shows one at a time: page
  // one is its `rows`, the others replace all but the shared bottom row.
  const pageCount = 1 + (baseLayout.extraPages?.length ?? 0);
  const [layoutPage, setLayoutPage] = useState(0);
  const currentPage = layoutPage < pageCount ? layoutPage : 0;
  // Each time the language changes it starts on page one again.
  useEffect(() => setLayoutPage(0), [activeLocale]);
  const layout = useMemo<LayoutDef>(
    () =>
      currentPage === 0 || !baseLayout.extraPages
        ? baseLayout
        : {...baseLayout, rows: [...baseLayout.extraPages[currentPage - 1], baseLayout.rows[baseLayout.rows.length - 1]]},
    [baseLayout, currentPage],
  );

  // The translucent wash (drawn by useKeyPreview's press layer) that reads as "pressed"
  // regardless of which theme's specific key/pressed-background pair is
  // active, rather than relying on that pair alone being visibly distinct.
  // Shape/outline/3D/bold from the user's key style (see themes/keyStyle.ts).
  const decor = useMemo(() => keyDecor(keyStyle, theme), [keyStyle, theme]);

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

  // A word was finished (space, enter, a correction): learns it and shows
  // the words that usually come next - see the store's completeWord.
  const finishWord = (word: string, sentenceEnd = false) => {
    if (effectiveShowSuggestions) {
      completeWord(word, sentenceEnd);
    }
  };

  const commitChar = (char: string) => {
    const output = isShiftActive ? char.toUpperCase() : char;
    commitText(output);
    trackWord(output === ' ' ? '' : currentTypedWord() + output);
    if (isShiftActive) {
      toggleShift();
    }
    // Remembers whether this char should trigger auto-cap once the
    // sentence-ending space arrives - see the space/enter handling below.
    pendingSentenceEndRef.current = SENTENCE_END_CHARS.has(char);
    // Any real typing invalidates a pending suggestion-undo - only the
    // *immediate* next backspace after applying a suggestion should revert
    // it.
    if (currentLastSuggestion()) {
      setLastSuggestion(null);
    }
  };

  const deleteOneCharacter = () => {
    deleteBackward(1);
    trackWord(currentTypedWord().slice(0, -1));
  };

  // Gboard: a single backspace tap immediately after tapping a suggestion
  // chip undoes that substitution instead of deleting one character.
  // Consumed at press-time (not release) since the undo is a whole-word
  // action, not a per-character one.
  const maybeUndoSuggestion = (): boolean => {
    const lastSuggestion = currentLastSuggestion();
    if (!lastSuggestion || onDeleteBackward) {
      // Only meaningful for the real field - a redirected instance (GIF
      // search) has no suggestion chips to have applied in the first place.
      return false;
    }
    deleteBackward(lastSuggestion.applied.length + 1); // +1 for the trailing space
    commitText(lastSuggestion.original);
    useKeyboardStore.getState().restorePreviousWord();
    trackWord(lastSuggestion.original);
    setLastSuggestion(null);
    // Undoing a fix means the word was meant: don't fix it again on the
    // next space, and learn it so it isn't "fixed" in future either.
    useKeyboardStore.setState({autoCorrection: null});
    if (effectiveShowSuggestions) learnWord(lastSuggestion.original);
    return true;
  };

  // Adds a word to the shared personal dictionary once it's actually
  // finished (space/enter), so it starts showing up as a suggestion the
  // next time its prefix is typed - previously the dictionary was a fixed
  // list that never grew from what the user actually types.
  const maybeLearnWord = () => {
    const typedWord = currentTypedWord();
    if (effectiveShowSuggestions && typedWord.length >= 3) {
      learnWord(typedWord);
    }
  };

  // Shared by every real key-press path (a plain tap, a held-delete repeat
  // tick, and the number-hint long-press) rather than baked into just one
  // of them, so turning either setting on actually covers typing in
  // general, not just a slice of it.
  const fireKeyFeedback = useKeyFeedback();

  const handleKeyPress = (keyDef: KeyDef) => {
    fireKeyFeedback();
    // Double-space -> ". " is for two spaces in a row only. Timing alone
    // wasn't enough: at fast typing speed a whole short word fits in the
    // window, so "brown fox " turned into "brow. fox" (the next space
    // deleted the last letter, taking it for the first space).
    if (keyDef.action !== 'space') lastSpaceTimeRef.current = 0;
    switch (keyDef.action) {
      case 'shift': {
        // Two quick taps turn caps lock on (capitals until shift is tapped
        // again); one tap is shift for the next letter only.
        const now = Date.now();
        const state = useKeyboardStore.getState();
        if (state.capsLock) {
          state.setCapsLock(false);
          lastShiftTapRef.current = 0;
        } else if (now - lastShiftTapRef.current < SHIFT_DOUBLE_TAP_WINDOW_MS) {
          state.setCapsLock(true);
          lastShiftTapRef.current = 0;
        } else {
          lastShiftTapRef.current = now;
          toggleShift();
        }
        return;
      }
      case 'space': {
        const now = Date.now();
        let endsSentence = pendingSentenceEndRef.current;
        if (now - lastSpaceTimeRef.current < DOUBLE_SPACE_PERIOD_WINDOW_MS) {
          // Gboard: two quick taps of space turns "word  " into "word. ".
          deleteBackward(1);
          commitText('. ');
          lastSpaceTimeRef.current = 0;
          endsSentence = true;
          spaceTypedRef.current = 'period';
        } else {
          // Auto-correct (Settings): an obvious typo in the word just
          // finished is swapped for the fix the strip was offering.
          const {autoCorrectEnabled, autoCorrection} = useKeyboardStore.getState();
          const typed = currentTypedWord();
          if (autoCorrectEnabled && autoCorrection && effectiveShowSuggestions && !onCommitText && typed) {
            deleteBackward(typed.length);
            commitText(autoCorrection + ' ');
            lastSpaceTimeRef.current = now;
            spaceTypedRef.current = 'space';
            if (endsSentence) setShiftActive(true);
            pendingSentenceEndRef.current = false;
            finishWord(autoCorrection);
            // Backspace straight after puts the typed word back (see
            // maybeUndoSuggestion), as with a tapped suggestion.
            setLastSuggestion({original: typed, applied: autoCorrection});
            return;
          }
          commitText(' ');
          lastSpaceTimeRef.current = now;
          spaceTypedRef.current = 'space';
        }
        // Auto-capitalize the next letter after a sentence-ending space,
        // same as Gboard - see SENTENCE_END_CHARS.
        if (endsSentence) setShiftActive(true);
        pendingSentenceEndRef.current = false;
        const finished = currentTypedWord();
        maybeLearnWord();
        finishWord(finished, endsSentence);
        if (currentLastSuggestion()) setLastSuggestion(null);
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
        finishWord(currentTypedWord(), true);
        if (currentLastSuggestion()) setLastSuggestion(null);
        return;
      case 'page':
        setLayoutPage((currentPage + 1) % pageCount);
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

  // --- Tap keys: one multi-touch handler for the whole keyboard --------
  // Plain keys (letters, punctuation, shift, ?123, enter, emoji, the
  // number row) aren't individually touchable. React Native gives a touch
  // gesture to one responder at a time, so with a TouchableOpacity per key
  // a second finger landing while the first was still down (ordinary fast
  // typing: "a" not yet released when "n" goes down) was folded into the
  // first key's gesture and the second key was late or lost entirely.
  // Instead the body receives every finger's touch-start and hit-tests it
  // against the measured key boxes, so each finger types its own key the
  // moment it lands. Space, delete and the top row keep their own handlers
  // (drag/hold gestures); their touches simply aren't registered here.
  const tapKeys: Record<string, {keyDef: KeyDef; label: string | null; numberHint?: string}> = {};
  const tapKeysRef = useRef(tapKeys);
  tapKeysRef.current = tapKeys;
  // Touch identifier -> the key it pressed, to release the right one.
  const activeTouchesRef = useRef(new Map<string, string>());
  const bodyRef = useRef<View>(null);
  // The body's position in the same coordinate space as touch pageX/pageY.
  const bodyOriginRef = useRef<{x: number; y: number} | null>(null);

  // A touch's position within the body. When the body itself is the touch
  // target (the usual case, since tap keys pass touches through to it),
  // a touch-start's locationX/Y already are that - and they recalibrate the
  // body's origin for free. Otherwise, and for every move, pageX/Y minus
  // that origin gives the same thing: locationX/Y during a move are
  // measured from whatever view is under the finger at that moment (e.g. a
  // top-row key), not the target, so they jump around mid-swipe.
  const bodyPoint = (touch: NativeTouchEvent, isStart = false): {x: number; y: number} | null => {
    if (isStart && Number(touch.target) === findNodeHandle(bodyRef.current)) {
      bodyOriginRef.current = {x: touch.pageX - touch.locationX, y: touch.pageY - touch.locationY};
      return {x: touch.locationX, y: touch.locationY};
    }
    const origin = bodyOriginRef.current;
    return origin ? {x: touch.pageX - origin.x, y: touch.pageY - origin.y} : null;
  };

  const handleBodyTouchStart = (event: GestureResponderEvent) => {
    // Fast typing overlaps keys: the next finger lands before the last
    // one lifts. A top-row key still held then was a tap after all, not a
    // hold for its number, and a space still held isn't a cursor drag.
    cancelNumberHolds();
    spaceTouchRef.current = null;
    // A second finger landing means fast tap typing, not a swipe.
    if (event.nativeEvent.touches.length > 1 && swipeRef.current && !swipeRef.current.active) {
      swipeRef.current = null;
    }
    for (const touch of event.nativeEvent.changedTouches) {
      const point = bodyPoint(touch, true);
      const keyId = point ? keyAt(point.x, point.y) : null;
      if (point && keyId && event.nativeEvent.touches.length === 1) {
        maybeStartSwipe(String(touch.identifier), point, keyId);
      }
      // Other fingers don't type while a swipe is being drawn.
      if (swipeRef.current?.active) continue;
      const tapKey = keyId ? tapKeysRef.current[keyId] : undefined;
      if (!keyId || !tapKey) continue;
      activeTouchesRef.current.set(String(touch.identifier), keyId);
      pressKey(keyId, tapKey.label);
      handleKeyPress(tapKey.keyDef);
      if (keyId === 'space' && point && cursorControlEnabled) {
        spaceTouchRef.current = {touchId: String(touch.identifier), startX: point.x, steps: 0, dragging: false};
      }
      if (tapKey.numberHint != null) {
        const touchId = String(touch.identifier);
        numberHoldTimersRef.current.set(
          touchId,
          setTimeout(() => {
            numberHoldTimersRef.current.delete(touchId);
            handleNumberHintLongPress(keyId, tapKey.numberHint!);
          }, LONG_PRESS_NUMBER_DELAY_MS),
        );
      }
    }
  };

  const handleBodyTouchEnd = (event: GestureResponderEvent) => {
    const swipe = swipeRef.current;
    if (swipe && event.nativeEvent.changedTouches.some(t => String(t.identifier) === swipe.touchId)) {
      swipeRef.current = null;
      trailRef.current?.clear();
      if (swipe.active && event.type !== 'touchcancel') {
        finishSwipe(swipe);
      }
    }
    for (const touch of event.nativeEvent.changedTouches) {
      const touchId = String(touch.identifier);
      if (spaceTouchRef.current?.touchId === touchId) spaceTouchRef.current = null;
      const holdTimer = numberHoldTimersRef.current.get(touchId);
      if (holdTimer) {
        clearTimeout(holdTimer);
        numberHoldTimersRef.current.delete(touchId);
      }
      if (activeTouchesRef.current.delete(touchId)) {
        releaseKey();
        setPreviewOverride(null);
      }
    }
  };

  const handleBodyLayout = (event: LayoutChangeEvent) => {
    if (showSuggestions && !compact && oneHandedMode === 'off') {
      const {width, height} = event.nativeEvent.layout;
      useKeyboardStore.getState().setKeyboardBodySize({width, height});
    }
    onBodyLayout(event);
    bodyRef.current?.measure((_x, _y, _width, _height, pageX, pageY) => {
      bodyOriginRef.current = {x: pageX, y: pageY};
    });
  };

  // --- Swipe typing ----------------------------------------------------
  // A finger that lands on a letter is a swipe candidate; once it travels
  // more than ~60% of a key's width it becomes a swipe. The letter its
  // touch-down already typed is taken back, the path is collected (and
  // drawn - SwipeTrail), and on lift it's decoded into a word against the
  // same word list the suggestions use (services/swipeDecoder.ts).
  // Latin-script layouts only: the decoder matches keys to letters of the
  // word list, and the Hindi list's words don't spell out key by key.
  const wordList = activeLocale === 'hi-IN' ? null : getWordList(activeLocale);
  const swipeAvailable = swipeTypingEnabled && !!wordList;
  const trailRef = useRef<SwipeTrailHandle>(null);
  type SwipeState = {
    touchId: string;
    start: Point;
    points: Point[];
    keyWidth: number;
    active: boolean;
    // To undo the touch-down letter exactly when this turns into a swipe.
    typedBefore: string;
    shiftBefore: boolean;
  };
  const swipeRef = useRef<SwipeState | null>(null);

  const isLetterKey = (keyDef: KeyDef | undefined) => !!keyDef && !keyDef.action && /^[a-zà-ÿ]$/i.test(keyDef.key);

  const keyDefFor = (keyId: string): KeyDef | undefined => {
    const match = /^(\d+)-(\d+)$/.exec(keyId);
    return match ? layout.rows[Number(match[1])]?.[Number(match[2])] : undefined;
  };

  const maybeStartSwipe = (touchId: string, point: Point, keyId: string) => {
    swipeRef.current = null;
    if (!swipeAvailable || !isLetterKey(keyDefFor(keyId))) return;
    const box = keyBoxes().find(candidate => candidate.keyId === keyId);
    swipeRef.current = {
      touchId,
      start: point,
      points: [point],
      keyWidth: box?.width ?? 30,
      active: false,
      typedBefore: currentTypedWord(),
      shiftBefore: isShiftActive,
    };
  };

  const handleBodyTouchMove = (event: GestureResponderEvent) => {
    handleSpaceDrag(event);
    const swipe = swipeRef.current;
    if (!swipe) return;
    const touch = event.nativeEvent.changedTouches.find(t => String(t.identifier) === swipe.touchId);
    const point = touch ? bodyPoint(touch) : null;
    if (!point) return;
    if (!swipe.active) {
      if (Math.hypot(point.x - swipe.start.x, point.y - swipe.start.y) < swipe.keyWidth * 0.6) return;
      swipe.active = true;
      cancelNumberHolds();
      // Take back the letter the touch-down typed - this is a swipe, and
      // its first letter comes from the decoded word.
      deleteBackward(1);
      trackWord(swipe.typedBefore);
      setShiftActive(swipe.shiftBefore);
      releaseKey();
      setPreviewOverride(null);
      if (swipeTypingTrailEnabled) trailRef.current?.start(swipe.start);
    }
    // Skip near-duplicate points - a finger reports far more moves than
    // the decoder or the trail need.
    const last = swipe.points[swipe.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < 3) return;
    swipe.points.push(point);
    if (swipeTypingTrailEnabled) trailRef.current?.add(point);
  };

  const finishSwipe = (swipe: SwipeState) => {
    if (!wordList) return;
    const centers: Record<string, Point> = {};
    let widthSum = 0;
    let keyCount = 0;
    for (const box of keyBoxes()) {
      const keyDef = keyDefFor(box.keyId);
      if (!isLetterKey(keyDef)) continue;
      centers[keyDef!.key.toLowerCase()] = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      widthSum += box.width;
      keyCount++;
    }
    const words = decodeSwipe(swipe.points, centers, keyCount ? widthSum / keyCount : 0, wordList);
    if (words.length === 0) return;
    const capitalise = (word: string) => (swipe.shiftBefore ? word.charAt(0).toUpperCase() + word.slice(1) : word);
    const [word, ...alternatives] = words.map(capitalise);
    fireKeyFeedback();
    // A swiped word right after another word (or a few typed letters) gets
    // its separating space automatically, as in Gboard - the swiped word
    // itself is left without one, so a suggestion chip can still swap it.
    commitText((swipe.typedBefore ? ' ' : '') + word);
    // The letters typed before the swipe were a finished word now (the
    // swipe added the space after them).
    if (swipe.typedBefore) finishWord(swipe.typedBefore);
    if (effectiveShowSuggestions) {
      setSwipeResult(word, alternatives);
    }
    if (swipe.shiftBefore) setShiftActive(false);
    pendingSentenceEndRef.current = false;
    if (currentLastSuggestion()) setLastSuggestion(null);
  };

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
    pressKey('delete');
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
    releaseKey();
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

  // --- Number-hint keys (row 0): hold for the number -------------------
  // Top-row letters are ordinary tap keys - typed on touch-down by
  // handleBodyTouchStart, in the same stream as every other key. They used
  // to be native HoldRepeatKeyViews whose press events took a separate
  // route to JS, and when typing fast a top-row letter could arrive after
  // the next key ("jumps" came out "ujpms"). Holding one still swaps the
  // typed letter for its number, from this JS timer (touch id -> timer).
  const numberHoldTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const cancelNumberHolds = () => {
    numberHoldTimersRef.current.forEach(clearTimeout);
    numberHoldTimersRef.current.clear();
  };

  useEffect(() => cancelNumberHolds, []);

  const handleNumberHintLongPress = (keyId: string, number: string) => {
    // A swipe that started on this key isn't a hold.
    if (swipeRef.current?.active) return;
    fireKeyFeedback();
    // Gboard shows the number in the bubble the moment the long-press
    // fires, so holding visibly does something before the finger lifts.
    setPreviewOverride({keyId, label: number});
    deleteBackward(1);
    commitText(number);
    trackWord('');
    pendingSentenceEndRef.current = false;
  };

  // --- Space: typed on touch-down, drag to move the cursor -------------
  // A tap key like any other (typed by handleBodyTouchStart, in order with
  // the rest), rather than its own PanResponder that typed on release: at
  // speed the next letter often landed before the space lifted and went in
  // ahead of it, and holding a moment too long popped up the system
  // keyboard picker (that's now "Switch keyboard" in All tools). Sliding
  // along the bar still moves the cursor - the space it typed is taken
  // back once the finger has clearly started dragging.
  const spaceKeyDef: KeyDef = {key: 'space', action: 'space'};
  // What the last space press typed: a plain space, or a double-space
  // period (which turned the previous space into ". ").
  const spaceTypedRef = useRef<'space' | 'period'>('space');
  const spaceTouchRef = useRef<{touchId: string; startX: number; steps: number; dragging: boolean} | null>(null);

  const handleSpaceDrag = (event: GestureResponderEvent) => {
    const space = spaceTouchRef.current;
    if (!space) return;
    const touch = event.nativeEvent.changedTouches.find(t => String(t.identifier) === space.touchId);
    const point = touch ? bodyPoint(touch) : null;
    if (!point) return;
    const dx = point.x - space.startX;
    if (!space.dragging) {
      if (Math.abs(dx) <= DRAG_MODE_THRESHOLD_PX) return;
      space.dragging = true;
      if (spaceTypedRef.current === 'period') {
        deleteBackward(2);
        commitText(' ');
      } else {
        deleteBackward(1);
      }
      lastSpaceTimeRef.current = 0;
    }
    const targetSteps = Math.trunc(dx / PIXELS_PER_CHAR);
    const delta = targetSteps - space.steps;
    for (let i = 0; i < Math.abs(delta); i++) {
      InputConnection.moveCursor(delta > 0 ? 1 : -1);
    }
    space.steps = targetSteps;
  };

  // Only the real keyboard (not GifStickerPanel's redirected reuse) can go
  // one-handed - a search-query mini keyboard has no need for it.
  const isOneHanded = showSuggestions && oneHandedMode !== 'off';

  // Same "real keyboard only" gating as one-handed mode above - a search
  // mini keyboard (GifStickerPanel) has no use for a persistent digit row
  // either. Deliberately a separate, plain row rather than reusing the
  // per-key long-press hint machinery (NUMBER_HINTS/showNumberHint) below:
  // that one stays exactly as it was, this is an addition on top of it.
  const showNumberRow = showSuggestions && numberRowEnabled;

  const keyPreview = renderPreview({
    theme,
    scale: keyboardSizeScale,
    fontFamily: keyFontFamily,
    highlightColor: pressOverlayColor,
    radius: decor.radius,
  });

  const keyboardBody = (
    <View
      ref={bodyRef}
      onLayout={handleBodyLayout}
      onTouchStart={handleBodyTouchStart}
      onTouchMove={handleBodyTouchMove}
      onTouchEnd={handleBodyTouchEnd}
      onTouchCancel={handleBodyTouchEnd}
      style={[
        styles.container,
        {backgroundColor: theme.panelBackground, paddingVertical: 4 * verticalScale},
        isOneHanded && styles.oneHandedFlex,
      ]}>
      {showNumberRow && (
        <View
          pointerEvents="box-none"
          style={[styles.row, {marginVertical: rowMarginVertical}]}
          onLayout={trackRowLayout('numrow')}>
          {NUMBER_ROW_DIGITS.map((digit, index) => {
            tapKeys[`numrow-${index}`] = {keyDef: {key: digit}, label: digit};
            return (
            // A tap key - see handleBodyTouchStart.
            <View
              key={digit}
              pointerEvents="none"
              style={[
                styles.key,
                decor.key,
                {
                  flex: 1,
                  backgroundColor: theme.keyBackground,
                  paddingVertical: keyPaddingVertical,
                },
              ]}
              onLayout={trackKeyLayout(`numrow-${index}`, 'numrow')}>
              <Text style={{color: theme.keyText, fontSize: keyFontSize, fontWeight: decor.labelWeight, fontFamily: keyFontFamily ?? undefined}}>
                {digit}
              </Text>
            </View>
            );
          })}
        </View>
      )}
      {layout.rows.map((row, rowIndex) => {
        // Gboard indents the middle letter row (a-l: 9 keys under q-p's 10)
        // by half a key on each side rather than stretching its keys to the
        // full width. Worked out from the key widths rather than hard-coded,
        // so a layout whose second row is already full (AZERTY's qsdf...m)
        // gets no inset.
        const sideInset = rowIndex === 1 ? Math.max(0, (rowUnits(layout.rows[0]) - rowUnits(row)) / 2) : 0;
        return (
        <View
          key={rowIndex}
          // box-none: the row itself never becomes the touch target, so
          // touches on tap keys reach the body - see handleBodyTouchStart.
          pointerEvents="box-none"
          style={[styles.row, {marginVertical: rowMarginVertical}]}
          onLayout={trackRowLayout(String(rowIndex))}>
          {sideInset > 0 && <View pointerEvents="none" style={{flex: sideInset}} />}
          {row.map((keyDef, keyIndex) => {
            const keyId = `${rowIndex}-${keyIndex}`;
            const keyLabel = keyDef.label ?? (isShiftActive ? keyDef.key.toUpperCase() : keyDef.key);
            // The page key reads "1/4", "2/4"... - which page of the layout.
            const isPageKey = keyDef.action === 'page';
            const isDimKey = !!keyDef.dim || isPageKey;
            const isPill = keyDef.action === 'symbols';
            const isAccent = keyDef.action === 'enter';
            const isShiftKey = keyDef.action === 'shift';
            const isDeleteKey = keyDef.action === 'delete';
            const isSpaceKey = keyDef.action === 'space';
            // With the number row on, the digits are right above - so the
            // top row drops its small hint numbers and hold-for-number, and
            // its keys become ordinary letter keys.
            const showNumberHint =
              !showNumberRow &&
              layout.numberHints !== false &&
              rowIndex === 0 &&
              !keyDef.action &&
              keyIndex < NUMBER_HINTS.length;
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
            else if (isShiftKey && capsLock) backgroundColor = theme.accent;
            else if (isShiftKey && isShiftActive) backgroundColor = theme.keyPressedBackground;
            else if (isDimKey) backgroundColor = dimmed(theme.keyBackground, 0.55);

            // A press is drawn over the key by useKeyPreview's layer, so keys
            // don't change (or re-render) when pressed - except delete while
            // drag-selecting, which shows its count.
            if (isDeleteKey && dragDeleteCount > 0) backgroundColor = theme.keyPressedBackground;

            const textColor = isPill
              ? PILL_TEXT
              : isAccent
                ? '#FFFFFF'
                : isShiftKey && capsLock
                  ? '#FFFFFF'
                  : isShiftKey && isShiftActive
                  ? theme.accent
                  : isDimKey
                    ? dimmed(theme.keyText, 0.8)
                    : theme.keyText;


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
                  onLayout={trackKeyLayout('delete', String(rowIndex))}
                  style={[
                    styles.key,
                    decor.key,
                    {flex: keyDef.width ?? 1, backgroundColor, paddingVertical: keyPaddingVertical},
                  ]}>
                  {dragDeleteCount > 0 ? (
                    <Text style={{color: textColor, fontSize: 13 * keyboardSizeScale, fontWeight: '700'}}>
                      -{dragDeleteCount}
                    </Text>
                  ) : iconName ? (
                    <Icon name={iconName} size={keyIconSize} color={textColor} />
                  ) : null}
                </HoldRepeatKeyView>
              );
            }

            // Space: a tap key too - see handleSpaceDrag.
            if (isSpaceKey) {
              tapKeys.space = {keyDef: spaceKeyDef, label: null};
              return (
                <View
                  key={`${rowIndex}-${keyIndex}`}
                  pointerEvents="none"
                  style={[
                    styles.key,
                    decor.key,
                    {flex: keyDef.width ?? 1, backgroundColor, paddingVertical: keyPaddingVertical},
                  ]}
                  onLayout={trackKeyLayout('space', String(rowIndex))}>
                  {iconName ? (
                    <Icon name={iconName} size={keyIconSize} color={textColor} />
                  ) : keyDef.label ? (
                    // The language name (Hindi: "हिन्दी"), as Gboard's space bar shows.
                    <Text style={{color: dimmed(theme.keyText, 0.8), fontSize: 13 * keyboardSizeScale, fontFamily: keyFontFamily ?? undefined}}>
                      {keyDef.label}
                    </Text>
                  ) : null}
                </View>
              );
            }

            // A tap key: typed by handleBodyTouchStart the instant a finger
            // lands on it (only character keys get a preview bubble -
            // shift, ?123, enter etc. just take the pressed highlight, as
            // in Gboard).
            // A top-row letter can also be held for its number (see
            // handleNumberHintLongPress).
            tapKeys[keyId] = {
              keyDef,
              label: keyDef.action ? null : keyLabel,
              numberHint: showNumberHint ? NUMBER_HINTS[keyIndex] : undefined,
            };
            return (
              <View
                key={`${rowIndex}-${keyIndex}`}
                pointerEvents="none"
                style={[
                  styles.key,
                  decor.key,
                  isPill && {borderRadius: decor.pillRadius},
                  isAccent && {borderRadius: decor.accentRadius},
                  {flex: keyDef.width ?? 1, backgroundColor, paddingVertical: keyPaddingVertical},
                ]}
                onLayout={trackKeyLayout(
                  keyId,
                  String(rowIndex),
                  isPill ? decor.pillRadius : isAccent ? decor.accentRadius : undefined,
                )}>
                {showNumberHint && (
                  <Text style={[styles.numberHint, {color: theme.keyText, fontSize: 10 * keyboardSizeScale}]}>
                    {NUMBER_HINTS[keyIndex]}
                  </Text>
                )}
                {iconName ? (
                  <Icon name={iconName} size={keyIconSize} color={textColor} />
                ) : (
                  <Text style={{color: textColor, fontSize: keyFontSize, fontWeight: decor.labelWeight, fontFamily: keyFontFamily ?? undefined}}>
                    {isPageKey ? `${currentPage + 1}/${pageCount}` : keyLabel}
                  </Text>
                )}
              </View>
            );
          })}
          {sideInset > 0 && <View pointerEvents="none" style={{flex: sideInset}} />}
        </View>
        );
      })}
      <SwipeTrail ref={trailRef} color={theme.accent} />
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
    // Corner radius comes from the key style (themes/keyStyle.ts) -
    // 13px by default, per the "Keyboard Toolbar Explorations" board.
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
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

// Memoised so the toolbar/suggestion strip re-rendering above it (App.tsx,
// on every letter typed) doesn't re-render all the keys too - the main
// instance takes no props, so it only re-renders for its own state.
export const KeyboardLayout = React.memo(KeyboardLayoutImpl);
