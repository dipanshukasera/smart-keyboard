# Smart Keyboard

A custom Android keyboard (IME) with a React Native UI, native Android host
shell, and a small backend for GIF search, translation, and theme sync.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit
together and [docs/IME_BRIDGE_PROTOCOL.md](docs/IME_BRIDGE_PROTOCOL.md) for
the JS↔native contract.

## Project layout

- `android-shell/` — native Android IME host (Java)
- `keyboard-ui/` — React Native keyboard UI
- `backend/node-service/` — Express/MongoDB backend
- `shared/` — JSON schemas shared between the RN app and backend
- `infra/` — docker-compose for local dev

## Running locally

```bash
# 1. Backend + MongoDB
cp backend/node-service/.env.example backend/node-service/.env
docker-compose -f infra/docker-compose.yml up

# 2. RN Metro bundler
cd keyboard-ui
npm install
npm start

# 3. Build and install the IME
cd ../android-shell
./gradlew installDebug
```

Then enable "Smart Keyboard" under Settings > System > Languages & input >
On-screen keyboard, and switch to it from any text field.

## Building a release APK

Quick path: `./build-apk.sh` (add `--install` to also `adb install -r` it on a
connected device/emulator). It does exactly the steps below and copies the
result to `smart-keyboard.apk` at the project root.

Requires JDK 17 and the Android SDK (`platform-tools`, a recent
`build-tools`/`platforms`, matching `android-shell/local.properties`'
`sdk.dir`). On macOS with Homebrew:

```bash
brew install openjdk@17 android-commandlinetools
```

`android-shell/local.properties` must point at your SDK install, e.g.:

```
sdk.dir=/opt/homebrew/share/android-commandlinetools
```

Then build:

```bash
cd keyboard-ui
npm install                 # only needed once / after dependency changes

cd ../android-shell
export JAVA_HOME=/opt/homebrew/opt/openjdk@17   # keg-only; not on PATH by default
./gradlew assembleRelease
```

This bundles the current RN JS (via `createBundleReleaseJsAndAssets`) into
the APK, so there's no separate "build the JS" step - `assembleRelease`
always packages whatever's currently in `keyboard-ui/src`.

The signed release APK is written to
`android-shell/app/build/outputs/apk/release/app-release.apk` (signed with
the debug keystore - fine for sideloading/testing, **not** for a Play Store
release). Copy it to the project root for convenience:

```bash
cp app/build/outputs/apk/release/app-release.apk ../smart-keyboard.apk
```

Install it on a connected device or running emulator:

```bash
adb install -r ../smart-keyboard.apk
```

To run the bash file
````
./build-apk.sh --install
```

`````
logs
docker compose -f infra/docker-compose.yml logs -f backend
`````