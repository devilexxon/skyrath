@echo off
rem Double-click to play Skyrath on this PC (needs Node.js installed).
cd /d "%~dp0"
start "" http://localhost:5173/
node tools\serve.mjs 5173
