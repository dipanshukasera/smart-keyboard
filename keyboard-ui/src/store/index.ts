import {create} from 'zustand';
import type {KeyboardTheme} from '../themes/themeTypes';
import {defaultTheme} from '../themes/default';
import {ThemeStorage} from '../native-bridge/ThemeStorage';
import {getSuggestions, getSpellingCorrection} from '../services/dictionary';
import type {LayoutStyle} from '../layouts/layoutStyles';

export type PanelType =
  | 'keyboard'
  | 'emoji'
  | 'gif'
  | 'symbols'
  | 'themeCustomizer'
  | 'clipboard'
  | 'learnedWords'
  | 'numericPad'
  | 'translate';
export type OneHandedMode = 'off' | 'left' | 'right';

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
const LAYOUT_STYLE_KEY = 'layout_style';
const CUSTOM_THEMES_KEY = 'custom_themes';
const KEYBOARD_SIZE_SCALE_KEY = 'keyboard_size_scale';
const TRANSLATE_SOURCE_LOCALE_KEY = 'translate_source_locale';
const TRANSLATE_TARGET_LOCALE_KEY = 'translate_target_locale';

interface KeyboardState {
  activeLocale: string;
  activePanel: PanelType;
  theme: KeyboardTheme;
  customThemes: KeyboardTheme[];
  layoutStyle: LayoutStyle;
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
  isToolbarExpanded: boolean;
  // Words the user has actually typed, folded into suggestions alongside
  // the fixed dictionary - Gboard calls this its "personal dictionary".
  learnedWords: string[];
  // Master switch: when off, nothing is ever learned regardless of
  // incognito - a persistent opt-out rather than incognito's
  // session-scoped one.
  learnFromTyping: boolean;
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

  setActiveLocale: (locale: string) => void;
  setActivePanel: (panel: PanelType) => void;
  setTheme: (theme: KeyboardTheme) => void;
  addCustomTheme: (theme: KeyboardTheme) => void;
  deleteCustomTheme: (id: string) => void;
  setLayoutStyle: (style: LayoutStyle) => void;
  setKeyboardSizeScale: (scale: number) => void;
  toggleShift: () => void;
  setShiftActive: (active: boolean) => void;
  setTranslateSourceLocale: (locale: string | null) => void;
  setTranslateTargetLocale: (locale: string | null) => void;
  setToolbarExpanded: (expanded: boolean) => void;
  updateTypedWord: (word: string) => void;
  learnWord: (word: string) => void;
  removeLearnedWord: (word: string) => void;
  setLearnFromTyping: (value: boolean) => void;
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
  hydrate: () => Promise<void>;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  activeLocale: 'en-US',
  activePanel: 'keyboard',
  theme: defaultTheme,
  customThemes: [],
  layoutStyle: 'qwerty',
  keyboardSizeScale: 1,
  isShiftActive: false,
  translateSourceLocale: null,
  translateTargetLocale: null,
  typedWord: '',
  suggestions: [],
  isToolbarExpanded: false,
  learnedWords: [],
  learnFromTyping: true,
  oneHandedMode: 'off',
  isIncognito: false,
  isSensitiveField: false,
  isNumericField: false,
  numericFieldAllowsDecimal: false,
  numericFieldAllowsSign: false,
  clipboardHistory: [],
  recentGifs: [],
  lastSuggestion: null,

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
    const updated = get().customThemes.filter(t => t.id !== id);
    set({customThemes: updated});
    ThemeStorage.saveJSON(CUSTOM_THEMES_KEY, updated);
    // Falling back to the default theme if the one just deleted was active
    // avoids leaving the keyboard referencing a theme that no longer exists.
    if (get().theme.id === id) {
      get().setTheme(defaultTheme);
    }
  },

  setLayoutStyle: style => {
    set({layoutStyle: style});
    ThemeStorage.saveJSON(LAYOUT_STYLE_KEY, style);
  },

  setKeyboardSizeScale: scale => {
    set({keyboardSizeScale: scale});
    ThemeStorage.saveJSON(KEYBOARD_SIZE_SCALE_KEY, scale);
  },

  toggleShift: () => set({isShiftActive: !get().isShiftActive}),
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
      }
    }
    set({
      typedWord: word,
      suggestions,
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

  hydrate: async () => {
    const [
      locale,
      storedTheme,
      learnedWords,
      oneHandedMode,
      clipboardHistory,
      recentGifs,
      learnFromTyping,
      layoutStyle,
      customThemes,
      keyboardSizeScale,
      translateSourceLocale,
      translateTargetLocale,
    ] = await Promise.all([
      ThemeStorage.loadActiveLocale(),
      ThemeStorage.loadTheme(),
      ThemeStorage.loadJSON<string[]>(LEARNED_WORDS_KEY, []),
      ThemeStorage.loadJSON<OneHandedMode>(ONE_HANDED_MODE_KEY, 'off'),
      ThemeStorage.loadJSON<ClipboardEntry[]>(CLIPBOARD_HISTORY_KEY, []),
      ThemeStorage.loadJSON<CachedGifEntry[]>(RECENT_GIFS_KEY, []),
      ThemeStorage.loadJSON<boolean>(LEARN_FROM_TYPING_KEY, true),
      ThemeStorage.loadJSON<LayoutStyle>(LAYOUT_STYLE_KEY, 'qwerty'),
      ThemeStorage.loadJSON<KeyboardTheme[]>(CUSTOM_THEMES_KEY, []),
      ThemeStorage.loadJSON<number>(KEYBOARD_SIZE_SCALE_KEY, 1),
      ThemeStorage.loadJSON<string | null>(TRANSLATE_SOURCE_LOCALE_KEY, null),
      ThemeStorage.loadJSON<string | null>(TRANSLATE_TARGET_LOCALE_KEY, null),
    ]);
    set({
      activeLocale: locale,
      theme: storedTheme ?? defaultTheme,
      learnedWords,
      oneHandedMode,
      clipboardHistory,
      recentGifs,
      learnFromTyping,
      layoutStyle,
      customThemes,
      keyboardSizeScale,
      translateSourceLocale,
      translateTargetLocale,
    });
  },
}));
