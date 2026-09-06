from __future__ import annotations

import importlib.metadata
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

PACKAGE = "baska"
PYPI_JSON = "https://pypi.org/pypi/baska/json"


def installed_version() -> str:
    try:
        return importlib.metadata.version(PACKAGE)
    except importlib.metadata.PackageNotFoundError:
        try:
            from baska_core_v2 import VERSION
            return VERSION
        except Exception:
            return "unknown"


def latest_version(timeout: int = 8) -> str | None:
    request = urllib.request.Request(
        PYPI_JSON,
        headers={"Accept": "application/json", "User-Agent": f"BASKA/{installed_version()}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.load(response)
        return str(data.get("info", {}).get("version") or "").strip() or None
    except (OSError, urllib.error.URLError, ValueError, json.JSONDecodeError):
        return None


def _version_key(value: str) -> tuple:
    # PEP 440 penuh tidak diperlukan untuk release BASKA yang menggunakan
    # nomor stabil x.y.z. Suffix tetap ditangani deterministik.
    pieces: list[object] = []
    for part in value.replace("-", ".").split("."):
        pieces.append(int(part) if part.isdigit() else part.lower())
    return tuple(pieces)


def update_available(current: str, latest: str) -> bool:
    try:
        return _version_key(latest) > _version_key(current)
    except (TypeError, ValueError):
        return latest != current


def detect_method() -> tuple[str, list[str]]:
    """Return a human label and the normal upgrade command."""
    executable = str(Path(sys.executable).resolve()).lower()
    pipx = shutil.which("pipx")
    pipx_markers = ("/pipx/venvs/", "\\pipx\\venvs\\", "/pipx/venv/", "\\pipx\\venv\\")
    if pipx and any(marker in executable for marker in pipx_markers):
        return "pipx", [pipx, "upgrade", PACKAGE]

    # Debian/Ubuntu pipx commonly uses ~/.local/share/pipx/venvs/<name>.
    if pipx and "pipx" in executable and PACKAGE in executable:
        return "pipx", [pipx, "upgrade", PACKAGE]

    return "pip", [sys.executable, "-m", "pip", "install", "--upgrade", PACKAGE]


def _force_command(method: str, normal: list[str]) -> list[str]:
    if method == "pipx":
        pipx = normal[0]
        # reinstall is the reliable pipx equivalent of a forced refresh.
        return [pipx, "reinstall", PACKAGE]
    return [sys.executable, "-m", "pip", "install", "--upgrade", "--force-reinstall", "--no-cache-dir", PACKAGE]


def _print_header() -> None:
    print("BASKA UPDATE")
    print("=" * 56)


def _print_status(current: str, latest: str | None, method: str) -> None:
    print(f"Versi saat ini : {current}")
    print(f"Versi terbaru  : {latest or 'tidak dapat diperiksa'}")
    print(f"Metode         : {method}")


def check() -> int:
    current = installed_version()
    method, _ = detect_method()
    latest = latest_version()
    _print_header()
    _print_status(current, latest, method)
    if latest is None:
        print("Status         : gagal menghubungi PyPI")
        return 2
    if update_available(current, latest):
        print("Status         : update tersedia")
        print("\nJalankan: baska upgrade")
        return 10
    print("Status         : sudah versi terbaru")
    return 0


def upgrade(*, force: bool = False, quiet: bool = False) -> int:
    current = installed_version()
    method, normal = detect_method()
    latest = latest_version()

    if not quiet:
        _print_header()
        _print_status(current, latest, method)

    if latest and not force and not update_available(current, latest):
        if not quiet:
            print("Status         : sudah versi terbaru")
        return 0

    command = _force_command(method, normal) if force else normal
    if not quiet:
        if latest:
            print(f"Status         : memperbarui {current} → {latest} ...")
        else:
            print("Status         : PyPI tidak dapat diperiksa; mencoba upgrade langsung ...")
        print()

    try:
        completed = subprocess.run(command, check=False)
    except KeyboardInterrupt:
        print("\nUpdate dibatalkan.")
        return 130
    except OSError as exc:
        print(f"Update gagal: {exc}", file=sys.stderr)
        return 1

    if completed.returncode != 0:
        print(f"\nUpdate gagal (exit {completed.returncode}).", file=sys.stderr)
        if method == "pipx":
            print("Coba: pipx upgrade baska", file=sys.stderr)
        else:
            print("Coba: python -m pip install -U baska", file=sys.stderr)
        return completed.returncode or 1

    after = latest or "terbaru"
    print()
    print(f"✓ BASKA berhasil diperbarui ke {after}.")
    print("  Jalankan 'baska version' untuk verifikasi.")
    return 0


def cli(args: list[str]) -> int:
    allowed = {"--check", "--force", "-f", "--quiet", "-q"}
    unknown = [arg for arg in args if arg not in allowed]
    if unknown:
        print(f"Opsi upgrade tidak dikenal: {' '.join(unknown)}", file=sys.stderr)
        print("Gunakan: baska help upgrade", file=sys.stderr)
        return 2
    if "--check" in args:
        return check()
    return upgrade(force=("--force" in args or "-f" in args), quiet=("--quiet" in args or "-q" in args))
