from __future__ import annotations

from baska_core_v2 import VERSION

COMMANDS = {
    "dashboard": ("baska dashboard", "Buka dashboard terminal interaktif."),
    "list": ("baska list", "Tampilkan semua repository dan paket yang tersedia."),
    "search": ("baska search <kata>", "Cari paket berdasarkan ID, nama, alias, tag, atau deskripsi."),
    "info": ("baska info <id|slug>", "Tampilkan detail sebuah paket."),
    "install": ("baska install <id|slug>[@tag]", "Install paket atau repository pada platform yang didukung."),
    "status": ("baska status", "Tampilkan paket yang dikelola BASKA dan statusnya."),
    "outdated": ("baska outdated", "Periksa paket yang memiliki update."),
    "update": ("baska update <id|slug>", "Update satu paket."),
    "update-all": ("baska update-all", "Update semua paket yang dikelola BASKA."),
    "remove": ("baska remove <id|slug>", "Hapus paket dari direktori terkelola BASKA."),
    "repair": ("baska repair <id|slug>", "Pulihkan managed clone dan jalankan ulang installer paket."),
    "rollback": ("baska rollback <id|slug>", "Kembali ke commit yang tersimpan sebelum update terakhir."),
    "versions": ("baska versions <id|slug>", "Tampilkan tag/versi repository yang tersedia."),
    "refresh": ("baska refresh", "Unduh ulang katalog paket publik terbaru."),
    "doctor": ("baska doctor", "Periksa platform, dependency, katalog, Git dan autentikasi."),
    "init": ("baska init", "Hubungkan GitHub untuk private repository milik akun yang diizinkan."),
    "logout": ("baska logout", "Hapus sesi private BASKA lokal tanpa mengubah login GitHub global."),
    "catalog": ("baska catalog", "Buka web catalog BASKA jika tersedia."),
    "notifications": ("baska notifications", "Tampilkan notifikasi katalog dan update."),
    "favorite": ("baska favorite <add|remove|list> [id|slug]", "Kelola paket favorit."),
    "profile": ("baska profile <list|show|setup> [nama]", "Lihat atau install collection/profile paket."),
    "version": ("baska version", "Tampilkan versi BASKA."),
}


def _line(title: str, value: str, width: int = 18) -> str:
    return f"  {title:<{width}} {value}"


def show_help(command: str | None = None) -> None:
    if command:
        item = COMMANDS.get(command)
        if not item:
            print(f"Perintah tidak dikenal: {command}\n")
            print("Gunakan: baska --help")
            return
        usage, description = item
        print(f"BASKA HUB v{VERSION}")
        print("=" * 56)
        print(f"\n{description}\n")
        print("PENGGUNAAN")
        print(f"  {usage}\n")
        print("OPSI UMUM")
        print(_line("-y, --yes", "Konfirmasi otomatis untuk operasi yang mendukungnya."))
        print(_line("-h, --help", "Tampilkan bantuan perintah."))
        print("\nCONTOH")
        examples = {
            "install": ["baska install bersihin", "baska install 49991", "baska install terminal-explorer@v3.0.0"],
            "update": ["baska update bersihin"],
            "repair": ["baska repair bersihin"],
            "remove": ["baska remove bersihin"],
            "search": ["baska search terminal"],
            "info": ["baska info 49992"],
            "profile": ["baska profile list", "baska profile setup server"],
            "favorite": ["baska favorite add bersihin", "baska favorite list"],
        }.get(command, [usage])
        for example in examples:
            print(f"  {example}")
        return

    print(f"BASKA HUB v{VERSION}")
    print("Package & Repository Manager")
    print("=" * 56)
    print("\nPENGGUNAAN")
    print("  baska                         Buka dashboard interaktif")
    print("  baska <perintah> [opsi]      Jalankan perintah langsung")
    print("  baska help <perintah>        Bantuan untuk satu perintah")

    groups = [
        ("JELAJAH", ["list", "search", "info"]),
        ("INSTALASI", ["install", "status", "repair", "remove", "rollback"]),
        ("UPDATE", ["outdated", "update", "update-all", "versions"]),
        ("KATALOG & KOLEKSI", ["refresh", "profile", "favorite", "notifications", "catalog"]),
        ("GITHUB & DIAGNOSIS", ["init", "logout", "doctor", "version"]),
    ]
    for title, names in groups:
        print(f"\n{title}")
        for name in names:
            usage, description = COMMANDS[name]
            short_usage = usage.removeprefix("baska ")
            print(_line(short_usage, description, 34))

    print("\nOPSI UMUM")
    print(_line("-y, --yes", "Konfirmasi otomatis untuk operasi yang didukung."))
    print(_line("-h, --help", "Tampilkan bantuan ini."))
    print(_line("-v, --version", "Tampilkan versi BASKA."))

    print("\nCONTOH")
    for example in (
        "baska install bersihin",
        "baska install 49991",
        "baska search terminal",
        "baska info terminal-explorer",
        "baska outdated",
        "baska update-all",
        "baska repair bersihin",
        "baska init",
    ):
        print(f"  {example}")

    print("\nTIP")
    print("  Jalankan 'baska' tanpa argumen untuk navigasi dengan tombol arah dan Enter.")
    print("  Jalankan 'baska help install' untuk bantuan khusus perintah install.")
