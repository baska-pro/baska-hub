# BASKA Hub

BASKA Hub adalah package dan GitHub repository manager interaktif untuk **Termux, Linux, dan Windows**. BASKA menyediakan dashboard TUI, katalog publik yang tersinkron otomatis, dukungan repository private melalui `baska init`, serta lifecycle install/update/remove/repair/rollback.

> Status: **Beta / public preview**. Gunakan pada perangkat Anda sendiri dan periksa detail paket sebelum menjalankan installer yang tidak Anda kenal.

## Fitur utama

- Dashboard terminal interaktif: `baska`
- Navigasi tombol arah + Enter
- Katalog repository publik otomatis
- Private repository hanya ditampilkan secara lokal setelah `baska init`
- Install berdasarkan ID atau slug
- Platform-aware installer
- Managed recovery untuk install yang gagal
- Update, remove, repair, rollback, status, versions
- Python, Node.js, Bash, PowerShell, Docker dan repository-only workflows
- Profiles, favorites, notifications, web catalog
- Distribusi melalui PyPI dan GitHub

## Persyaratan

- Python 3.10+
- Git untuk paket berbasis repository
- Koneksi internet saat refresh/install
- Dependency tambahan dapat berbeda untuk setiap paket

## Instalasi

### Termux

```bash
pkg update
pkg install -y python git
pip install baska
baska
```

Jangan menjalankan `python -m pip install -U pip` di Termux karena pip dikelola oleh package manager Termux.

### Debian / Ubuntu / UserLAnd

Direkomendasikan memakai `pipx` karena distro modern dapat menerapkan PEP 668:

```bash
sudo apt update
sudo apt install -y pipx python3-venv git
pipx ensurepath
pipx install baska
baska
```

Upgrade:

```bash
pipx upgrade baska
```

### Python environment biasa

```bash
python -m pip install baska
baska
```

Upgrade:

```bash
python -m pip install -U baska
```

### Versi terbaru langsung dari GitHub

```bash
python -m pip install -U "git+https://github.com/baska-pro/baska-hub.git"
```

### Bootstrap shell

```bash
curl -fsSL https://raw.githubusercontent.com/baska-pro/baska-hub/main/install.sh | sh
```

## Dashboard

Jalankan tanpa argumen:

```bash
baska
```

Shortcut utama pada browser paket:

```text
↑ / ↓    pilih
Enter    detail
i        install
u        update
x        repair
r        remove
/        search
Esc/q    kembali
```

## CLI

```bash
baska --help
baska help install
baska install --help
```

Perintah utama:

```bash
baska list
baska search <kata>
baska info <id|slug>
baska install <id|slug>[@tag]
baska status
baska outdated
baska update <id|slug>
baska update-all
baska repair <id|slug>
baska rollback <id|slug>
baska remove <id|slug>
baska versions <id|slug>
baska refresh
baska doctor
baska init
baska logout
baska profile list
baska favorite list
baska notifications
```

Contoh:

```bash
baska install bersihin
baska install 49991
baska info terminal-explorer
baska repair bersihin
```

## Platform dan installer

BASKA tidak memaksa semua aplikasi berjalan di semua platform. Paket Windows-only tetap ditolak di Termux/Linux, dan paket Termux-only tidak dianggap otomatis kompatibel dengan Linux biasa.

Engine installer dapat menangani:

- `install.sh` (Bash/POSIX shell detection)
- `install.ps1`
- `requirements*.txt`
- `pyproject.toml`
- `package.json`
- Docker / Compose metadata
- single shell entrypoint
- `.cmd` / `.bat` launcher
- repository-only managed clone

Clone yang dibuat BASKA berada di:

```text
~/.baska/packages/
```

Jika install sebelumnya meninggalkan managed clone dalam kondisi berubah, BASKA dapat membuat backup dan memulihkannya sebelum retry. Workspace Git pengguna di luar direktori BASKA tidak di-reset otomatis.

## ID paket

- Public repository: ID numerik 5 digit
- Private repository: `Pxxxxx`, dibuat lokal setelah autentikasi
- Asset: `Axxxxx`

ID repository lama dipertahankan saat katalog diperbarui. Repository publik baru mendapat ID berikutnya.

## Private repository

Metadata private **tidak disimpan di katalog publik**.

```bash
baska init
```

BASKA memverifikasi akun GitHub yang diizinkan dan menyimpan katalog private secara lokal di `~/.baska/`.

## Pengembangan

```bash
git clone https://github.com/baska-pro/baska-hub.git
cd baska-hub
python3 scripts/audit_catalog.py
python3 -m py_compile bin/baska baska_help.py baska_tui_v2.py baska_core_v2.py
```

Lihat [CONTRIBUTING.md](CONTRIBUTING.md) sebelum mengirim perubahan.

## Keamanan

BASKA dapat menjalankan installer dari repository yang dipilih pengguna. Baca [SECURITY.md](SECURITY.md) untuk model keamanan dan pelaporan kerentanan.

## Lisensi

MIT License. Lihat [LICENSE](LICENSE).
