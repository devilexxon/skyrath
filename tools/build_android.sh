#!/usr/bin/env bash
# Build the Google Play bundle with Gradle. Run from the project root in Git Bash:
#   node tools/build_web.mjs android && bash tools/build_android.sh unsigned   -> build/aab/unsigned.aab
#   then sign it: powershell -ExecutionPolicy Bypass -File tools\android_key.ps1 sign
#   (or run without "unsigned" to sign here with jarsigner)
# Output: dist/release/Skyrath-v<ver>-GooglePlay.aab, uploaded to Google Play (app ID com.devilexxon.skyrath)
# The Play bundle is signed with your private upload key, kept OUTSIDE the project: D:\skyrath-keys\skyrath-upload.jks
# (override with SKYRATH_UPLOAD_KEY=...). jarsigner asks for its password, so run this in a terminal.
# Cloud save: put the Play Games project ID in android/gradle.properties (skyrath.gamesAppId=...).
# Needs JDK 17, Android SDK platform 36 + build-tools, in D:\skyrath-android-tools (or set SKYRATH_ANDROID_TOOLS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="${SKYRATH_ANDROID_TOOLS:-/d/skyrath-android-tools}"
JDK="$(ls -d $T/jdk-17* | head -1)"
export JAVA_HOME="$(cygpath -w "$JDK")"
export ANDROID_HOME="$(cygpath -w "$T/sdk")"
export PATH="$JDK/bin:$PATH"
KS="${SKYRATH_UPLOAD_KEY:-/d/skyrath-keys/skyrath-upload.jks}"
WEB="$ROOT/dist/web-android"
[ -f "$WEB/index.html" ] || { echo "run: node tools/build_web.mjs android first"; exit 1; }
VER="$(grep -o 'versionName=.*' "$ROOT/android/version.properties" | cut -d= -f2 | tr -d '\r')"
APP="$ROOT/android/app"

# the game files go into the app as assets/web/...
rm -rf "$APP/build/game-assets"; mkdir -p "$APP/build/game-assets"
cp -r "$WEB" "$APP/build/game-assets/web"

(cd "$ROOT/android" && ./gradlew --no-daemon -q bundleRelease)

mkdir -p "$ROOT/dist/release" "$ROOT/build/aab"
UNSIGNED="$ROOT/build/aab/unsigned.aab"
cp "$APP/build/outputs/bundle/release/app-release.aab" "$UNSIGNED"
echo "Play bundle (unsigned): $UNSIGNED"

if [ "${1:-}" = "unsigned" ]; then exit 0; fi
OUT="$ROOT/dist/release/Skyrath-v$VER-GooglePlay.aab"
[ -f "$KS" ] || { echo "upload key not found: $KS"; exit 1; }
jarsigner -keystore "$(cygpath -w "$KS")" -sigalg SHA256withRSA -digestalg SHA-256 -signedjar "$(cygpath -w "$OUT")" "$(cygpath -w "$UNSIGNED")" upload
jarsigner -verify "$(cygpath -w "$OUT")" | tail -1
ls -la "$OUT"
