#!/usr/bin/env bash
# Build dist/release/Skyrath-v<ver>-Android.apk from the android web package. Run from the project root in Git Bash:
#   node tools/build_web.mjs android && bash tools/build_apk.sh
# Needs the tools installed in D:\skyrath-android-tools (JDK 17 + Android SDK build-tools 34 / platform 34).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T=/d/skyrath-android-tools
JDK="$(ls -d $T/jdk-17* | head -1)"
export JAVA_HOME="$(cygpath -w "$JDK")"
export PATH="$JDK/bin:$PATH"
BT="$T/sdk/build-tools/34.0.0"
PLAT="$(cygpath -w "$T/sdk/platforms/android-34/android.jar")"
B="$ROOT/build/apk"
KS="$ROOT/android/skyrath-sideload.keystore"

WEB="$ROOT/dist/web-android"
[ -f "$WEB/index.html" ] || { echo "run: node tools/build_web.mjs android first"; exit 1; }
VER="$(grep -o 'versionName="[^"]*"' "$ROOT/android/AndroidManifest.xml" | cut -d'"' -f2)"
mkdir -p "$ROOT/dist/release"
OUTAPK="$ROOT/dist/release/Skyrath-v$VER-Android.apk"
rm -rf "$B"; mkdir -p "$B/assets" "$B/classes" "$B/dex" "$B/gen"
cp -r "$WEB" "$B/assets/web"

"$BT/aapt2.exe" compile --dir "$(cygpath -w "$ROOT/android/res")" -o "$(cygpath -w "$B/res.zip")"
"$BT/aapt2.exe" link -o "$(cygpath -w "$B/base.apk")" -I "$PLAT" --manifest "$(cygpath -w "$ROOT/android/AndroidManifest.xml")" \
  --java "$(cygpath -w "$B/gen")" --min-sdk-version 24 --target-sdk-version 34 "$(cygpath -w "$B/res.zip")"
javac -nowarn -source 8 -target 8 -cp "$PLAT" -d "$(cygpath -w "$B/classes")" "$(cygpath -w "$ROOT/android/src/com/skyrath/game/MainActivity.java")" 2>&1 | grep -v "warning:" || true
(cd "$B/classes" && "$BT/d8.bat" --lib "$PLAT" --min-api 24 --output "$(cygpath -w "$B/dex")" $(find . -name "*.class"))
(cd "$B/dex" && "$BT/aapt.exe" add "$(cygpath -w "$B/base.apk")" classes.dex >/dev/null)
# add the game files with forward-slash names (aapt2 -A writes backslashes on Windows, which Android cannot open)
(cd "$B" && find assets -type f | tr "\\" "/" | xargs "$BT/aapt.exe" add base.apk >/dev/null)
"$BT/zipalign.exe" -f 4 "$(cygpath -w "$B/base.apk")" "$(cygpath -w "$B/aligned.apk")"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$(cygpath -w "$KS")" -storepass android -keypass android -alias skyrath -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Skyrath Sideload" >/dev/null 2>&1
fi
"$BT/apksigner.bat" sign --ks "$(cygpath -w "$KS")" --ks-pass pass:android --key-pass pass:android --out "$(cygpath -w "$OUTAPK")" "$(cygpath -w "$B/aligned.apk")"
"$BT/apksigner.bat" verify --print-certs "$(cygpath -w "$OUTAPK")" | head -2
rm -f "$OUTAPK.idsig"
ls -la "$OUTAPK"
