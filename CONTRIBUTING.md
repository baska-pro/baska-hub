# Menambahkan Paket

## 1. Tentukan ID

Gunakan huruf kecil, angka, dan tanda minus. Contoh: `server-control`, `logo-baska`, `kuisingo`.

## 2. Tempatkan file

- aplikasi: `apps/`
- tool: `tools/`
- script: `scripts/`
- media: `media/`
- konfigurasi: `configs/`
- template: `templates/`

## 3. Tambahkan registry

Tambahkan satu baris ke `registry/packages.tsv` dengan 10 kolom schema v1.

## 4. Tambahkan manifest

Tambahkan metadata yang sama ke array `packages` pada `manifest.json`.

## 5. Checksum

Untuk file yang akan dieksekusi, hitung SHA-256:

```bash
sha256sum nama-file
```

Masukkan hasilnya ke registry dan manifest. Jangan gunakan checksum `-` untuk script/binary produksi jika checksum dapat disediakan.

## 6. Validasi

```bash
sh -n install.sh
sh -n bin/baska
python3 -m json.tool manifest.json >/dev/null
```

## Aturan keamanan

Jangan commit `.env`, token bot, password, API key, credential cloud, private key, cookie sesi, atau file rahasia lainnya.
