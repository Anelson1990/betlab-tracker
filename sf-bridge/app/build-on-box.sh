#!/usr/bin/env bash
# Build the SpiderFoot Phone APK on a Linux box (June's). Skips the Android SDK
# install when it's already present (June's egress proxy breaks sdkmanager's Java
# tunneling). Force-skip with SKIP_SDKMANAGER=1.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
GRADLE_VERSION="${GRADLE_VERSION:-8.9}"
CMDLINE_ZIP_URL="${CMDLINE_ZIP_URL:-https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip}"

command -v java >/dev/null || { echo "Install a JDK 17+."; exit 1; }
command -v unzip >/dev/null || { echo "Install unzip."; exit 1; }

sdk_ready() {
  [ -f "$ANDROID_HOME/platforms/android-34/android.jar" ] &&
    ls "$ANDROID_HOME"/build-tools/*/aapt2 >/dev/null 2>&1 &&
    { [ -x "$ANDROID_HOME/platform-tools/adb" ] || command -v adb >/dev/null 2>&1; }
}
if [ "${SKIP_SDKMANAGER:-}" = "1" ] || sdk_ready; then
  echo "Android SDK already present at $ANDROID_HOME — skipping cmdline-tools + sdkmanager."
else
  if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
    mkdir -p "$ANDROID_HOME/cmdline-tools"; tmp="$(mktemp -d)"
    curl -fSL "$CMDLINE_ZIP_URL" -o "$tmp/c.zip"; unzip -q "$tmp/c.zip" -d "$tmp"
    rm -rf "$ANDROID_HOME/cmdline-tools/latest"; mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"; rm -rf "$tmp"
  fi
  SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
  yes | "$SDKMANAGER" --licenses >/dev/null || true
  "$SDKMANAGER" "platform-tools" "platforms;android-34" "build-tools;34.0.0"
fi

GRADLE_BIN="$(command -v gradle || true)"
if [ -z "$GRADLE_BIN" ]; then
  if [ ! -x "$HERE/.gradle-dist/gradle-$GRADLE_VERSION/bin/gradle" ]; then
    mkdir -p "$HERE/.gradle-dist"
    curl -fSL "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip" -o "$HERE/.gradle-dist/g.zip"
    unzip -q "$HERE/.gradle-dist/g.zip" -d "$HERE/.gradle-dist"; rm -f "$HERE/.gradle-dist/g.zip"
  fi
  GRADLE_BIN="$HERE/.gradle-dist/gradle-$GRADLE_VERSION/bin/gradle"
fi

echo "sdk.dir=$ANDROID_HOME" > "$HERE/local.properties"
cd "$HERE"
"$GRADLE_BIN" :app:assembleDebug

APK="$HERE/app/build/outputs/apk/debug/app-debug.apk"
echo
echo "APK: $APK"
echo "Install: adb install -r '$APK'  — then open 'SpiderFoot', enter the bridge URL"
echo "(http://<box-tailscale-ip>:8600) and the token in the page."
