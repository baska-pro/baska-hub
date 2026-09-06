#!/usr/bin/env sh
set -eu

say() { printf '%s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

is_termux() {
  [ -n "${TERMUX_VERSION:-}" ] || { [ -n "${PREFIX:-}" ] && printf '%s' "$PREFIX" | grep -q 'com.termux'; }
}

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return 1
  fi
}

ensure_python() {
  if command -v python3 >/dev/null 2>&1; then return; fi
  if is_termux && command -v pkg >/dev/null 2>&1; then
    pkg install -y python
  elif command -v apt-get >/dev/null 2>&1; then
    as_root apt-get update || fail "sudo/root diperlukan untuk memasang Python."
    as_root apt-get install -y python3 python3-venv python3-pip || fail "Gagal memasang Python."
  elif command -v dnf >/dev/null 2>&1; then
    as_root dnf install -y python3 python3-pip || fail "Gagal memasang Python."
  elif command -v pacman >/dev/null 2>&1; then
    as_root pacman -Sy --noconfirm python python-pip || fail "Gagal memasang Python."
  else
    fail "Python 3.10+ diperlukan. Pasang Python lalu ulangi installer."
  fi
}

install_termux() {
  say "Platform : Termux"
  if ! python3 -m pip --version >/dev/null 2>&1; then
    pkg install -y python-pip 2>/dev/null || true
  fi
  python3 -m pip install --upgrade baska
}

install_pipx() {
  say "Metode  : pipx"
  if pipx list 2>/dev/null | grep -q 'package baska '; then
    pipx upgrade baska
  else
    pipx install baska
  fi
}

install_linux() {
  if command -v pipx >/dev/null 2>&1; then
    install_pipx
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    say "Menyiapkan pipx..."
    as_root apt-get update || fail "sudo/root diperlukan untuk memasang pipx."
    as_root apt-get install -y pipx python3-venv || fail "Gagal memasang pipx."
    command -v pipx >/dev/null 2>&1 || fail "pipx belum tersedia setelah instalasi."
    pipx ensurepath >/dev/null 2>&1 || true
    install_pipx
    return
  fi

  say "Metode  : pip user install"
  python3 -m pip install --user --upgrade baska || {
    fail "Instalasi pip ditolak oleh sistem. Pasang pipx lalu jalankan: pipx install baska"
  }
}

ensure_python

say "BASKA Hub Installer"
say "=============================="

if is_termux; then
  install_termux
else
  install_linux
fi

say ""
say "Instalasi selesai."
say "Jalankan: baska"
say "Update berikutnya: baska upgrade"
