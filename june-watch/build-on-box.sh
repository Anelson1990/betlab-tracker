#!/usr/bin/env bash
# Build the June Watch Companion APKs on June's always-on Linux box.
#
# This box can reach dl.google.com (the cloud build seat can't), so it installs
# the Android SDK command-line tools, pulls Gradle, and builds BOTH apps together
# — same debug key — which the Wear Data Layer requires to pair the watch + phone.
#
#   bash build-on-box.sh
#
# Env overrides: ANDROID_HOME (default ~/android-sdk), GRADLE_VERSION (default 8.9),
#   CMDLINE_ZIP_URL (if the default command-line-tools link 404s, get the current
#   "Command line tools only" URL from developer.android.com/studio and pass it here).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
GRADLE_VERSION="${GRADLE_VERSION:-8.9}"
CMDLINE_ZIP_URL="${CMDLINE_ZIP_URL:-https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip}"

# 0. JDK 17+ (AGP 8.5 needs it).
command -v java >/dev/null || { echo "Install a JDK 17+ first (e.g. apt install openjdk-17-jdk)."; exit 1; }
JV="$(java -version 2>&1 | head -1 | grep -oE '[0-9]+' | head -1)"
[ "${JV:-0}" -ge 17 ] || { echo "Java ${JV:-?} too old — need 17+."; exit 1; }
command -v unzip >/dev/null || { echo "Install unzip first (apt install unzip)."; exit 1; }

# 1. Android SDK command-line tools.
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Installing Android command-line tools into $ANDROID_HOME ..."
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  tmp="$(mktemp -d)"
  curl -fSL "$CMDLINE_ZIP_URL" -o "$tmp/cmdline.zip"
  unzip -q "$tmp/cmdline.zip" -d "$tmp"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

# 2. SDK packages + licenses.
yes | "$SDKMANAGER" --licenses >/dev/null || true
"$SDKMANAGER" "platform-tools" "platforms;android-34" "build-tools;34.0.0"

# 3. Gradle (use system gradle if present, else download once).
GRADLE_BIN="$(command -v gradle || true)"
if [ -z "$GRADLE_BIN" ]; then
  if [ ! -x "$HERE/.gradle-dist/gradle-$GRADLE_VERSION/bin/gradle" ]; then
    echo "Downloading Gradle $GRADLE_VERSION ..."
    mkdir -p "$HERE/.gradle-dist"
    curl -fSL "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip" -o "$HERE/.gradle-dist/g.zip"
    unzip -q "$HERE/.gradle-dist/g.zip" -d "$HERE/.gradle-dist"
    rm -f "$HERE/.gradle-dist/g.zip"
  fi
  GRADLE_BIN="$HERE/.gradle-dist/gradle-$GRADLE_VERSION/bin/gradle"
fi

# 4. Point the project at the SDK (machine-specific, gitignored).
echo "sdk.dir=$ANDROID_HOME" > "$HERE/local.properties"

# 5. Build BOTH apps together so they share one debug key -> they pair.
cd "$HERE"
"$GRADLE_BIN" :phone:assembleDebug :wear:assembleDebug

PHONE_APK="$HERE/phone/build/outputs/apk/debug/phone-debug.apk"
WATCH_APK="$HERE/wear/build/outputs/apk/debug/wear-debug.apk"
echo
echo "=== APKs built ==="
echo "  phone: $PHONE_APK"
echo "  watch: $WATCH_APK"
echo
echo "Install (Austin's tap — nothing installs without his OK):"
echo "  phone:  adb install -r '$PHONE_APK'"
echo "  watch:  adb connect <watch-ip>:<port>   # June's ADB-over-WiFi door"
echo "          adb -s <watch-ip>:<port> install -r '$WATCH_APK'"
