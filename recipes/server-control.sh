#!/usr/bin/env sh
set -eu

SOURCE="${BASKA_PACKAGE_SOURCE:-https://github.com/baska-pro/server-control-suite.git}"
TARGET="${BASKA_PACKAGE_HOME:-$HOME/.baska/packages/server-control}"

say() { printf '%s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

if [ -n "${TERMUX_VERSION:-}" ]; then
  fail "Server Control Suite Linux tidak ditujukan untuk Termux. Gunakan Linux/VPS/Ubuntu/Debian."
fi

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return 1
  fi
}

install_base_deps() {
  if command -v apt-get >/dev/null 2>&1; then
    run_root apt-get update
    run_root apt-get install -y git python3 python3-venv python3-pip
  elif command -v dnf >/dev/null 2>&1; then
    run_root dnf install -y git python3 python3-pip
  elif command -v apk >/dev/null 2>&1; then
    run_root apk add git python3 py3-pip py3-virtualenv
  elif command -v pacman >/dev/null 2>&1; then
    run_root pacman -Sy --noconfirm git python python-pip
  else
    fail "Package manager tidak dikenali. Pastikan git, python3, pip, dan modul venv tersedia."
  fi
}

if ! command -v git >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  say "Memasang dependency sistem..."
  install_base_deps || fail "Dependency sistem tidak dapat dipasang otomatis."
fi

mkdir -p "$(dirname "$TARGET")"

if [ -d "$TARGET/.git" ]; then
  say "Memperbarui repository Server Control Suite..."
  git -C "$TARGET" pull --ff-only
else
  if [ -e "$TARGET" ] && [ "$(ls -A "$TARGET" 2>/dev/null || true)" ]; then
    fail "Folder target sudah ada dan bukan repository Git: $TARGET"
  fi
  rm -rf "$TARGET"
  say "Meng-clone Server Control Suite..."
  git clone --depth 1 "$SOURCE" "$TARGET"
fi

if ! python3 -m venv "$TARGET/.venv" 2>/dev/null; then
  say "Modul venv belum tersedia. Mencoba memasangnya..."
  install_base_deps || true
  python3 -m venv "$TARGET/.venv" || fail "Gagal membuat Python virtual environment."
fi

say "Memasang dependency Python..."
"$TARGET/.venv/bin/python" -m pip install --upgrade pip
"$TARGET/.venv/bin/python" -m pip install -r "$TARGET/requirements-linux.txt"

if [ ! -f "$TARGET/.env" ]; then
  cp "$TARGET/.env.example" "$TARGET/.env"
  chmod 600 "$TARGET/.env" 2>/dev/null || true
fi

cat > "$TARGET/run-baska.sh" <<'EOF'
#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
set -a
[ -f ./.env ] && . ./.env
set +a
exec ./.venv/bin/python ./server_control_linux.py "$@"
EOF
chmod 755 "$TARGET/run-baska.sh"

say ""
say "Server Control Suite berhasil dipasang/diperbarui."
say "Lokasi : $TARGET"
say "Config : $TARGET/.env"
say "Jalankan setelah TOKEN_SERVER_CONTROL dan ADMIN_ID diisi:"
say "  $TARGET/run-baska.sh"
