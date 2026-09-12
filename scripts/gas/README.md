# Google Apps Script

Folder ini menyimpan source Google Apps Script yang dikelola atau dimirror di BASKA Hub. Credential runtime tidak disimpan di source; konfigurasi sensitif harus tetap berada di Apps Script Script Properties atau secret store yang sesuai.

## File

| File | Fungsi |
|---|---|
| `telegram.gs` | Mirror credential-free bot Telegram **Lavi Finance** untuk GAS Backend. Fitur mencakup menu transaksi, saldo, dashboard, natural search, export, undo, warning pengeluaran, deep link aplikasi, status sistem, dan webhook relay. Mirror ini divalidasi CI tetapi tidak auto-deploy ke GAS production. |
| `telegram.gs.sha256` | Checksum SHA-256 untuk memastikan `telegram.gs` tidak terpotong atau berubah tanpa pembaruan integrity marker yang disengaja. |
| `whatsapp-notofication.gs` | Google Apps Script **WA Notifikasi Absen + WuzAPI**. Mendukung text/media, mention, multi-penerima, template, hari libur, retry queue, health check, scheduler, statistik, backup/restore konfigurasi, dan trigger otomatis. Nama file `notofication` dipertahankan untuk kompatibilitas repository saat ini. |
| `README.md` | Dokumentasi folder GAS. |

## Keamanan dan sinkronisasi

- Jangan commit bot token, chat ID private, WuzAPI token, PIN, private key, atau bearer token.
- `telegram.gs` memiliki CI integrity/syntax/smoke test di `.github/workflows/lavi-telegram-mirror-ci.yml`.
- Mirror repository bukan mekanisme deployment production; perubahan production harus melalui release/deployment gate yang terkontrol.
