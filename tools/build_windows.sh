#!/usr/bin/env bash
# Build the Windows app: dist/release/Skyrath-v<ver>-Windows.zip (Skyrath.exe + game folder).
#   node tools/build_web.mjs windows && bash tools/build_windows.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="$(grep -o 'versionName=.*' "$ROOT/android/version.properties" | cut -d= -f2 | tr -d '\r')"
OUT="$ROOT/build/windows/Skyrath"
[ -f "$ROOT/dist/web-windows/index.html" ] || { echo "run: node tools/build_web.mjs windows first"; exit 1; }
rm -rf "$ROOT/build/windows"; mkdir -p "$OUT"
cp -r "$ROOT/dist/web-windows" "$OUT/game"
ffmpeg -hide_banner -loglevel error -y -i "$ROOT/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png" -vf scale=256:256 "$ROOT/build/windows/skyrath.ico"
/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe -nologo -optimize -target:winexe \
  -win32icon:"$(cygpath -w "$ROOT/build/windows/skyrath.ico")" -r:System.Windows.Forms.dll \
  -out:"$(cygpath -w "$OUT/Skyrath.exe")" "$(cygpath -w "$ROOT/windows/SkyrathLauncher.cs")"
printf 'SKYRATH v%s for Windows\r\n\r\nDouble-click Skyrath.exe to play. Keep Skyrath.exe and the "game" folder together.\r\nThe game opens full screen. Press F11 to leave full screen, Alt+F4 to quit.\r\nNeeds Microsoft Edge (built into Windows 10/11) or Google Chrome. No internet needed.\r\nSaves are kept in %%LOCALAPPDATA%%\Skyrath\r\n' "$VER" > "$OUT/HOW TO PLAY.txt"
mkdir -p "$ROOT/dist/release"
ZIP="$ROOT/dist/release/Skyrath-v$VER-Windows.zip"; rm -f "$ZIP"
(cd "$ROOT/build/windows" && C:/Windows/System32/tar.exe -a -c -f "$(cygpath -w "$ZIP")" Skyrath)
ls -la "$ZIP"
