# Architecture

## Overview

Smart Keyboard is a custom Android input method (IME) whose UI and logic run
in React Native, hosted inside a minimal native Android shell.

```
┌─────────────────────────────────────────────┐
│ Android OS                                   │
│  ┌─────────────────────────────────────────┐ │
│  │ android-shell (Java)                     │ │
│  │  ImeService (InputMethodService)         │ │
│  │   └─ KeyboardReactView                   │ │
│  │        └─ ReactRootView ── hosts ──┐     │ │
│  └─────────────────────────────────────┼─────┘ │
│                                        │       │
│  ┌─────────────────────────────────────▼─────┐ │
│  │ keyboard-ui (React Native)                │ │
│  │  App.tsx → KeyboardLayout / EmojiPanel /  │ │
│  │  GifStickerPanel / SymbolsNumberPanel /   │ │
│  │  ThemeCustomizer / TranslationBar         │ │
│  └───────────────┬────────────────────────────┘ │
└──────────────────┼──────────────────────────────┘
                    │ HTTPS (services/api.ts)
          ┌─────────▼──────────┐
          │ backend/node-service │
          │  Express + MongoDB    │
          │  (gif, translate,      │
          │   theme, user routes)  │
          └────────────────────────┘
```

## Why this split

- **android-shell** only implements what RN fundamentally cannot: the
  `InputMethodService` lifecycle, and OS-level APIs (clipboard, haptics,
  SharedPreferences) exposed to JS as native modules. It intentionally
  contains no keyboard UI or layout logic.
- **keyboard-ui** owns everything a user sees or types: layouts, panels,
  theming, and the on-device dictionary. It talks to native code only through
  the two modules in `native-bridge/` (see
  [IME_BRIDGE_PROTOCOL.md](./IME_BRIDGE_PROTOCOL.md)).
- **backend/node-service** exists only for things that need a server: GIF
  search (provider keys must not ship in the client), translation fallback
  (Google Cloud Translate key, same reason), and cross-device sync of
  user themes.

## Key flows

- **Typing a character**: `KeyboardLayout` → `InputConnection.commitText` →
  `InputConnectionBridge` (native) → the currently focused app's
  `InputConnection`.
- **Switching language**: `LanguageSwitcher` updates `activeLocale` in the
  Zustand store, which re-selects the matching JSON file in
  `keyboard-ui/src/layouts/` and persists the choice via
  `ThemeStorageModule`.
- **Predictive text**: `services/dictionary.ts` runs entirely on-device
  (no network) so suggestions appear with no latency as the user types.
- **Translation**: `TranslationBar` reads text before the cursor via
  `InputConnection.getTextBeforeCursor`, then calls the backend's
  `/api/translate`, which proxies Google Cloud Translate.
- **GIFs/stickers**: `GifStickerPanel` calls `/api/gif/search`, which proxies
  whichever provider `GIF_PROVIDER` selects (Tenor, Giphy, or a RapidAPI-
  hosted GIF search - see `services/gifProviders.js`). Selecting a result
  copies its URL to the clipboard rather than inserting rich content
  directly, since most host apps don't accept `InputConnection.commitContent`
  from third-party IMEs.

## Local dev

1. `docker-compose -f infra/docker-compose.yml up` — starts MongoDB and the
   backend.
2. `cd keyboard-ui && npm install && npm start` — Metro bundler.
3. `cd android-shell && ./gradlew installDebug` — builds and installs the
   IME APK; enable it under Settings > System > Languages & input.
