"""Cross-platform entrypoints for installed BASKA CLI scripts.

Avoid importing curses for command-line operations or native Windows consoles.
"""
from __future__ import annotations

import importlib.metadata
import sys
import tomllib
from pathlib import Path


def _sync_version() -> None:
    try:
        version = importlib.metadata.version("baska")
    except importlib.metadata.PackageNotFoundError:
        try:
            with (Path(__file__).resolve().parent / "pyproject.toml").open("rb") as file:
                version = str(tomllib.load(file)["project"]["version"])
        except (OSError, KeyError, ValueError):
            return
    from baska_core_v2 import VERSION
    if version != VERSION:
        import baska_core_v2
        baska_core_v2.VERSION = version


def core_main() -> int:
    _sync_version()
    from baska_core_v2 import run_cli
    try:
        return run_cli(sys.argv[1:])
    except KeyboardInterrupt:
        print("\nDibatalkan oleh pengguna.")
        return 130


def main() -> int:
    _sync_version()
    from baska_help import COMMANDS, show_help
    args = sys.argv[1:]
    if args in (["--help"], ["-h"], ["help"]):
        show_help()
        return 0
    if args and args[0] == "help":
        show_help(args[1] if len(args) > 1 else None)
        return 0
    if len(args) >= 2 and args[0] in COMMANDS and args[1] in ("--help", "-h"):
        show_help(args[0])
        return 0
    if args and args[0] in ("upgrade", "self-update"):
        from baska_self_update import cli
        return cli(args[1:])
    if args:
        return core_main()
    try:
        from baska_tui_v2 import main as interactive_main
    except (ImportError, ModuleNotFoundError):
        from baska_simple_ui import main as interactive_main
    try:
        interactive_main()
        return 0
    except KeyboardInterrupt:
        print("\nDibatalkan oleh pengguna.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
