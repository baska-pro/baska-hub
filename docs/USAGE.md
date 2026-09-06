# Penggunaan BASKA CLI

## Instalasi

```bash
curl -fsSL https://raw.githubusercontent.com/baska-pro/baska-hub/main/install.sh | sh
```

## Command utama

```bash
baska list
baska search apk
baska info kuisingo
baska install kuisingo
baska get kuisingo
baska refresh
baska self-update
baska doctor
```

### `baska list`
Menampilkan semua paket yang terdaftar.

### `baska search <kata>`
Mencari berdasarkan ID, nama, kategori, atau deskripsi.

### `baska info <id>`
Menampilkan metadata paket.

### `baska get <id> [tujuan]`
Mengunduh file tanpa melakukan aksi instalasi.

### `baska install <id>`
Melakukan aksi sesuai registry. Untuk APK pada Termux, file diunduh ke storage Android jika tersedia lalu dibuka melalui Package Installer.

### `baska refresh`
Mengambil registry terbaru dari GitHub.

### `baska self-update`
Memperbarui executable CLI dari branch utama.

### `baska doctor`
Menampilkan platform, arsitektur, downloader, lokasi data, dan repository aktif.

## Override repository

Untuk pengujian branch atau fork:

```bash
BASKA_REPO_BRANCH=nama-branch baska refresh
```

Variabel yang tersedia:

- `BASKA_REPO_OWNER`
- `BASKA_REPO_NAME`
- `BASKA_REPO_BRANCH`
- `BASKA_HOME`
- `BASKA_BIN_DIR` untuk bootstrap Linux
