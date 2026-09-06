from __future__ import annotations

from baska_core_v2 import VERSION, run_cli


def _run(args: list[str]) -> None:
    try:
        run_cli(args)
    except KeyboardInterrupt:
        print("\nDibatalkan oleh pengguna.")


def main() -> None:
    """Portable dashboard for Windows and terminals without curses."""
    while True:
        print(f"\nBASKA HUB v{VERSION}")
        print("=" * 48)
        print("1. Repository & paket")
        print("2. Paket terpasang / status")
        print("3. Cek update paket")
        print("4. Update semua paket")
        print("5. Refresh katalog")
        print("6. Doctor / diagnosis")
        print("7. GitHub / private repositories")
        print("8. Web catalog")
        print("9. Update BASKA")
        print("0. Keluar")
        try:
            choice = input("Pilih: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBASKA ditutup.")
            return

        if choice == "1":
            _run(["list"])
        elif choice == "2":
            _run(["status"])
        elif choice == "3":
            _run(["outdated"])
        elif choice == "4":
            _run(["update-all"])
        elif choice == "5":
            _run(["refresh"])
        elif choice == "6":
            _run(["doctor"])
        elif choice == "7":
            _run(["init"])
        elif choice == "8":
            _run(["catalog"])
        elif choice == "9":
            from baska_self_update import cli
            cli([])
        elif choice == "0":
            return
        else:
            print("Pilihan tidak dikenal.")
