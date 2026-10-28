# Smart Keyboard: project reference

Written so the project can be picked up cold. For design detail see `ARCHITECTURE.md` and `IME_BRIDGE_PROTOCOL.md` in this folder.

## What it is
An Android keyboard (IME). React Native 0.75.4 (old architecture, Hermes) renders the UI inside a native Java shell. A Node/Express backend supplies GIFs and AI features.

- Repo: `github.com/dipanshukasera/smart-keyboard` (public)
- Landing page and download: https://dipanshukasera.github.io/smart-keyboard/ (the Download button serves `smart-keyboard.apk` directly)
- Backend: https://smart-keyboard-backend.onrender.com (`backend/node-service`, Render, auto-deploys on push to `main`)
- Package id: `com.yourco.keyboard`, IME service `com.yourco.keyboard/.ImeService`
- Current release: v1.0.9 (versionCode 10009)

## Layout
- `android-shell/`: native Java shell. `InputConnectionBridge.java` (typing/delete bridge), `BackgroundImageModule.java` (theme image download, system accent), `app/build.gradle` (version, signing).
- `keyboard-ui/src/`: the RN UI. `App.tsx`, `components/`, `layouts/*.json` + `layouts/registry.ts` (language packs), `store/index.ts` (zustand), `services/hinglishLocal.ts`, `hooks/`, `themes/gallery.ts`, `data/animatedEmoji.json`.
- `backend/node-service/`: Express API. `render.yaml` at the root.
- `docs/`: landing page, branding, and `docs/themes/**` (CC0 gallery pictures that the app downloads from the Pages site).
- `.github/workflows/`: `pages.yml` (builds the site and pulls the latest release APK into it), `keep-warm.yml` (pings the backend so Render stays awake).
- `build-apk.sh`: builds the release APK to `./smart-keyboard.apk` (git-ignored).

## Features built
52-language pack picker (All tools, Languages); symbols tray same height as the letter keyboard; animated emoji tab, with one-press emoji delete; phone-style number pad; selection-aware delete; one-tap suggestion chips; on-device Hinglish matcher for instant Hindi chips; toolbar tools on/off switches and reorder, with the settings gear pinned left; themes gallery (defaults, colors, downloadable landscapes and gradients, auto system/dynamic themes); faster GIFs (server response cache, on-phone search cache, tag prefetch).

## Release routine (after any change)
1. Commit and push to `main`.
2. `./build-apk.sh`
3. `gh release upload v1.0.9 smart-keyboard.apk --clobber` (use the next tag for a new version)
4. `gh workflow run pages.yml`, then wait for it to finish. The page caches for about 10 minutes.
5. Check that the release asset and the page download have the same size.

Commits: do not add Claude / Co-Authored-By attribution (owner's standing rule).

## Signing: read this before touching it
- Release builds are signed with the **Android debug key**. `app/build.gradle` reads `~/.smart-keyboard-signing/keystore.properties` and falls back to the debug keystore when that file is absent. The file is currently renamed `keystore.properties.off` on purpose.
- Why: a private key was tried on 26-27 Oct 2026. Android refuses an update signed with a different key (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, shown on phones as "package conflicts with an existing package"). Phones that had the private-key build had to uninstall once.
- Do not switch keys again unless you accept that every install must be uninstalled first.
- The private keystores (RSA-2048 and RSA-4096 backups) stay in `~/.smart-keyboard-signing/`. Not used. Never commit them.
- Other install error seen: "package appears to be invalid". It was a partial or stale download (the Pages download can drop on mobile data) or an older build. Check the downloaded size is the full 68.65 MB.

## Test and debug notes
- adb: `/opt/homebrew/share/android-commandlinetools/platform-tools`. `JAVA_HOME=/opt/homebrew/opt/openjdk@17`. apksigner in build-tools 34.0.0.
- Check a signature: `apksigner verify --print-certs -v smart-keyboard.apk`. The expected signer is `CN=Android Debug`.
- Installing an APK resets the selected keyboard: run `adb shell ime enable com.yourco.keyboard/.ImeService` and `adb shell ime set com.yourco.keyboard/.ImeService`.
- With two devices, use `adb -s <serial>`. A wrapper like `adb -s X` must be a shell function, not a quoted variable.
- Realme phones may wait for an on-screen confirmation on USB installs.
- Don't use the React Native `<Switch>` in the IME (it crashes); use `PillToggle`.
- Test deletion with the keyboard's own delete key, not `adb KEYCODE_DEL`, which desynchronises the typed-word state. The first delete after a suggestion chip undoes the chip swap.
- On the emulator, memory hangs are fixed by force-stopping and restarting the keyboard process.
- On macOS use python or `sed -i ''`; plain `sed -i` fails.

## Open items
- Other phones still on the private-key build need one uninstall.
- Typing was confirmed working on the Realme RMX3840 (Android 16) after the clean install.
