#!/usr/bin/env bash
# Moodle Auto Relogin — build script (Linux / macOS / WSL)
# Creates:
#   dist/chrome-unpacked/
#   dist/firefox-unpacked/
#   dist/moodle-relogin-chrome.zip
#   dist/moodle-relogin-firefox.zip
#   dist/moodle-relogin-firefox.xpi  (unsigned stub)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/src"
DIST="$ROOT/dist"
CHROME_MF="$ROOT/manifests/chrome/manifest.json"
FIREFOX_MF="$ROOT/manifests/firefox/manifest.json"
CHROME_UP="$DIST/chrome-unpacked"
FIREFOX_UP="$DIST/firefox-unpacked"
CHROME_ZIP="$DIST/moodle-relogin-chrome.zip"
FIREFOX_ZIP="$DIST/moodle-relogin-firefox.zip"
FIREFOX_XPI="$DIST/moodle-relogin-firefox.xpi"

fail() { echo "Error: $1" >&2; exit 2; }
[ -d "$SRC" ]          || fail "Missing src/"
[ -f "$CHROME_MF" ]    || fail "Missing manifests/chrome/manifest.json"
[ -f "$FIREFOX_MF" ]   || fail "Missing manifests/firefox/manifest.json"

make_zip() {
    local dir="$1" out="$2"
    rm -f "$out"
    if command -v zip >/dev/null 2>&1; then
        (cd "$dir" && zip -qr "$out" .)
    else
        python3 - "$dir" "$out" <<'PY'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, src).replace(os.sep, "/"))
PY
    fi
}

copy_build() {
    # copy_build <manifest> <dest> <firefox:0|1>
    local mf="$1" dest="$2" ff="$3"
    rm -rf "$dest"
    mkdir -p "$dest"
    # Всё из src/ кроме firefox/
    for item in "$SRC"/*/; do
        name="$(basename "$item")"
        [ "$name" = "firefox" ] && continue
        cp -r "$item" "$dest/"
    done
    for f in "$SRC"/*; do
        [ -f "$f" ] && cp "$f" "$dest/"
    done
    # Firefox extras
    if [ "$ff" = "1" ]; then
        cp "$SRC/firefox/firefox-extras.js" "$dest/firefox-extras.js"
    fi
    cp "$mf" "$dest/manifest.json"
}

mkdir -p "$DIST"
rm -f "$CHROME_ZIP" "$FIREFOX_ZIP" "$FIREFOX_XPI"

echo "Preparing Chrome unpacked..."
copy_build "$CHROME_MF" "$CHROME_UP" "0"

echo "Preparing Firefox unpacked..."
copy_build "$FIREFOX_MF" "$FIREFOX_UP" "1"

echo "Zipping Chrome -> $CHROME_ZIP"
make_zip "$CHROME_UP" "$CHROME_ZIP"

echo "Zipping Firefox -> $FIREFOX_ZIP"
make_zip "$FIREFOX_UP" "$FIREFOX_ZIP"

echo "Copying Firefox zip -> xpi (unsigned stub)"
cp "$FIREFOX_ZIP" "$FIREFOX_XPI"

echo "Packaging complete."
echo "Chrome folder:  $CHROME_UP"
echo "Firefox folder: $FIREFOX_UP"
echo "Chrome zip:     $CHROME_ZIP"
echo "Firefox zip:    $FIREFOX_ZIP"
echo "Firefox xpi:    $FIREFOX_XPI"
