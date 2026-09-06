#!/usr/bin/env sh
set -eu

PKG_HOME="${BASKA_PACKAGE_HOME:-}"
if [ -z "$PKG_HOME" ] || [ ! -d "$PKG_HOME" ]; then
  echo "[BASKA] Package directory tidak ditemukan: $PKG_HOME" >&2
  exit 1
fi

INSTALLER="$PKG_HOME/install.sh"
if [ ! -f "$INSTALLER" ]; then
  echo "[BASKA] install.sh tidak ditemukan di $PKG_HOME" >&2
  exit 1
fi

first_line=$(sed -n '1p' "$INSTALLER" 2>/dev/null || true)
needs_bash=0
case "$first_line" in
  *bash*) needs_bash=1 ;;
esac

# Fallback detection for common Bash-only syntax.
if [ "$needs_bash" -eq 0 ]; then
  if grep -Eq '(^|[[:space:]])set[[:space:]]+-[^#\n]*o[[:space:]]+pipefail|\[\[|BASH_SOURCE|declare[[:space:]]|local[[:space:]]' "$INSTALLER" 2>/dev/null; then
    needs_bash=1
  fi
fi

install_bash() {
  if command -v bash >/dev/null 2>&1; then
    return 0
  fi
  echo "[BASKA] Bash belum tersedia. Mencoba memasang..."
  if command -v pkg >/dev/null 2>&1; then
    pkg install -y bash
  elif command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
      apt-get update && apt-get install -y bash
    elif command -v sudo >/dev/null 2>&1; then
      sudo apt-get update && sudo apt-get install -y bash
    else
      echo "[BASKA] Bash diperlukan. Jalankan: apt install bash" >&2
      exit 1
    fi
  elif command -v apk >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then apk add bash; elif command -v sudo >/dev/null 2>&1; then sudo apk add bash; else exit 1; fi
  elif command -v pacman >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then pacman -S --noconfirm bash; elif command -v sudo >/dev/null 2>&1; then sudo pacman -S --noconfirm bash; else exit 1; fi
  else
    echo "[BASKA] Bash diperlukan tetapi package manager tidak dikenali." >&2
    exit 1
  fi
}

cd "$PKG_HOME"

if [ "$needs_bash" -eq 1 ]; then
  install_bash
  echo "[BASKA] Menjalankan install.sh dengan Bash..."
  exec bash "$INSTALLER"
fi

echo "[BASKA] Menjalankan install.sh dengan POSIX sh..."
exec sh "$INSTALLER"
