#!/usr/bin/env sh
set -eu

REPO_OWNER="${BASKA_REPO_OWNER:-baska-pro}"
REPO_NAME="${BASKA_REPO_NAME:-baska-hub}"
BRANCH="${BASKA_REPO_BRANCH:-main}"
RAW_BASE="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}"

say() { printf '%s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

install_downloader() {
  if command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1; then
    return 0
  fi

  say "Downloader belum tersedia. Mencoba memasang curl..."
  if command -v pkg >/dev/null 2>&1; then
    pkg install -y curl
  elif command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then apt-get update && apt-get install -y curl;
    elif command -v sudo >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y curl;
    else fail "curl/wget tidak tersedia dan instalasi paket memerlukan hak administrator."; fi
  elif command -v apk >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then apk add curl; else fail "Jalankan sebagai root untuk memasang curl."; fi
  elif command -v dnf >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then dnf install -y curl; elif command -v sudo >/dev/null 2>&1; then sudo dnf install -y curl; else fail "Tidak dapat memasang curl."; fi
  elif command -v pacman >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then pacman -Sy --noconfirm curl; elif command -v sudo >/dev/null 2>&1; then sudo pacman -Sy --noconfirm curl; else fail "Tidak dapat memasang curl."; fi
  else
    fail "Pasang curl atau wget terlebih dahulu."
  fi
}

fetch() {
  url="$1"; out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --connect-timeout 15 "$url" -o "$out"
  else
    wget -O "$out" "$url"
  fi
}

install_downloader

if [ -n "${TERMUX_VERSION:-}" ] || [ -n "${PREFIX:-}" ] && printf '%s' "${PREFIX:-}" | grep -q 'com.termux'; then
  TARGET_DIR="${PREFIX:-/data/data/com.termux/files/usr}/bin"
else
  TARGET_DIR="${BASKA_BIN_DIR:-$HOME/.local/bin}"
fi

mkdir -p "$TARGET_DIR" "$HOME/.baska/cache"
TMP="${TMPDIR:-/tmp}/baska.$$"
trap 'rm -f "$TMP"' EXIT HUP INT TERM

say "Memasang BASKA CLI..."
fetch "$RAW_BASE/bin/baska" "$TMP"
chmod 755 "$TMP"
mv "$TMP" "$TARGET_DIR/baska"

"$TARGET_DIR/baska" refresh >/dev/null 2>&1 || true

say "BASKA CLI terpasang: $TARGET_DIR/baska"
case ":$PATH:" in
  *":$TARGET_DIR:"*) ;;
  *)
    say "Tambahkan direktori berikut ke PATH jika command 'baska' belum ditemukan:"
    say "  export PATH=\"$TARGET_DIR:\$PATH\""
    ;;
esac
say "Coba: baska doctor"
