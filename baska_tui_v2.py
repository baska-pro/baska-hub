from __future__ import annotations

import curses
import json
import os
import platform
import sys
from pathlib import Path

from baska_core_v2 import VERSION, run_cli

HOME = Path(os.getenv("BASKA_HOME", str(Path.home() / ".baska"))).expanduser()
CATALOG = HOME / "cache" / "catalog.json"
STATE = HOME / "state.json"
CONFIG = HOME / "config.json"


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def platform_label() -> str:
    if os.getenv("TERMUX_VERSION") or "com.termux" in os.getenv("PREFIX", ""):
        p = "termux"
    else:
        p = platform.system().lower() or "unknown"
    a = platform.machine().lower() or "unknown"
    if a == "aarch64": a = "arm64"
    if a == "amd64": a = "x86_64"
    return f"{p}/{a}"


def github_label() -> str:
    return load_json(CONFIG, {}).get("github_user") or "public"


def packages() -> list[dict]:
    return list(load_json(CATALOG, {"packages": []}).get("packages", []))


def installed() -> set[str]:
    return set(load_json(STATE, {"installed": {}}).get("installed", {}).keys())


def safe(stdscr, y, x, text, attr=0):
    try:
        h, w = stdscr.getmaxyx()
        if 0 <= y < h and x < w:
            stdscr.addnstr(y, x, str(text), max(0, w - x - 1), attr)
    except Exception:
        pass


def header(stdscr, title, subtitle=""):
    h, w = stdscr.getmaxyx()
    stdscr.erase()
    safe(stdscr, 0, 0, " " * max(1, w - 1), curses.A_REVERSE)
    safe(stdscr, 0, 1, f" BASKA HUB  v{VERSION} ", curses.A_BOLD | curses.A_REVERSE)
    right = f"{platform_label()} · GitHub:{github_label()}"
    if len(right) < w - 24:
        safe(stdscr, 0, w - len(right) - 2, right, curses.A_REVERSE)
    safe(stdscr, 2, 2, title, curses.A_BOLD)
    if subtitle:
        safe(stdscr, 3, 2, subtitle, curses.A_DIM)
        return 5
    return 4


def menu(stdscr, title, items, subtitle=""):
    idx = 0
    while True:
        top = header(stdscr, title, subtitle)
        h, w = stdscr.getmaxyx()
        visible = max(3, h - top - 3)
        start = max(0, min(idx - visible // 2, max(0, len(items) - visible)))
        for row, (key, label) in enumerate(items[start:start + visible]):
            actual = start + row
            attr = curses.A_REVERSE | curses.A_BOLD if actual == idx else 0
            safe(stdscr, top + row, 1, " " * max(1, w - 2), attr)
            safe(stdscr, top + row, 2, ("› " if actual == idx else "  ") + label, attr)
        safe(stdscr, h - 1, 1, "↑↓ pilih  Enter buka  Esc/q kembali  Ctrl+C keluar", curses.A_DIM)
        stdscr.refresh()
        ch = stdscr.getch()
        if ch in (curses.KEY_UP, ord('k')): idx = (idx - 1) % len(items)
        elif ch in (curses.KEY_DOWN, ord('j')): idx = (idx + 1) % len(items)
        elif ch in (10, 13, curses.KEY_RIGHT): return items[idx][0]
        elif ch in (27, ord('q'), curses.KEY_LEFT): return None


def prompt(stdscr, text):
    h, w = stdscr.getmaxyx()
    buf = []
    curses.curs_set(1)
    try:
        while True:
            safe(stdscr, h - 2, 0, " " * max(1, w - 1))
            shown = text + "".join(buf)
            safe(stdscr, h - 2, 1, shown)
            try: stdscr.move(h - 2, min(w - 2, len(shown) + 1))
            except Exception: pass
            stdscr.refresh()
            ch = stdscr.getch()
            if ch in (10, 13):
                value = "".join(buf).strip()
                return value or None
            if ch == 27: return None
            if ch in (127, 8, curses.KEY_BACKSPACE):
                if buf: buf.pop()
            elif 32 <= ch <= 126: buf.append(chr(ch))
    finally:
        try: curses.curs_set(0)
        except Exception: pass


def confirm(stdscr, text):
    h, w = stdscr.getmaxyx()
    line = f"{text}  [Enter=Ya] [Esc=Tidak]"
    safe(stdscr, h // 2, 1, " " * max(1, w - 2), curses.A_REVERSE)
    safe(stdscr, h // 2, 2, line, curses.A_REVERSE)
    stdscr.refresh()
    while True:
        ch = stdscr.getch()
        if ch in (10, 13, ord('y'), ord('Y')): return True
        if ch in (27, ord('n'), ord('N'), ord('q')): return False


def external(stdscr, args):
    curses.def_prog_mode()
    curses.endwin()
    try:
        print()
        rc = run_cli(args)
        print()
        try:
            input("Enter untuk kembali ke BASKA...")
        except EOFError:
            pass
        return rc
    finally:
        # Selalu pulihkan mode curses, termasuk bila pengguna menekan Ctrl+C
        # ketika command/subprocess atau prompt "Enter untuk kembali" aktif.
        try:
            curses.reset_prog_mode()
            stdscr.refresh()
        except Exception:
            pass


def browser(stdscr):
    query = ""
    idx = 0
    while True:
        allp = packages()
        needle = query.lower()
        rows = [p for p in allp if needle in " ".join([str(p.get('id','')), p.get('slug',''), p.get('name',''), p.get('description',''), ' '.join(p.get('tags',[]))]).lower()]
        idx = min(idx, max(0, len(rows)-1))
        top = header(stdscr, "Repository & Paket", f"{len(rows)} item · filter: {query or 'semua'}")
        h, w = stdscr.getmaxyx(); visible = max(3, h-top-4)
        start = max(0, min(idx-visible//2, max(0, len(rows)-visible))) if rows else 0
        inst = installed()
        for n, p in enumerate(rows[start:start+visible]):
            actual = start+n; attr = curses.A_REVERSE|curses.A_BOLD if actual==idx else 0
            mark = "✓" if p.get('slug') in inst else " "
            line = f"{mark} {str(p.get('id','')):<7} {p.get('slug',''):<26.26} {','.join(p.get('platforms',['all'])):<14.14} {p.get('status','')}"
            safe(stdscr, top+n, 1, " "*max(1,w-2), attr); safe(stdscr, top+n, 2, line, attr)
        if not rows: safe(stdscr, top+1, 3, "Tidak ada hasil.", curses.A_DIM)
        safe(stdscr, h-1, 1, "↑↓  Enter detail  i install  u update  r remove  x repair  / cari  Esc", curses.A_DIM)
        stdscr.refresh(); ch=stdscr.getch()
        if ch in (curses.KEY_UP, ord('k')) and rows: idx=(idx-1)%len(rows)
        elif ch in (curses.KEY_DOWN, ord('j')) and rows: idx=(idx+1)%len(rows)
        elif ch == ord('/'):
            v=prompt(stdscr,"Cari: ")
            if v is not None: query=v; idx=0
        elif ch in (10,13,curses.KEY_RIGHT) and rows: detail(stdscr, rows[idx])
        elif ch == ord('i') and rows and confirm(stdscr,f"Install {rows[idx].get('slug')}?"): external(stdscr,["install",str(rows[idx].get('id'))])
        elif ch == ord('u') and rows: external(stdscr,["update",str(rows[idx].get('id'))])
        elif ch == ord('r') and rows and confirm(stdscr,f"Remove {rows[idx].get('slug')}?"): external(stdscr,["-y","remove",str(rows[idx].get('id'))])
        elif ch == ord('x') and rows: external(stdscr,["repair",str(rows[idx].get('id'))])
        elif ch in (27,ord('q'),curses.KEY_LEFT): return


def detail(stdscr,p):
    while True:
        top=header(stdscr,p.get('name') or p.get('slug'),f"ID {p.get('id')} · {p.get('visibility','public')} · {p.get('status','ready')}")
        h,_=stdscr.getmaxyx(); fields=[("Slug",p.get('slug')),("Versi",p.get('version')),("Platform",', '.join(p.get('platforms',[]))),("Action",p.get('action')),("Bahasa",p.get('language')),("Trust",p.get('trust')),("Tags",', '.join(p.get('tags',[])[:10])),("Deskripsi",p.get('description'))]
        y=top
        for k,v in fields:
            if not v: continue
            safe(stdscr,y,2,f"{k:<11}",curses.A_BOLD); safe(stdscr,y,14,v); y+=1
            if y>=h-3: break
        safe(stdscr,h-1,1,"i install  u update  x repair  r remove  v versions  Esc",curses.A_DIM); stdscr.refresh(); ch=stdscr.getch(); ident=str(p.get('id'))
        if ch==ord('i') and confirm(stdscr,f"Install {p.get('slug')}?"): external(stdscr,["install",ident])
        elif ch==ord('u'): external(stdscr,["update",ident])
        elif ch==ord('x'): external(stdscr,["repair",ident])
        elif ch==ord('r') and confirm(stdscr,f"Remove {p.get('slug')}?"): external(stdscr,["-y","remove",ident])
        elif ch==ord('v'): external(stdscr,["versions",ident])
        elif ch in (27,ord('q'),curses.KEY_LEFT): return


def dashboard(stdscr):
    try: curses.curs_set(0)
    except Exception: pass
    stdscr.keypad(True)
    while True:
        unread=sum(1 for n in load_json(STATE,{}).get('notifications',[]) if not n.get('read'))
        items=[("browse","Repository & paket"),("status","Paket terpasang / status"),("outdated","Cek update"),("updateall","Update semua"),("profiles","Profiles & collections"),("favorites","Favorites"),("notes",f"Notifikasi ({unread})"),("github","GitHub / private repositories"),("refresh","Refresh katalog"),("doctor","Doctor / diagnosis"),("catalog","Web catalog"),("exit","Keluar")]
        c=menu(stdscr,"Dashboard",items,"Navigasi tombol arah. Tidak perlu mengetik nomor menu.")
        if c in (None,"exit"): return
        if c=="browse": browser(stdscr)
        elif c=="status": external(stdscr,["status"])
        elif c=="outdated": external(stdscr,["outdated"])
        elif c=="updateall" and confirm(stdscr,"Update semua paket?"): external(stdscr,["update-all"])
        elif c=="profiles": external(stdscr,["profile","list"])
        elif c=="favorites": external(stdscr,["favorite","list"])
        elif c=="notes": external(stdscr,["notifications"])
        elif c=="github": external(stdscr,["init"])
        elif c=="refresh": external(stdscr,["refresh"])
        elif c=="doctor": external(stdscr,["doctor"])
        elif c=="catalog": external(stdscr,["catalog"])


def simple():
    while True:
        print(f"\nBASKA HUB v{VERSION}")
        print("1. Daftar paket\n2. Install\n3. Status\n4. Update semua\n5. Doctor\n0. Keluar")
        c=input("Pilih: ").strip()
        if c=="1": run_cli(["list"])
        elif c=="2":
            t=input("ID/slug: ").strip()
            if t: run_cli(["install",t])
        elif c=="3": run_cli(["status"])
        elif c=="4": run_cli(["update-all"])
        elif c=="5": run_cli(["doctor"])
        elif c=="0": return


def _print_interrupt(message="BASKA ditutup."):
    # curses.wrapper sudah mengembalikan terminal ke mode normal sebelum
    # KeyboardInterrupt diteruskan ke sini.
    try:
        print(f"\n{message}")
    except Exception:
        pass


def main():
    args=sys.argv[1:]
    if args and args[0] in ("version","--version","-v"):
        print(VERSION); return
    if args:
        try:
            rc = run_cli(args)
        except KeyboardInterrupt:
            _print_interrupt("Dibatalkan oleh pengguna.")
            raise SystemExit(130)
        raise SystemExit(rc)
    try:
        curses.wrapper(dashboard)
    except KeyboardInterrupt:
        _print_interrupt()
        return
    except Exception as exc:
        print(f"TUI tidak tersedia ({exc}); menggunakan mode sederhana.")
        try:
            simple()
        except KeyboardInterrupt:
            _print_interrupt()
            return


if __name__ == "__main__":
    main()
