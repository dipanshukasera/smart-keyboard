#!/usr/bin/env bash
# Builds a release APK of Smart Keyboard and copies it to the project root
# as smart-keyboard.apk, and (best-effort) rebuilds the backend Docker
# image so any gifProviders.js/.env changes actually take effect - the
# backend image bakes in `src/` at build time, so editing it or infra/.env
# alone does nothing until the image is rebuilt. See README.md "Building a
# release APK" for details.
#
# Usage:
#   ./build-apk.sh            # refresh backend + build APK + copy
#   ./build-apk.sh --install  # ...+ ensure an emulator is running + adb install -r
#
# --install auto-launches the project's AVD if no device/emulator is
# already connected (started before the build even begins, so its ~30-90s
# boot time overlaps with the Docker/Gradle steps instead of adding to the
# total wait) - no more "adb: no devices/emulators found" failures at the
# very end of an otherwise-successful build.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

EMULATOR_LOG="/tmp/smart-keyboard-emulator.log"

# --- Locate adb/emulator up front - needed as early as possible so
# --install can kick off an emulator boot before the build starts. ---
ADB_BIN="$(command -v adb || true)"
EMULATOR_BIN="$(command -v emulator || true)"
if [ -z "$ADB_BIN" ] || [ -z "$EMULATOR_BIN" ]; then
  SDK_DIR=""
  if [ -f "android-shell/local.properties" ]; then
    SDK_DIR="$(sed -n 's/^sdk.dir=//p' android-shell/local.properties)"
  fi
  for base in "$SDK_DIR" "/opt/homebrew/share/android-commandlinetools"; do
    if [ -z "$ADB_BIN" ] && [ -n "$base" ] && [ -x "$base/platform-tools/adb" ]; then
      ADB_BIN="$base/platform-tools/adb"
    fi
    if [ -z "$EMULATOR_BIN" ] && [ -n "$base" ] && [ -x "$base/emulator/emulator" ]; then
      EMULATOR_BIN="$base/emulator/emulator"
    fi
  done
fi

# Launches the project's AVD in the background if no device/emulator is
# already connected - returns immediately without waiting for it to
# finish booting (see wait_for_emulator_ready, called later right before
# install actually needs the device).
ensure_emulator_starting() {
  if [ -z "$ADB_BIN" ]; then
    echo "error: adb not found on PATH, in android-shell/local.properties's SDK, or the default Homebrew cask location - can't manage emulators." >&2
    echo "Add platform-tools to PATH, e.g.: export PATH=\"\$ANDROID_HOME/platform-tools:\$PATH\"" >&2
    exit 1
  fi
  if "$ADB_BIN" devices | awk 'NR>1 && $2=="device" {found=1} END {exit !found}'; then
    echo "==> Using already-connected device/emulator"
    return
  fi
  if [ -z "$EMULATOR_BIN" ]; then
    echo "error: no device/emulator connected and the 'emulator' binary wasn't found - can't auto-launch one." >&2
    echo "Add emulator to PATH, e.g.: export PATH=\"\$ANDROID_HOME/emulator:\$PATH\"" >&2
    exit 1
  fi
  # Prefer this project's own AVD if it's one of several available.
  local avd
  avd="$("$EMULATOR_BIN" -list-avds | grep -m1 -i "SmartKeyboard" || true)"
  if [ -z "$avd" ]; then
    avd="$("$EMULATOR_BIN" -list-avds | head -1)"
  fi
  if [ -z "$avd" ]; then
    echo "error: no AVDs found ('emulator -list-avds' returned nothing) - create one in Android Studio first." >&2
    exit 1
  fi
  echo "==> No device/emulator connected - launching AVD '$avd' in the background (log: $EMULATOR_LOG)"
  nohup "$EMULATOR_BIN" -avd "$avd" -netdelay none -netspeed full >"$EMULATOR_LOG" 2>&1 &
  disown
}

# Blocks until a device is present *and* has finished booting
# (sys.boot_completed=1) - only called right before install actually
# needs to talk to it, not right after launching it.
wait_for_emulator_ready() {
  echo "==> Waiting for device/emulator to finish booting..."
  "$ADB_BIN" wait-for-device
  local waited=0
  until [ "$("$ADB_BIN" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')" = "1" ]; do
    if [ "$waited" -ge 180 ]; then
      echo "error: device/emulator didn't finish booting within 180s - check $EMULATOR_LOG" >&2
      exit 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
  echo "==> Device/emulator ready"
}

if [ "${1:-}" = "--install" ]; then
  ensure_emulator_starting
fi

if [ -f "infra/docker-compose.yml" ]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "==> Rebuilding backend (picks up gifProviders.js / infra/.env changes)"
    if ! docker compose -f infra/docker-compose.yml up -d --build backend; then
      echo "warning: backend rebuild failed - continuing with the APK build anyway." >&2
    fi
  else
    echo "warning: Docker isn't running/installed - skipping backend rebuild." >&2
    echo "  Backend code/env changes won't take effect until you run:" >&2
    echo "  docker compose -f infra/docker-compose.yml up -d --build backend" >&2
  fi
fi

JAVA_HOME_CANDIDATE="/opt/homebrew/opt/openjdk@17"
if [ -z "${JAVA_HOME:-}" ] && [ -d "$JAVA_HOME_CANDIDATE" ]; then
  export JAVA_HOME="$JAVA_HOME_CANDIDATE"
fi
if [ -z "${JAVA_HOME:-}" ]; then
  echo "error: JAVA_HOME is not set and $JAVA_HOME_CANDIDATE was not found." >&2
  echo "Install JDK 17 (e.g. 'brew install openjdk@17') and export JAVA_HOME, then retry." >&2
  exit 1
fi

if [ ! -f "android-shell/local.properties" ]; then
  echo "error: android-shell/local.properties is missing (needs sdk.dir=<path to Android SDK>)." >&2
  exit 1
fi

echo "==> Building release APK (JAVA_HOME=$JAVA_HOME)"
(cd android-shell && ./gradlew assembleRelease)

BUILT_APK="android-shell/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$BUILT_APK" ]; then
  echo "error: expected APK not found at $BUILT_APK" >&2
  exit 1
fi

cp "$BUILT_APK" smart-keyboard.apk
echo "==> Copied to $SCRIPT_DIR/smart-keyboard.apk"

if [ "${1:-}" = "--install" ]; then
  wait_for_emulator_ready
  echo "==> Installing on connected device/emulator ($ADB_BIN)"
  "$ADB_BIN" install -r smart-keyboard.apk
fi

echo "Done."
