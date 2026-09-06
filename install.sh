#!/usr/bin/env sh
set -eu

OWNER="${BASKA_OWNER:-baska-pro}"
REPO="${BASKA_HUB_REPO:-$OWNER/baska-hub}"
BRANCH="${BASKA_HUB_BRANCH:-main}"
RAW="https://raw.githubusercontent.com/$REPO/$BRANCH"

say() { printf '%s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

ensure_downloader() {
  command -v curl >/dev/null 2>&1 && return
  command -v wget >/dev/null 2>&1 && return
  if command -v pkg >/dev/null 2>&1; then pkg install -y curl
  elif command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then apt-get update && apt-get install -y curl
    elif command -v sudo >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y curl
    else fail "curl/wget tidak tersedia dan sudo tidak ditemukan."; fi
  elif command -v apk >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then apk add curl; else fail "Jalankan sebagai root untuk memasang curl."; fi
  else fail "Pasang curl atau wget terlebih dahulu."
  fi
}

ensure_python() {
  command -v python3 >/dev/null 2>&1 && return
  if command -v pkg >/dev/null 2>&1; then pkg install -y python
  elif command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then apt-get update && apt-get install -y python3 python3-venv
    elif command -v sudo >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y python3 python3-venv
    else fail "Python 3 diperlukan."; fi
  elif command -v dnf >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then dnf install -y python3
    elif command -v sudo >/dev/null 2>&1; then sudo dnf install -y python3
    else fail "Python 3 diperlukan."; fi
  elif command -v pacman >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then pacman -Sy --noconfirm python
    elif command -v sudo >/dev/null 2>&1; then sudo pacman -Sy --noconfirm python
    else fail "Python 3 diperlukan."; fi
  else fail "Python 3.8+ diperlukan. Pasang Python lalu ulangi installer."
  fi
}

fetch() {
  url="$1"; out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --connect-timeout 15 "$url" -o "$out"
  else
    wget -qO "$out" "$url"
  fi
}

ensure_downloader
ensure_python

if [ -n "${TERMUX_VERSION:-}" ] || { [ -n "${PREFIX:-}" ] && printf '%s' "$PREFIX" | grep -q 'com.termux'; }; then
  TARGET_DIR="${PREFIX:-/data/data/com.termux/files/usr}/bin"
else
  TARGET_DIR="${BASKA_BIN_DIR:-$HOME/.local/bin}"
fi

mkdir -p "$TARGET_DIR" "$HOME/.baska/cache"
tmp="${TMPDIR:-/tmp}/baska.$$"
trap 'rm -f "$tmp"' EXIT HUP INT TERM

say "Installing BASKA Hub CLI..."
fetch "$RAW/bin/baska" "$tmp"
chmod 755 "$tmp"
mv "$tmp" "$TARGET_DIR/baska"

if command -v python3 >/dev/null 2>&1; then
  python3 "$TARGET_DIR/baska" refresh >/dev/null 2>&1 || true
fi

say "Installed: $TARGET_DIR/baska"
case ":$PATH:" in
  *":$TARGET_DIR:"*) ;;
  *) say "Tambahkan ke PATH: export PATH=\"$TARGET_DIR:\$PATH\"" ;;
esac
say "Jalankan: baska"
