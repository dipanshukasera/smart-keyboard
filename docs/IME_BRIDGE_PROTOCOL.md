# JS ↔ Native Bridge Protocol

The RN app never touches Android APIs directly. It calls native
modules, registered in
`android-shell/.../KeyboardBridgePackage.java` and wrapped with typed
JS clients in `keyboard-ui/src/native-bridge/`. Keep this document, the
Java implementations, and the TS wrappers in sync when the contract changes.

## InputConnectionBridge

Native: `android-shell/app/src/main/java/com/yourco/keyboard/InputConnectionBridge.java`
JS: `keyboard-ui/src/native-bridge/InputConnection.ts`

Reads/writes the `InputConnection` of whichever text field currently has
focus, via `InputConnectionHolder` (updated on every `onStartInput` in
`ImeService` - not just `onStartInputView`, which only fires when the IME's
*view* needs to reappear and is skipped when tapping between fields on the
same screen while the keyboard stays continuously visible; cleared on
`onFinishInputView`).

| Method | Args | Returns | Notes |
|---|---|---|---|
| `commitText` | `text: string` | — | Inserts text at the cursor. |
| `deleteBackward` | `count: number` | — | Deletes `count` chars before the cursor. |
| `sendEnter` | — | — | Calls `performEditorAction` for the field's declared action (search/send/go/done/next) instead of a literal KEYCODE_ENTER whenever one is declared and `IME_FLAG_NO_ENTER_ACTION` isn't set - matches what a real enter/search/send key does; falls back to a literal ENTER down+up pair for plain multi-line fields. |
| `getTextBeforeCursor` | `length: number` | `Promise<string>` | Used by the translation bar and autocomplete. |
| `setSelection` | `start: number, end: number` | — | Absolute-offset selection; used by the hold-backspace-to-select gesture (see `getCursorPosition`). |
| `getImeAction` | — | `Promise<'search'\|'send'\|'go'\|'done'\|'next'\|'unspecified'>` | Lets `KeyboardLayout` swap the enter key's icon to match (a search box gets a magnifying glass, not a generic arrow), mirroring Gboard. |
| `getCursorPosition` | — | `Promise<number>` | Chars before the cursor, capped at 1000. Lets JS turn a drag distance into an absolute `setSelection` range without knowing the field's total length. |
| `deleteSelection` | — | — | Deletes whatever `setSelection` currently has selected (`commitText("", 1)` under the hood - the standard "replace selection" idiom). |
| `moveCursor` | `direction: number` | — | Sends a real `KEYCODE_DPAD_LEFT`/`RIGHT` key event (negative = left) rather than computing offsets, so the target app's own bounds-checking applies. Backs spacebar-drag cursor control. |
| `isPasswordField` | — | `Promise<boolean>` | One-shot check of the currently focused field's `EditorInfo.inputType`. The live-updating version is the `onInputFieldChanged` device event (see below), which is what the store actually listens to. |

If there is no focused field (`InputConnectionHolder.get()` returns `null`),
every method is a silent no-op rather than throwing — a dropped keystroke is
recoverable, a crashed keyboard is not.

## ClipboardModule

Native: `android-shell/app/src/main/java/com/yourco/keyboard/ClipboardModule.java`

| Method | Args | Returns | Notes |
|---|---|---|---|
| `getClipboardText` | — | `Promise<string>` | Empty string if clipboard is empty. |
| `setClipboardText` | `text: string` | — | Used by GifStickerPanel to copy a GIF URL. |
| `keyPressHaptic` | — | — | 12ms one-shot vibration; called per keypress from the UI layer if enabled. |

## ThemeStorageModule

Native: `android-shell/app/src/main/java/com/yourco/keyboard/ThemeStorageModule.java`
JS: `keyboard-ui/src/native-bridge/ThemeStorage.ts`

Persists to `SharedPreferences` (not RN's own storage) so the active theme
and locale are readable immediately on IME startup, before the RN instance
has finished booting.

| Method | Args | Returns | Notes |
|---|---|---|---|
| `saveTheme` | `themeJson: string` | — | JSON-serialized `KeyboardTheme`. |
| `loadTheme` | — | `Promise<string \| null>` | `null` if never set; caller falls back to `defaultTheme`. |
| `saveActiveLocale` | `locale: string` | — | e.g. `"en-US"`. |
| `loadActiveLocale` | — | `Promise<string>` | Defaults to `"en-US"` if never set. |

## KeyboardSizeModule

Native: `android-shell/app/src/main/java/com/yourco/keyboard/KeyboardSizeModule.java`

The IME window's height is forced natively (see `KeyboardReactView`'s
`onMeasure` override) rather than left to auto-measurement, which doesn't
reliably shrink to content in this embedding. `App.tsx` measures its own
real content via an inner `onLayout` wrapper and reports it here so the
window can resize to match whatever's actually on screen (main keys vs.
symbols vs. GIF search-typing all have different natural heights).

| Method | Args | Returns | Notes |
|---|---|---|---|
| `reportContentHeight` | `heightDp: number` | — | Clamped native-side to [20%, 55%] of screen height as a sanity bound. |

## GifCommitModule

Native: `android-shell/app/src/main/java/com/yourco/keyboard/GifCommitModule.java`
JS: `keyboard-ui/src/native-bridge/GifCommit.ts`

Sends a GIF into the focused field via `InputConnection.commitContent`
(through `InputConnectionCompat`/`InputContentInfoCompat` so it degrades
gracefully below API 25) instead of just a clipboard-pasted URL, which most
chat apps (Instagram DMs included) don't accept as an actual GIF. The
target field has to opt in by declaring an accepted content MIME type in
its `EditorInfo` - not every text field does, which is what
`isRichContentSupported` checks before bothering to download anything.

| Method | Args | Returns | Notes |
|---|---|---|---|
| `isRichContentSupported` | — | `Promise<boolean>` | Checks the focused field's `EditorInfo.contentMimeTypes` for `image/gif` or `image/*`. |
| `commitGif` | `remoteUrl: string` | `Promise<boolean>` | Downloads to `cacheDir/gifs/<sha1>.gif`, wraps it via the app's `FileProvider`, and commits it. Accepts a local `file://` URI too (skips the download) - that's how Recently Used entries get re-sent. Resolves `false` (doesn't reject) when unsupported or the field/connection is gone, so `GifStickerPanel` can fall back to `ClipboardModule.setClipboardText`. |
| `cacheGif` | `remoteUrl: string` | `Promise<string>` | Downloads (or reuses) a cached copy and resolves a local `file://` URI - backs the offline "Recently Used" section; doesn't require an accepted-content field the way `commitGif` does, since it's just caching, not sending. |

## Field-focus change event

Native: `android-shell/app/src/main/java/com/yourco/keyboard/KeyboardReactView.java`
(registered via `InputConnectionHolder.setOnFieldChanged`)

Unlike every method above, this is a `DeviceEventEmitter` event, not a
bridge call - it fires from the native side on every `onStartInput` (i.e.
every time focus moves to a different field, including between fields on
the same screen with the keyboard staying continuously visible - see the
`InputConnectionBridge` note above about why `onStartInputView` alone isn't
enough), not just once at RN mount time, which a one-shot `@ReactMethod`
call from JS could never do on its own.

| Event | Payload | Notes |
|---|---|---|
| `onInputFieldChanged` | `{isPasswordField: boolean, isNumericField: boolean, allowDecimal: boolean, allowSign: boolean}` | The store's `setSensitiveField`/`setNumericField` mirror this. Password fields get the same treatment as incognito (no learning, no clipboard/GIF history capture, no suggestion strip) automatically. Numeric fields (`TYPE_CLASS_NUMBER`/`PHONE`/`DATETIME`) auto-switch the panel to `NumericPanel` instead of the letter keyboard - `allowDecimal`/`allowSign` come from `TYPE_NUMBER_FLAG_DECIMAL`/`SIGNED` and control whether NumericPanel shows a "." or "-" key. |

## Adding a new method

1. Add the `@ReactMethod` to the relevant Java module.
2. Add the matching entry to the TS interface + wrapper in
   `keyboard-ui/src/native-bridge/`.
3. Update the table above.
4. If the method is called from more than one component, prefer routing it
   through `store/index.ts` rather than importing the bridge module
   directly in multiple places.
