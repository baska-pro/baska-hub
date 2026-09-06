# BASKA Hub

Pusat distribusi pribadi untuk **tools, scripts, aplikasi, media, konfigurasi, template, dan paket** yang dapat diakses dari Linux maupun Termux melalui satu CLI: `baska`.

## Instalasi cepat

```bash
curl -fsSL https://raw.githubusercontent.com/baska-pro/baska-hub/main/install.sh | sh
```

Setelah terpasang:

```bash
baska list
baska search <kata>
baska info <id>
baska install <id>
baska get <id>
baska refresh
baska self-update
baska doctor
```

Contoh:

```bash
baska info kuisingo
baska install kuisingo
```

> Pada Android/Termux, APK akan diunduh lalu dibuka melalui Android Package Installer jika `termux-open` tersedia. Android tetap dapat meminta konfirmasi instalasi.

## Struktur repository

```text
baska-hub/
├── apps/                 # APK dan aplikasi
├── tools/                # Tool siap pakai
├── scripts/              # Script Bash/Python/utility
├── media/                # Gambar, icon, wallpaper, dan media
├── configs/              # Template konfigurasi aman tanpa secret
├── templates/            # Template proyek/file
├── registry/             # Registry yang dibaca CLI
├── docs/                 # Dokumentasi
├── bin/baska             # CLI universal
├── manifest.json         # Manifest machine-readable
└── install.sh            # Bootstrap installer
```

## Prinsip repository

- Satu ID unik untuk setiap paket.
- File sensitif seperti token, password, `.env`, private key, dan credential tidak boleh disimpan.
- File besar sebaiknya dipindahkan ke GitHub Releases ketika repository mulai berkembang.
- Paket yang dapat dieksekusi sebaiknya memiliki SHA-256 di registry sebelum didistribusikan luas.
- `manifest.json` adalah katalog terstruktur; `registry/packages.tsv` adalah registry ringan yang dibaca CLI tanpa `jq` atau Python.

## Platform

Target utama:

- Android + Termux
- Ubuntu / Debian
- Linux umum
- ARM64 / x86_64 selama paket terkait kompatibel

## Status

BASKA Hub saat ini menggunakan schema registry **v1** dan CLI **v0.1.0**.
