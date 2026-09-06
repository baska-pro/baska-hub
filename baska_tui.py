from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

VERSION = "1.1.0"
HOME = Path(os.getenv("BASKA_HOME", str(Path.home() / ".baska"))).expanduser()
CATALOG = HOME / "cache" / "catalog.json"
CONFIG = HOME / "config.json"
STATE = HOME / "state.json"


def _core_path() -> str:
    found = shutil.which("baska-core")
    if found:
        return found
    here = Path(__file__).resolve().parent
    candidate = here / "bin" / "baska-core"
    if candidate.exists():
        return str(candidate)
    candidate = Path(sys.argv[0]).resolve().with_name("baska-core")
    if candidate.exists():
        return str(candidate)
    raise RuntimeError("baska-core tidak ditemukan. Jalankan: pip install -U baska")


def core(args: list[str], *, check: bool = False) -> int:
    cmd = [_core_path(), *args]
    try:
        return subprocess.run(cmd, check=check).returncode
    except KeyboardInterrupt:
        return 130


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def packages() -> list[dict]:
    data = load_json(CATALOG, {"packages": []})
    return list(data.get("packages", []))


def installed_slugs() -> set[str]:
    data = load_json(STATE, {"installed": {}})
    return set(data.get("installed", {}).keys())


def github_label() -> str:
    cfg = load_json(CONFIG, {})
    return cfg.get("github_user") or "public"


def platform_label() -> str:
    if os.getenv("TERMUX_VERSION") or "com.termux" in os.getenv("PREFIX", ""):
        p = "termux"
    else:
        p = platform.system().lower() or "unknown"
    arch = platform.machine().lower() or "unknown"
    if arch == "aarch64":
        arch = "arm64"
    elif arch == "amd64":
        arch = "x86_64"
    return f"{p}/{arch}"


def ensure_catalog() -> None:
    if not CATALOG.exists():
        core(["refresh"])


def _safe_add(stdscr, y: int, x: int, text: str, attr=0) -> None:
    try:
        h, w = stdscr.getmaxyx()
        if y < 0 or y >= h or x >= w:
            return
        maxlen = max(0, w - x - 1)
        stdscr.addnstr(y, x, text, maxlen, attr)
    except Exception:
        pass


def _pause(stdscr, message: str = "Tekan Enter untuk kembali") -> None:
    h, _ = stdscr.getmaxyx()
    _safe_add(stdscr, h - 1, 2, message)
    stdscr.refresh()
    while True:
        ch = stdscr.getch()
        if ch in (10, 13, 27, ord("q")):
            return


def _run_external(stdscr, args: list[str]) -> None:
    import curses
    curses.def_prog_mode()
    curses.endwin()
    print()
    rc = core(args)
    print()
    try:
        input("Enter untuk kembali ke BASKA...")
    except (EOFError, KeyboardInterrupt):
        pass
    curses.reset_prog_mode()
    stdscr.refresh()
    if rc != 0:
        pass


def _input(stdscr, prompt: str, initial: str = "") -> str | None:
    import curses
    h, w = stdscr.getmaxyx()
    y = h - 2
    buf = list(initial)
    curses.curs_set(1)
    try:
        while True:
            _safe_add(stdscr, y, 0, " " * max(1, w - 1))
            shown = prompt + "".join(buf)
            _safe_add(stdscr, y, 1, shown)
            try:
                stdscr.move(y, min(w - 2, 1 + len(shown)))
            except Exception:
                pass
            stdscr.refresh()
            ch = stdscr.getch()
            if ch in (10, 13):
                value = "".join(buf).strip()
                return value if value else None
            if ch in (27,):
                return None
            if ch in (curses.KEY_BACKSPACE, 127, 8):
                if buf:
                    buf.pop()
                continue
            if 32 <= ch <= 126:
                buf.append(chr(ch))
    finally:
        try:
            curses.curs_set(0)
        except Exception:
            pass


def _confirm(stdscr, message: str) -> bool:
    import curses
    h, w = stdscr.getmaxyx()
    text = f"{message}  [Enter=Ya] [Esc=Tidak]"
    y = max(1, h // 2)
    _safe_add(stdscr, y, 1, " " * max(1, w - 2), curses.A_REVERSE)
    _safe_add(stdscr, y, 2, text, curses.A_REVERSE)
    stdscr.refresh()
    while True:
        ch = stdscr.getch()
        if ch in (10, 13, ord("y"), ord("Y")):
            return True
        if ch in (27, ord("n"), ord("N"), ord("q")):
            return False


def _header(stdscr, title: str, subtitle: str = "") -> int:
    import curses
    h, w = stdscr.getmaxyx()
    stdscr.erase()
    brand = f" BASKA HUB  v{VERSION} "
    _safe_add(stdscr, 0, 0, " " * max(1, w - 1), curses.A_REVERSE)
    _safe_add(stdscr, 0, 1, brand, curses.A_BOLD | curses.A_REVERSE)
    right = f"{platform_label()}  GitHub:{github_label()}"
    if len(right) < w - len(brand) - 3:
        _safe_add(stdscr, 0, max(1, w - len(right) - 2), right, curses.A_REVERSE)
    _safe_add(stdscr, 2, 2, title, curses.A_BOLD)
    if subtitle:
        _safe_add(stdscr, 3, 2, subtitle, curses.A_DIM)
        return 5
    return 4


def _menu(stdscr, title: str, items: list[tuple[str, str]], subtitle: str = "") -> str | None:
    import curses
    idx = 0
    while True:
        top = _header(stdscr, title, subtitle)
        h, w = stdscr.getmaxyx()
        visible = max(3, h - top - 3)
        start = max(0, min(idx - visible // 2, max(0, len(items) - visible)))
        for row, (key, label) in enumerate(items[start:start + visible]):
            actual = start + row
            attr = curses.A_REVERSE | curses.A_BOLD if actual == idx else curses.A_NORMAL
            prefix = "  › " if actual == idx else "    "
            _safe_add(stdscr, top + row, 1, " " * max(1, w - 2), attr)
            _safe_add(stdscr, top + row, 1, prefix + label, attr)
        _safe_add(stdscr, h - 1, 1, "↑↓ pilih  Enter buka  Esc/q kembali", curses.A_DIM)
        stdscr.refresh()
        ch = stdscr.getch()
        if ch in (curses.KEY_UP, ord("k")):
            idx = (idx - 1) % len(items)
        elif ch in (curses.KEY_DOWN, ord("j")):
            idx = (idx + 1) % len(items)
        elif ch in (10, 13, curses.KEY_RIGHT):
            return items[idx][0]
        elif ch in (27, ord("q"), curses.KEY_LEFT):
            return None
        elif ord("1") <= ch <= ord("9"):
            n = ch - ord("1")
            if n < len(items):
                return items[n][0]


def _package_browser(stdscr, mode: str = "browse") -> None:
    import curses
    all_pkgs = packages()
    query = ""
    idx = 0
    installed = installed_slugs()
    while True:
        filtered = []
        needle = query.lower()
        for p in all_pkgs:
            hay = " ".join([str(p.get("id", "")), p.get("slug", ""), p.get("name", ""), p.get("description", ""), " ".join(p.get("tags", []))]).lower()
            if needle in hay:
                filtered.append(p)
        if not filtered:
            idx = 0
        else:
            idx = max(0, min(idx, len(filtered) - 1))
        subtitle = f"{len(filtered)} item  |  filter: {query or 'semua'}"
        top = _header(stdscr, "Repository & Paket", subtitle)
        h, w = stdscr.getmaxyx()
        visible = max(3, h - top - 4)
        start = max(0, min(idx - visible // 2, max(0, len(filtered) - visible))) if filtered else 0
        for row, p in enumerate(filtered[start:start + visible]):
            actual = start + row
            attr = curses.A_REVERSE | curses.A_BOLD if actual == idx else curses.A_NORMAL
            marker = "✓" if p.get("slug") in installed else " "
            vis = "PVT" if p.get("visibility") == "private" else "PUB"
            line = f" {marker} {str(p.get('id','')):<7} {p.get('slug',''):<28.28} {vis:<3} {','.join(p.get('platforms', ['all'])):<10.10}"
            _safe_add(stdscr, top + row, 1, " " * max(1, w - 2), attr)
            _safe_add(stdscr, top + row, 1, line, attr)
        if not filtered:
            _safe_add(stdscr, top + 1, 3, "Tidak ada hasil.", curses.A_DIM)
        help_line = "↑↓ pilih  Enter detail  i install  u update  r remove  / cari  f favorit  Esc kembali"
        _safe_add(stdscr, h - 1, 1, help_line, curses.A_DIM)
        stdscr.refresh()
        ch = stdscr.getch()
        if ch in (curses.KEY_UP, ord("k")) and filtered:
            idx = (idx - 1) % len(filtered)
        elif ch in (curses.KEY_DOWN, ord("j")) and filtered:
            idx = (idx + 1) % len(filtered)
        elif ch in (10, 13, curses.KEY_RIGHT) and filtered:
            _package_detail(stdscr, filtered[idx])
            installed = installed_slugs()
        elif ch == ord("/"):
            value = _input(stdscr, "Cari: ", query)
            if value is not None:
                query = value
                idx = 0
        elif ch == ord("i") and filtered:
            p = filtered[idx]
            if _confirm(stdscr, f"Install {p.get('slug')}?"):
                _run_external(stdscr, ["install", str(p.get("id") or p.get("slug"))])
                installed = installed_slugs()
        elif ch == ord("u") and filtered:
            p = filtered[idx]
            _run_external(stdscr, ["update", str(p.get("id") or p.get("slug"))])
            installed = installed_slugs()
        elif ch == ord("r") and filtered:
            p = filtered[idx]
            if p.get("slug") in installed and _confirm(stdscr, f"Hapus {p.get('slug')}?"):
                _run_external(stdscr, ["-y", "remove", str(p.get("id") or p.get("slug"))])
                installed = installed_slugs()
        elif ch == ord("f") and filtered:
            p = filtered[idx]
            _run_external(stdscr, ["favorite", "add", str(p.get("id") or p.get("slug"))])
        elif ch in (27, ord("q"), curses.KEY_LEFT):
            return


def _package_detail(stdscr, p: dict) -> None:
    import curses
    while True:
        top = _header(stdscr, p.get("name") or p.get("slug") or "Detail", f"ID {p.get('id')}  •  {p.get('visibility','public')}  •  {p.get('status','ready')}")
        h, w = stdscr.getmaxyx()
        lines = [
            ("Slug", p.get("slug")),
            ("Versi", p.get("version")),
            ("Platform", ", ".join(p.get("platforms", []))),
            ("Bahasa", p.get("language")),
            ("Kategori", p.get("category")),
            ("Trust", p.get("trust")),
            ("Tags", ", ".join(p.get("tags", [])[:10])),
            ("Sumber", p.get("source")),
            ("Deskripsi", p.get("description")),
        ]
        y = top
        for key, value in lines:
            if value in (None, "", []):
                continue
            text = str(value)
            _safe_add(stdscr, y, 2, f"{key:<11}", curses.A_BOLD)
            _safe_add(stdscr, y, 14, text)
            y += 1
            if y >= h - 3:
                break
        _safe_add(stdscr, h - 1, 1, "i install  u update  r remove  v versions  Esc kembali", curses.A_DIM)
        stdscr.refresh()
        ch = stdscr.getch()
        ident = str(p.get("id") or p.get("slug"))
        if ch == ord("i"):
            if _confirm(stdscr, f"Install {p.get('slug')}?"):
                _run_external(stdscr, ["install", ident])
        elif ch == ord("u"):
            _run_external(stdscr, ["update", ident])
        elif ch == ord("r"):
            if _confirm(stdscr, f"Hapus {p.get('slug')}?"):
                _run_external(stdscr, ["-y", "remove", ident])
        elif ch == ord("v"):
            _run_external(stdscr, ["versions", ident])
        elif ch in (27, ord("q"), curses.KEY_LEFT):
            return


def _settings(stdscr) -> None:
    cfg = load_json(CONFIG, {"auto_refresh": True, "smart_install": True})
    while True:
        items = [
            ("auto", f"Auto refresh katalog     {'ON' if cfg.get('auto_refresh', True) else 'OFF'}"),
            ("smart", f"Smart installer          {'ON' if cfg.get('smart_install', True) else 'OFF'}"),
            ("back", "Kembali"),
        ]
        choice = _menu(stdscr, "Settings", items)
        if choice in (None, "back"):
            return
        if choice == "auto":
            cfg["auto_refresh"] = not cfg.get("auto_refresh", True)
        elif choice == "smart":
            cfg["smart_install"] = not cfg.get("smart_install", True)
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        CONFIG.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _simple_dashboard() -> None:
    while True:
        print("\nBASKA HUB", VERSION)
        print("1. Daftar paket")
        print("2. Install")
        print("3. Status")
        print("4. Update semua")
        print("5. GitHub init")
        print("6. Doctor")
        print("0. Keluar")
        choice = input("Pilih: ").strip()
        if choice == "1": core(["list"])
        elif choice == "2":
            target = input("ID/slug: ").strip()
            if target: core(["install", target])
        elif choice == "3": core(["status"])
        elif choice == "4": core(["update-all"])
        elif choice == "5": core(["init"])
        elif choice == "6": core(["doctor"])
        elif choice == "0": return


def run_dashboard() -> None:
    ensure_catalog()
    try:
        import curses
    except Exception:
        return _simple_dashboard()

    def app(stdscr):
        try:
            curses.curs_set(0)
        except Exception:
            pass
        stdscr.keypad(True)
        try:
            curses.use_default_colors()
        except Exception:
            pass
        while True:
            unread = sum(1 for n in load_json(STATE, {}).get("notifications", []) if not n.get("read"))
            items = [
                ("browse", "Repository & paket"),
                ("installed", "Paket terpasang / status"),
                ("updates", "Cek update"),
                ("updateall", "Update semua"),
                ("profiles", "Profiles & collections"),
                ("favorites", "Favorites"),
                ("notifications", f"Notifikasi ({unread})"),
                ("github", "GitHub / private repositories"),
                ("refresh", "Refresh katalog"),
                ("doctor", "Doctor / diagnosis"),
                ("catalog", "Web catalog"),
                ("settings", "Settings"),
                ("exit", "Keluar"),
            ]
            choice = _menu(stdscr, "Dashboard", items, "Gunakan ↑↓ dan Enter. Tidak perlu mengetik nomor menu.")
            if choice in (None, "exit"):
                return
            if choice == "browse": _package_browser(stdscr)
            elif choice == "installed": _run_external(stdscr, ["status"])
            elif choice == "updates": _run_external(stdscr, ["outdated"])
            elif choice == "updateall":
                if _confirm(stdscr, "Update semua paket?"): _run_external(stdscr, ["update-all"])
            elif choice == "profiles": _run_external(stdscr, ["profile", "list"])
            elif choice == "favorites": _run_external(stdscr, ["favorite", "list"])
            elif choice == "notifications": _run_external(stdscr, ["notifications"])
            elif choice == "github": _run_external(stdscr, ["init"])
            elif choice == "refresh": _run_external(stdscr, ["refresh"])
            elif choice == "doctor": _run_external(stdscr, ["doctor"])
            elif choice == "catalog": _run_external(stdscr, ["catalog"])
            elif choice == "settings": _settings(stdscr)

    try:
        curses.wrapper(app)
    except Exception as exc:
        print(f"TUI tidak dapat digunakan ({exc}). Menggunakan mode sederhana.")
        _simple_dashboard()


def main() -> None:
    args = sys.argv[1:]
    if not args or args == ["dashboard"]:
        return run_dashboard()
    if args[0] in ("version", "--version", "-v"):
        print(VERSION)
        return
    raise SystemExit(core(args))


if __name__ == "__main__":
    main()
