# Scripts

Folder script maintenance, audit, sinkronisasi, dan validator tambahan untuk BASKA Hub. Script di sini mendukung repository/CI dan bukan entry point utama CLI pengguna.

## File dan subfolder

| Path | Fungsi |
|---|---|
| `audit_catalog.py` | Auditor katalog publik. Memeriksa ID/slug unik, platform/action valid, tidak ada private package bocor, recipe tersedia, status/install policy konsisten, serta setiap repository publik memiliki policy eksplisit di `registry/overrides.json`. |
| `sync_repositories.py` | Sinkronisasi metadata repository publik BASKA dari GitHub dan membangun data katalog/manifest yang digunakan Hub. |
| `check-lavi-telegram-gas.mjs` | Validator mirror Lavi Finance Telegram GAS: ukuran minimum, marker fungsi/fitur wajib, VERSION, SHA-256, dan scan credential literal. |
| `gas/` | Kumpulan source Google Apps Script yang disimpan sebagai mirror/script publik. Lihat `gas/README.md`. |
| `README.md` | Dokumentasi folder scripts. |

## Aturan

Script maintenance tidak boleh menyimpan credential. Untuk perubahan generator/auditor, jalankan workflow validasi karena output seperti `registry/catalog.json` dan `manifest.json` dapat ikut berubah.
