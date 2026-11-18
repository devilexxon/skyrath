#!/usr/bin/env bash
# Build the Google Play bundle: dist/release/Skyrath-v<ver>-GooglePlay.aab (app ID com.devilexxon.skyrath),
# signed with your private upload key. Run from the project root in Git Bash:
#   node tools/build_web.mjs android && bash tools/build_aab.sh
# Step 1 builds an unsigned bundle; step 2 signs it (jarsigner asks for the upload key password, so run it in a terminal).
#   bash tools/build_aab.sh          -> build and sign
#   bash tools/build_aab.sh unsigned -> build only (for checking)
# The upload key lives OUTSIDE the project and is never committed: D:\skyrath-keys\skyrath-upload.jks
# (override with SKYRATH_UPLOAD_KEY=/path/to/key.jks). Needs JDK 17, Android SDK build-tools 36.1 / platform 36
# and bundletool, all in D:\skyrath-android-tools.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T=/d/skyrath-android-tools
JDK="$(ls -d $T/jdk-17* | head -1)"
export JAVA_HOME="$(cygpath -w "$JDK")"
export PATH="$JDK/bin:$PATH"
BT="$T/sdk/build-tools/36.1.0"
PLAT="$(cygpath -w "$T/sdk/platforms/android-36/android.jar")"
BUNDLETOOL="$(cygpath -w "$(ls $T/bundletool-all-*.jar | tail -1)")"
APP_ID="com.devilexxon.skyrath"
KS="${SKYRATH_UPLOAD_KEY:-/d/skyrath-keys/skyrath-upload.jks}"
B="$ROOT/build/aab"
WEB="$ROOT/dist/web-android"
[ -f "$WEB/index.html" ] || { echo "run: node tools/build_web.mjs android first"; exit 1; }
VER="$(grep -o 'versionName="[^"]*"' "$ROOT/android/AndroidManifest.xml" | cut -d'"' -f2)"
mkdir -p "$ROOT/dist/release"
UNSIGNED="$B/unsigned.aab"
OUT="$ROOT/dist/release/Skyrath-v$VER-GooglePlay.aab"
w() { cygpath -w "$1"; }

rm -rf "$B"; mkdir -p "$B/classes" "$B/module/manifest" "$B/module/dex" "$B/module/assets"

# resources and manifest in the protobuf format bundles use; the Play app gets its own ID
"$BT/aapt2.exe" compile --dir "$(w "$ROOT/android/res")" -o "$(w "$B/res.zip")"
"$BT/aapt2.exe" link --proto-format -o "$(w "$B/base.apk")" -I "$PLAT" --manifest "$(w "$ROOT/android/AndroidManifest.xml")" \
  --rename-manifest-package "$APP_ID" --min-sdk-version 24 --target-sdk-version 36 "$(w "$B/res.zip")"

# code
javac -nowarn -source 8 -target 8 -cp "$PLAT" -d "$(w "$B/classes")" "$(w "$ROOT/android/src/com/skyrath/game/MainActivity.java")" 2>&1 | grep -v "warning:" || true
(cd "$B/classes" && "$BT/d8.bat" --lib "$PLAT" --min-api 24 --output "$(w "$B/module/dex")" $(find . -name "*.class"))

# lay out the base module: manifest/, dex/, res/, resources.pb, assets/
(cd "$B/module" && jar xf "$(w "$B/base.apk")")
mv "$B/module/AndroidManifest.xml" "$B/module/manifest/AndroidManifest.xml"
cp -r "$WEB" "$B/module/assets/web"
(cd "$B/module" && jar cMf "$(w "$B/base.zip")" .)

java -jar "$BUNDLETOOL" build-bundle --modules="$(w "$B/base.zip")" --output="$(w "$UNSIGNED")" --overwrite
java -jar "$BUNDLETOOL" validate --bundle="$(w "$UNSIGNED")" >/dev/null
echo "bundle built and validated: $UNSIGNED"

if [ "${1:-}" = "unsigned" ]; then exit 0; fi
[ -f "$KS" ] || { echo "upload key not found: $KS (create it first, see README)"; exit 1; }
jarsigner -keystore "$(w "$KS")" -sigalg SHA256withRSA -digestalg SHA-256 -signedjar "$(w "$OUT")" "$(w "$UNSIGNED")" upload
jarsigner -verify "$(w "$OUT")" | tail -1
ls -la "$OUT"
