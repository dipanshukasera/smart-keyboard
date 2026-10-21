import {create} from 'zustand';
import type {KeyboardTheme} from '../themes/themeTypes';
import {defaultTheme} from '../themes/default';
import {ThemeStorage} from '../native-bridge/ThemeStorage';
import {BackgroundImage} from '../native-bridge/BackgroundImage';
import {getSuggestions, getSpellingCorrection} from '../services/dictionary';
import {getEmojiSuggestion} from '../data/emojiKeywords';
import {WordPairs, endsSentence, normalizeWord, predictNextWords, recordPair} from '../services/nextWords';
import {DEFAULT_KEY_STYLE, KeyStyle} from '../themes/keyStyle';

export type PanelType =
  | 'keyboard'
  | 'emoji'
  | 'gif'
  | 'stickers'
  | 'adultGifs'
  | 'symbols'
  | 'themeCustomizer'
  | 'clipboard'
  | 'learnedWords'
  | 'numericPad'
  | 'translate'
  | 'allTools'
  | 'font'
  | 'settings'
  | 'toolbarOrder'
  | 'voice';
export type OneHandedMode = 'off' | 'left' | 'right';

// Every tool the "All tools" grid and the toolbar's own row can show - a
// single id space so both share one persisted order (see toolbarOrder)
// instead of drifting into two different lists of "the same" tools.
export type ToolId = 'gif' | 'translate' | 'clipboard' | 'themes' | 'brightness' | 'emoji' | 'voice';
export const ALL_TOOL_IDS: ToolId[] = ['gif', 'translate', 'clipboard', 'themes', 'brightness', 'emoji', 'voice'];
// Three flat steps rather than a slider (no slider component is installed,
// and adding one for a single control isn't worth a new native dependency)
// - tapping the brightness icon cycles through these, dimming the keyboard
// itself via a semi-transparent overlay (see App.tsx).
export const DIM_LEVELS = [1, 0.85, 0.7] as const;

export interface ClipboardEntry {
  id: string;
  text: string;
  timestamp: number;
}

export interface CachedGifEntry {
  id: string;
  // Both are local "file://" URIs (see GifCommitModule.cacheGif) so this
  // section renders and re-sends with zero network once populated.
  previewUri: string;
  fullUri: string;
  timestamp: number;
  // Which panel sent it, so Recent shows it in that panel only. Absent on
  // entries saved before GIFs/Stickers/18+ became separate panels.
  kind?: 'gif' | 'sticker' | 'adult';
  // 18+ clips only: the clip's mp4 (remote URL; its bytes are in the
  // native download cache from when it was sent), so a Recent tap can
  // reopen the preview and send it as a GIF or as video again - fullUri
  // alone is a still frame or a converted GIF.
  videoUrl?: string;
}

export interface LastSuggestion {
  original: string;
  applied: string;
}

const MAX_LEARNED_WORDS = 200;
const MAX_CLIPBOARD_HISTORY = 30;
const MAX_RECENT_GIFS = 30;
const LEARNED_WORDS_KEY = 'learned_words';
const ONE_HANDED_MODE_KEY = 'one_handed_mode';
const CLIPBOARD_HISTORY_KEY = 'clipboard_history';
const RECENT_GIFS_KEY = 'recent_gifs';
const LEARN_FROM_TYPING_KEY = 'learn_from_typing';
const CUSTOM_THEMES_KEY = 'custom_themes';
const KEYBOARD_SIZE_SCALE_KEY = 'keyboard_size_scale';
const TRANSLATE_SOURCE_LOCALE_KEY = 'translate_source_locale';
const TRANSLATE_TARGET_LOCALE_KEY = 'translate_target_locale';
const ADULT_GIFS_ENABLED_KEY = 'adult_gifs_enabled';
const NUMBER_ROW_ENABLED_KEY = 'number_row_enabled';
const HINGLISH_ENABLED_KEY = 'hinglish_enabled';
const KEY_STYLE_KEY = 'key_style';
const SWIPE_TYPING_ENABLED_KEY = 'swipe_typing_enabled';
const AUTO_CORRECT_ENABLED_KEY = 'auto_correct_enabled';
const RECENT_EMOJIS_KEY = 'recent_emojis';
const WORD_PAIRS_KEY = 'word_pairs';
const MAX_RECENT_EMOJIS = 16;
const HAPTIC_FEEDBACK_ENABLED_KEY = 'haptic_feedback_enabled';
const KEY_SOUND_ENABLED_KEY = 'key_sound_enabled';
// Persisted and shown as a real toggle (see SettingsPanel), but there is no
// swipe-to-type gesture recognizer in this app yet - turning it on changes
// nothing today. Flagged as such in the UI rather than silently doing
// nothing with no explanation.
// "_v2": the old key held this switch's value from before swipe typing
// existed, when it did nothing - a stale "off" from then shouldn't hide
// the trail now that there is one.
const SWIPE_TRAIL_ENABLED_KEY = 'swipe_trail_enabled_v2';
const KEY_FONT_FAMILY_KEY = 'key_font_family';
const TOOLBAR_ORDER_KEY = 'toolbar_order';
const KEYBOARD_DIM_LEVEL_KEY = 'keyboard_dim_level';

interface KeyboardState {
  activeLocale: string;
  activePanel: PanelType;
  theme: KeyboardTheme;
  customThemes: KeyboardTheme[];
  // Multiplies key padding/font/icon size (see KeyboardLayout) - the
  // resulting height change flows through the existing onLayout ->
  // reportContentHeight pipeline, so no native change was needed to
  // support this.
  keyboardSizeScale: number;
  isShiftActive: boolean;
  // DeepL language codes (e.g. "ES", "EN-US") remembered across sessions
  // so the user doesn't have to re-pick a language pair every time they
  // open the bar - null source means "auto-detect", null target means
  // "nothing chosen yet" (the bar prompts for one).
  translateSourceLocale: string | null;
  translateTargetLocale: string | null;
  // The word currently being typed and its suggestions live here (not in
  // KeyboardLayout's own state) so the toolbar - a sibling component in
  // App.tsx - can collapse into a suggestion strip the same way Gboard's
  // does, instead of suggestions only ever appearing in their own row.
  typedWord: string;
  suggestions: string[];
  // An emoji matching the word being typed ("love" -> ❤️), shown as its own
  // chip after the word suggestions - see data/emojiKeywords.ts.
  emojiSuggestion: string | null;
  isToolbarExpanded: boolean;
  // Words the user has actually typed, folded into suggestions alongside
  // the fixed dictionary - Gboard calls this its "personal dictionary".
  learnedWords: string[];
  // Master switch: when off, nothing is ever learned regardless of
  // incognito - a persistent opt-out rather than incognito's
  // session-scoped one.
  learnFromTyping: boolean;
  // Opt-in for the 18+ tab in the GIF panel. Off by default, and even
  // when on the backend still has to have ENABLE_ADULT_GIFS=true - the
  // tab isn't rendered and the adult endpoint is never called otherwise.
  adultGifsEnabled: boolean;
  oneHandedMode: OneHandedMode;
  // Deliberately never persisted (see hydrate) - Gboard requires
  // re-enabling incognito every session too, rather than it silently
  // staying on.
  isIncognito: boolean;
  // Mirrors whichever field is currently focused (see App.tsx's
  // onInputFieldChanged listener) - true for password fields, which
  // automatically get the same treatment as incognito (no learning, no
  // clipboard capture, no suggestion strip) without the user having to
  // remember to turn anything on.
  isSensitiveField: boolean;
  // Also mirrors onInputFieldChanged - true for number/phone/date fields
  // (e.g. a payment amount box), which App.tsx uses to auto-switch to
  // NumericPanel instead of leaving the letter keyboard up.
  isNumericField: boolean;
  numericFieldAllowsDecimal: boolean;
  numericFieldAllowsSign: boolean;
  clipboardHistory: ClipboardEntry[];
  recentGifs: CachedGifEntry[];
  // Set right after a suggestion chip is tapped; consumed by the very next
  // backspace press to undo that one substitution (see KeyboardLayout).
  // Anything else the user does in between should clear it first.
  lastSuggestion: LastSuggestion | null;
  // A persistent full row of digit keys above the top letter row -
  // distinct from the existing per-key long-press number hint (see
  // KeyboardLayout's NUMBER_HINTS), which stays available either way.
  numberRowEnabled: boolean;
  // Hinglish: while typing English, offer the Hindi-script (Devanagari)
  // form of the current word as a suggestion ("namaste" -> नमस्ते). See
  // App.tsx's transliteration lookup.
  hinglishEnabled: boolean;
  // Key shape/outline/3D/bold - see themes/keyStyle.ts.
  keyStyle: KeyStyle;
  // Gesture typing: drag across the letters to type a word (see
  // services/swipeDecoder.ts). The trail drawn under the finger is a
  // separate switch, swipeTypingTrailEnabled.
  swipeTypingEnabled: boolean;
  // Space fixes an obvious typo in the word just typed (one edit from a
  // common word, and nothing real starts with it) - backspace right after
  // puts the original back. See autoCorrection.
  autoCorrectEnabled: boolean;
  // The fix space would apply to the word being typed, if any - the same
  // correction the strip offers as a chip (see updateTypedWord).
  autoCorrection: string | null;
  // Most recent first, at most MAX_RECENT_EMOJIS.
  recentEmojis: string[];
  // Next-word prediction (services/nextWords.ts): which word follows which
  // in what the user types, the last finished word of this sentence (lower
  // case; null at a sentence start or in a fresh field), and the one
  // before it, so undoing a correction can put it back.
  wordPairs: WordPairs;
  previousWord: string | null;
  priorWord: string | null;
  // Real: a short Vibration.vibrate() on every key press when on.
  hapticFeedbackEnabled: boolean;
  // Real: plays Android's built-in keypress click sound (see
  // native-bridge/SoundModule) - no bundled sound files or new audio
  // library, just the system's own click.
  keySoundEnabled: boolean;
  // Not yet functional - see SWIPE_TRAIL_ENABLED_KEY above. Kept in state
  // and shown in Settings for parity, with its own "not yet available"
  // note rather than a fake animation with no gesture recognizer behind it.
  swipeTypingTrailEnabled: boolean;
  // One of Android's built-in system type faces (see FontPanel) - null
  // means whatever RN's default is. Deliberately not a bundled custom
  // font: no font files or a way to fetch them were available here.
  keyFontFamily: string | null;
  // Which tools appear in the toolbar, and in what order - "more" (the
  // All-tools grid) is always first and isn't part of this list.
  toolbarOrder: ToolId[];
  // Index into DIM_LEVELS - cycled by tapping the toolbar's brightness
  // icon, applied as a semi-transparent overlay over the whole keyboard
  // (see App.tsx).
  keyboardDimLevel: number;
  // One-shot, never persisted: set by AllToolsSheet's "Stickers" card right
  // before navigating to the 'gif' panel so it can open straight to that
  // tab, then cleared by GifStickerPanel on mount so it doesn't affect a
  // later plain "GIFs" open.

  setActiveLocale: (locale: string) => void;
  setActivePanel: (panel: PanelType) => void;
  setTheme: (theme: KeyboardTheme) => void;
  addCustomTheme: (theme: KeyboardTheme) => void;
  deleteCustomTheme: (id: string) => void;
  setKeyboardSizeScale: (scale: number) => void;
  toggleShift: () => void;
  setShiftActive: (active: boolean) => void;
  // Forget everything about what was being typed - the current word, its
  // suggestions/emoji, the pending suggestion-undo - so a newly focused
  // field (or the keyboard reopened, even in the same app) starts fresh.
  // Clipboard history, learned words and settings are kept.
  resetTypingSession: () => void;
  setTranslateSourceLocale: (locale: string | null) => void;
  setTranslateTargetLocale: (locale: string | null) => void;
  setToolbarExpanded: (expanded: boolean) => void;
  updateTypedWord: (word: string) => void;
  learnWord: (word: string) => void;
  removeLearnedWord: (word: string) => void;
  setLearnFromTyping: (value: boolean) => void;
  setAdultGifsEnabled: (value: boolean) => void;
  setOneHandedMode: (mode: OneHandedMode) => void;
  setIncognito: (value: boolean) => void;
  setSensitiveField: (value: boolean) => void;
  setNumericField: (isNumeric: boolean, allowDecimal: boolean, allowSign: boolean) => void;
  addClipboardEntry: (text: string) => void;
  removeClipboardEntry: (id: string) => void;
  clearClipboardHistory: () => void;
  addRecentGif: (entry: CachedGifEntry) => void;
  clearRecentGifs: () => void;
  setLastSuggestion: (value: LastSuggestion | null) => void;
  setNumberRowEnabled: (value: boolean) => void;
  setHinglishEnabled: (value: boolean) => void;
  setKeyStyle: (patch: Partial<KeyStyle>) => void;
  setSwipeTypingEnabled: (value: boolean) => void;
  setAutoCorrectEnabled: (value: boolean) => void;
  addRecentEmoji: (emoji: string) => void;
  // A word was finished (space, a tapped suggestion, enter): learn that it
  // followed the word before it, and offer the words that usually come
  // next. `sentenceEnd` starts the next sentence with nothing carried over.
  completeWord: (word: string, sentenceEnd?: boolean) => void;
  // After undoing a correction: the word before is the previous one again.
  restorePreviousWord: () => void;
  // After a swipe: `word` was typed (without a trailing space), and the
  // strip offers `alternatives` - tapping one replaces it like any other
  // suggestion.
  setSwipeResult: (word: string, alternatives: string[]) => void;
  setHapticFeedbackEnabled: (value: boolean) => void;
  setKeySoundEnabled: (value: boolean) => void;
  setSwipeTypingTrailEnabled: (value: boolean) => void;
  setKeyFontFamily: (value: string | null) => void;
  setToolbarOrder: (order: ToolId[]) => void;
  cycleKeyboardDim: () => void;
  hydrate: () => Promise<void>;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  activeLocale: 'en-GB',
  activePanel: 'keyboard',
  theme: defaultTheme,
  customThemes: [],
  keyboardSizeScale: 1,
  isShiftActive: false,
  translateSourceLocale: null,
  translateTargetLocale: null,
  typedWord: '',
  suggestions: [],
  emojiSuggestion: null,
  isToolbarExpanded: false,
  learnedWords: [],
  learnFromTyping: true,
  adultGifsEnabled: false,
  oneHandedMode: 'off',
  isIncognito: false,
  isSensitiveField: false,
  isNumericField: false,
  numericFieldAllowsDecimal: false,
  numericFieldAllowsSign: false,
  clipboardHistory: [],
  recentGifs: [],
  lastSuggestion: null,
  numberRowEnabled: false,
  hinglishEnabled: true,
  keyStyle: DEFAULT_KEY_STYLE,
  swipeTypingEnabled: true,
  autoCorrectEnabled: true,
  autoCorrection: null,
  recentEmojis: [],
  wordPairs: {},
  previousWord: null,
  priorWord: null,
  hapticFeedbackEnabled: true,
  keySoundEnabled: false,
  swipeTypingTrailEnabled: true,
  keyFontFamily: null,
  toolbarOrder: ALL_TOOL_IDS,
  keyboardDimLevel: 0,

  setActiveLocale: locale => {
    set({activeLocale: locale});
    ThemeStorage.saveActiveLocale(locale);
  },

  setActivePanel: panel => set({activePanel: panel}),

  setTheme: theme => {
    set({theme});
    ThemeStorage.saveTheme(theme);
  },

  addCustomTheme: theme => {
    const updated = [theme, ...get().customThemes];
    set({customThemes: updated, theme});
    ThemeStorage.saveJSON(CUSTOM_THEMES_KEY, updated);
    ThemeStorage.saveTheme(theme);
  },

  deleteCustomTheme: id => {
    const removed = get().customThemes.find(t => t.id === id);
    if (removed?.backgroundImage) BackgroundImage.remove(removed.backgroundImage);
    const updated = get().customThemes.filter(t => t.id !== id);
    set({customThemes: updated});
    ThemeStorage.saveJSON(CUSTOM_THEMES_KEY, updated);
    // Falling back to the default theme if the one just deleted was active
    // avoids leaving the keyboard referencing a theme that no longer exists.
    if (get().theme.id === id) {
      get().setTheme(defaultTheme);
    }
  },


  setKeyboardSizeScale: scale => {
    set({keyboardSizeScale: scale});
    ThemeStorage.saveJSON(KEYBOARD_SIZE_SCALE_KEY, scale);
  },

  toggleShift: () => set({isShiftActive: !get().isShiftActive}),

  resetTypingSession: () =>
    set({
      previousWord: null,
      priorWord: null,
      typedWord: '',
      suggestions: [],
      autoCorrection: null,
      emojiSuggestion: null,
      lastSuggestion: null,
      isToolbarExpanded: false,
    }),
  setShiftActive: active => set({isShiftActive: active}),

  setTranslateSourceLocale: locale => {
    set({translateSourceLocale: locale});
    ThemeStorage.saveJSON(TRANSLATE_SOURCE_LOCALE_KEY, locale);
  },

  setTranslateTargetLocale: locale => {
    set({translateTargetLocale: locale});
    ThemeStorage.saveJSON(TRANSLATE_TARGET_LOCALE_KEY, locale);
  },

  setToolbarExpanded: expanded => set({isToolbarExpanded: expanded}),

  updateTypedWord: word => {
    const {activeLocale, learnedWords} = get();
    // Nothing typed yet (just finished a word, or deleted back to the
    // space): offer the words that usually follow the last one.
    if (!word) {
      set({
        typedWord: '',
        suggestions: predictNextWords(get().wordPairs, get().previousWord),
        autoCorrection: null,
        emojiSuggestion: null,
        isToolbarExpanded: false,
      });
      return;
    }
    const staticMatches = word ? getSuggestions(activeLocale, word) : [];
    const learnedMatches = word
      ? learnedWords.filter(
          w => w.toLowerCase().startsWith(word.toLowerCase()) && w.toLowerCase() !== word.toLowerCase(),
        )
      : [];
    // Learned words are what the user actually typed, so surface those
    // ahead of the fixed dictionary; de-dupe in case a learned word also
    // happens to be in the static list.
    let suggestions = [...new Set([...learnedMatches, ...staticMatches])].slice(0, 3);
    let autoCorrection: string | null = null;
    // Once what's typed so far no longer prefix-matches anything real (or
    // learned), it's stopped looking like a word-in-progress and started
    // looking like a typo - offer the closest one-edit-away real word as
    // a chip. Deliberately never applied silently: a plain frequency +
    // edit-distance match can't reliably tell "hello" from "help" (both
    // are one edit from "helo", and "help" is simply the more common word
    // overall) - only a real language model could, so the user always
    // confirms by tapping rather than risking a confidently wrong swap.
    if (word.length >= 3 && suggestions.length === 0) {
      const correction = getSpellingCorrection(activeLocale, word);
      if (correction) {
        // Match the typed word's own capitalization (e.g. a
        // sentence-start auto-capitalized "Helo") rather than flattening
        // it to the dictionary's lowercase form.
        const firstChar = word.charAt(0);
        suggestions = [
          firstChar !== firstChar.toLowerCase() ? correction.charAt(0).toUpperCase() + correction.slice(1) : correction,
        ];
        // Auto-correct applies the same fix on space - but not to an
        // all-caps word (likely an acronym) or one the user has typed
        // before and taught the keyboard.
        const isLearned = learnedWords.some(w => w.toLowerCase() === word.toLowerCase());
        if (word !== word.toUpperCase() && !isLearned) autoCorrection = suggestions[0];
      }
    }
    set({
      typedWord: word,
      suggestions,
      autoCorrection,
      emojiSuggestion: getEmojiSuggestion(word),
      // Each new word starts collapsed (suggestions shown, icons hidden)
      // again even if the user expanded the icon row for the last word -
      // only force this on a *cleared* word so mid-word expansion isn't
      // fought on every keystroke.
      isToolbarExpanded: word ? get().isToolbarExpanded : false,
    });
  },

  learnWord: word => {
    if (get().isIncognito || get().isSensitiveField || !get().learnFromTyping) {
      return;
    }
    const existing = get().learnedWords;
    const alreadyKnown = existing.some(w => w.toLowerCase() === word.toLowerCase());
    if (alreadyKnown) {
      return;
    }
    const updated = [word, ...existing].slice(0, MAX_LEARNED_WORDS);
    set({learnedWords: updated});
    ThemeStorage.saveJSON(LEARNED_WORDS_KEY, updated);
  },

  removeLearnedWord: word => {
    const updated = get().learnedWords.filter(w => w !== word);
    set({learnedWords: updated});
    ThemeStorage.saveJSON(LEARNED_WORDS_KEY, updated);
  },

  setLearnFromTyping: value => {
    set({learnFromTyping: value});
    ThemeStorage.saveJSON(LEARN_FROM_TYPING_KEY, value);
  },

  setAdultGifsEnabled: value => {
    set({adultGifsEnabled: value});
    ThemeStorage.saveJSON(ADULT_GIFS_ENABLED_KEY, value);
  },

  setOneHandedMode: mode => {
    set({oneHandedMode: mode});
    ThemeStorage.saveJSON(ONE_HANDED_MODE_KEY, mode);
  },

  setIncognito: value => set({isIncognito: value}),

  setSensitiveField: value => set({isSensitiveField: value}),

  setNumericField: (isNumeric, allowDecimal, allowSign) => {
    // Auto-switch in and back out of the numeric pad as focus moves
    // between fields - but only when the current panel is exactly the one
    // this feature owns either side of (plain keyboard <-> numericPad).
    // If the user has something else open (emoji, GIF, settings...) when
    // focus happens to move to/from a numeric field, leave that alone;
    // this isn't the feature that should be yanking them out of it.
    const current = get().activePanel;
    let nextPanel = current;
    if (isNumeric && current === 'keyboard') {
      nextPanel = 'numericPad';
    } else if (!isNumeric && current === 'numericPad') {
      nextPanel = 'keyboard';
    }
    set({
      isNumericField: isNumeric,
      numericFieldAllowsDecimal: allowDecimal,
      numericFieldAllowsSign: allowSign,
      activePanel: nextPanel,
    });
  },

  addClipboardEntry: text => {
    if (get().isIncognito || get().isSensitiveField || !text.trim()) {
      return;
    }
    const existing = get().clipboardHistory;
    if (existing[0]?.text === text) {
      return; // Same as the most recent entry - nothing changed.
    }
    const entry: ClipboardEntry = {id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, timestamp: Date.now()};
    const updated = [entry, ...existing].slice(0, MAX_CLIPBOARD_HISTORY);
    set({clipboardHistory: updated});
    ThemeStorage.saveJSON(CLIPBOARD_HISTORY_KEY, updated);
  },

  removeClipboardEntry: id => {
    const updated = get().clipboardHistory.filter(entry => entry.id !== id);
    set({clipboardHistory: updated});
    ThemeStorage.saveJSON(CLIPBOARD_HISTORY_KEY, updated);
  },

  clearClipboardHistory: () => {
    set({clipboardHistory: []});
    ThemeStorage.saveJSON(CLIPBOARD_HISTORY_KEY, []);
  },

  addRecentGif: entry => {
    if (get().isIncognito || get().isSensitiveField) {
      return;
    }
    const existing = get().recentGifs.filter(g => g.id !== entry.id);
    const updated = [entry, ...existing].slice(0, MAX_RECENT_GIFS);
    set({recentGifs: updated});
    ThemeStorage.saveJSON(RECENT_GIFS_KEY, updated);
  },

  clearRecentGifs: () => {
    set({recentGifs: []});
    ThemeStorage.saveJSON(RECENT_GIFS_KEY, []);
  },

  setLastSuggestion: value => set({lastSuggestion: value}),

  setNumberRowEnabled: value => {
    set({numberRowEnabled: value});
    ThemeStorage.saveJSON(NUMBER_ROW_ENABLED_KEY, value);
  },

  setHinglishEnabled: value => {
    set({hinglishEnabled: value});
    ThemeStorage.saveJSON(HINGLISH_ENABLED_KEY, value);
  },

  setSwipeTypingEnabled: value => {
    set({swipeTypingEnabled: value});
    ThemeStorage.saveJSON(SWIPE_TYPING_ENABLED_KEY, value);
  },

  setAutoCorrectEnabled: value => {
    set({autoCorrectEnabled: value});
    ThemeStorage.saveJSON(AUTO_CORRECT_ENABLED_KEY, value);
  },

  completeWord: (word, sentenceEnd = false) => {
    const state = get();
    const normalized = normalizeWord(word);
    // Learned like the word list: never in password fields or incognito,
    // and only if "learn from typing" is on.
    const mayLearn = !state.isIncognito && !state.isSensitiveField && state.learnFromTyping;
    let wordPairs = state.wordPairs;
    if (normalized && state.previousWord && mayLearn) {
      wordPairs = recordPair(wordPairs, state.previousWord, normalized);
      saveWordPairsSoon(wordPairs);
    }
    set({
      wordPairs,
      priorWord: state.previousWord,
      previousWord: normalized && !sentenceEnd && !endsSentence(word) ? normalized : null,
    });
    get().updateTypedWord('');
  },

  restorePreviousWord: () => {
    set({previousWord: get().priorWord});
  },

  addRecentEmoji: emoji => {
    const updated = [emoji, ...get().recentEmojis.filter(e => e !== emoji)].slice(0, MAX_RECENT_EMOJIS);
    set({recentEmojis: updated});
    ThemeStorage.saveJSON(RECENT_EMOJIS_KEY, updated);
  },

  setSwipeResult: (word, alternatives) =>
    set({
      typedWord: word,
      suggestions: alternatives.filter(alt => alt !== word).slice(0, 3),
      autoCorrection: null,
      emojiSuggestion: getEmojiSuggestion(word),
      isToolbarExpanded: false,
    }),

  setKeyStyle: patch => {
    const keyStyle = {...get().keyStyle, ...patch};
    set({keyStyle});
    ThemeStorage.saveJSON(KEY_STYLE_KEY, keyStyle);
  },

  setHapticFeedbackEnabled: value => {
    set({hapticFeedbackEnabled: value});
    ThemeStorage.saveJSON(HAPTIC_FEEDBACK_ENABLED_KEY, value);
  },

  setKeySoundEnabled: value => {
    set({keySoundEnabled: value});
    ThemeStorage.saveJSON(KEY_SOUND_ENABLED_KEY, value);
  },

  setSwipeTypingTrailEnabled: value => {
    set({swipeTypingTrailEnabled: value});
    ThemeStorage.saveJSON(SWIPE_TRAIL_ENABLED_KEY, value);
  },

  setKeyFontFamily: value => {
    set({keyFontFamily: value});
    ThemeStorage.saveJSON(KEY_FONT_FAMILY_KEY, value);
  },

  setToolbarOrder: order => {
    set({toolbarOrder: order});
    ThemeStorage.saveJSON(TOOLBAR_ORDER_KEY, order);
  },

  cycleKeyboardDim: () => {
    const next = (get().keyboardDimLevel + 1) % DIM_LEVELS.length;
    set({keyboardDimLevel: next});
    ThemeStorage.saveJSON(KEYBOARD_DIM_LEVEL_KEY, next);
  },


  hydrate: async () => {
    const [
      locale,
      storedTheme,
      learnedWords,
      oneHandedMode,
      clipboardHistory,
      recentGifs,
      learnFromTyping,
      customThemes,
      keyboardSizeScale,
      translateSourceLocale,
      translateTargetLocale,
      adultGifsEnabled,
      numberRowEnabled,
      hapticFeedbackEnabled,
      keySoundEnabled,
      swipeTypingTrailEnabled,
      keyFontFamily,
      toolbarOrder,
      keyboardDimLevel,
      hinglishEnabled,
      keyStyle,
      swipeTypingEnabled,
      autoCorrectEnabled,
      recentEmojis,
      wordPairs,
    ] = await Promise.all([
      ThemeStorage.loadActiveLocale(),
      ThemeStorage.loadTheme(),
      ThemeStorage.loadJSON<string[]>(LEARNED_WORDS_KEY, []),
      ThemeStorage.loadJSON<OneHandedMode>(ONE_HANDED_MODE_KEY, 'off'),
      ThemeStorage.loadJSON<ClipboardEntry[]>(CLIPBOARD_HISTORY_KEY, []),
      ThemeStorage.loadJSON<CachedGifEntry[]>(RECENT_GIFS_KEY, []),
      ThemeStorage.loadJSON<boolean>(LEARN_FROM_TYPING_KEY, true),
      ThemeStorage.loadJSON<KeyboardTheme[]>(CUSTOM_THEMES_KEY, []),
      ThemeStorage.loadJSON<number>(KEYBOARD_SIZE_SCALE_KEY, 1),
      ThemeStorage.loadJSON<string | null>(TRANSLATE_SOURCE_LOCALE_KEY, null),
      ThemeStorage.loadJSON<string | null>(TRANSLATE_TARGET_LOCALE_KEY, null),
      ThemeStorage.loadJSON<boolean>(ADULT_GIFS_ENABLED_KEY, false),
      ThemeStorage.loadJSON<boolean>(NUMBER_ROW_ENABLED_KEY, false),
      ThemeStorage.loadJSON<boolean>(HAPTIC_FEEDBACK_ENABLED_KEY, true),
      ThemeStorage.loadJSON<boolean>(KEY_SOUND_ENABLED_KEY, false),
      ThemeStorage.loadJSON<boolean>(SWIPE_TRAIL_ENABLED_KEY, true),
      ThemeStorage.loadJSON<string | null>(KEY_FONT_FAMILY_KEY, null),
      ThemeStorage.loadJSON<ToolId[]>(TOOLBAR_ORDER_KEY, ALL_TOOL_IDS),
      ThemeStorage.loadJSON<number>(KEYBOARD_DIM_LEVEL_KEY, 0),
      ThemeStorage.loadJSON<boolean>(HINGLISH_ENABLED_KEY, true),
      ThemeStorage.loadJSON<KeyStyle>(KEY_STYLE_KEY, DEFAULT_KEY_STYLE),
      ThemeStorage.loadJSON<boolean>(SWIPE_TYPING_ENABLED_KEY, true),
      ThemeStorage.loadJSON<boolean>(AUTO_CORRECT_ENABLED_KEY, true),
      ThemeStorage.loadJSON<string[]>(RECENT_EMOJIS_KEY, []),
      ThemeStorage.loadJSON<WordPairs>(WORD_PAIRS_KEY, {}),
    ]);
    set({
      // English switched from US to UK spelling (en-US -> en-GB); a saved
      // en-US would otherwise match no layout or word list.
      activeLocale: locale === 'en-US' ? 'en-GB' : locale,
      theme: storedTheme ?? defaultTheme,
      learnedWords,
      oneHandedMode,
      clipboardHistory,
      recentGifs,
      learnFromTyping,
      customThemes,
      keyboardSizeScale,
      translateSourceLocale,
      translateTargetLocale,
      adultGifsEnabled,
      numberRowEnabled,
      hapticFeedbackEnabled,
      keySoundEnabled,
      swipeTypingTrailEnabled,
      keyFontFamily,
      // A toolbar order saved before a tool existed (or from an older
      // build) could be missing ids or contain unknown ones - reconcile
      // against the current known set rather than trusting it blindly.
      toolbarOrder: reconcileToolbarOrder(toolbarOrder),
      keyboardDimLevel,
      hinglishEnabled,
      // Merged over the defaults so a style saved by an older build (fewer
      // fields) still gets every option.
      keyStyle: {...DEFAULT_KEY_STYLE, ...keyStyle},
      swipeTypingEnabled,
      autoCorrectEnabled,
      recentEmojis,
      wordPairs: wordPairs && typeof wordPairs === 'object' ? wordPairs : {},
    });
  },
}));

// Saving the whole pair table on every space would be a lot of writes while
// typing fast - wait for a pause.
let saveWordPairsTimer: ReturnType<typeof setTimeout> | null = null;
function saveWordPairsSoon(pairs: WordPairs) {
  if (saveWordPairsTimer) clearTimeout(saveWordPairsTimer);
  saveWordPairsTimer = setTimeout(() => {
    saveWordPairsTimer = null;
    ThemeStorage.saveJSON(WORD_PAIRS_KEY, pairs);
  }, 2000);
}

// Guards against a corrupt/outdated persisted order (unknown ids, a tool
// added since this was saved, duplicates) ever reaching the toolbar -
// worth doing once here rather than everywhere toolbarOrder is read.
function reconcileToolbarOrder(stored: ToolId[]): ToolId[] {
  const known = stored.filter((id, i) => ALL_TOOL_IDS.includes(id) && stored.indexOf(id) === i);
  const missing = ALL_TOOL_IDS.filter(id => !known.includes(id));
  return [...known, ...missing];
}
