# GitHub Actions Workflows

Folder ini berisi CI/CD dan otomasi repository BASKA Hub.

## File

| File | Fungsi |
|---|---|
| `validate.yml` | Validasi utama repository: memeriksa struktur, syntax/format yang diperlukan, katalog publik, install policy, serta konsistensi artefak sebelum perubahan dianggap sehat. |
| `sync-repositories.yml` | Menjalankan sinkronisasi repository publik BASKA, membangun ulang data katalog/manifest yang dihasilkan, memvalidasinya, lalu melakukan commit bila ada perubahan. |
| `lavi-telegram-mirror-ci.yml` | Memvalidasi mirror `scripts/gas/telegram.gs`: SHA-256, syntax JavaScript/V8, smoke marker, dan pemeriksaan credential literal. Workflow ini tidak mendeploy GAS production. |
| `pages.yml` | Workflow publikasi dokumentasi/web statis repository melalui GitHub Pages. |
| `publish-pypi.yml` | Build dan publikasi paket Python BASKA ke PyPI pada alur release yang ditentukan, termasuk langkah validasi/build sebelum publish. |
| `release-integrity.yml` | Pemeriksaan integritas artefak release agar file distribusi dan checksum tetap konsisten. |
| `README.md` | Dokumentasi folder workflow ini. |

## Prinsip keamanan

- Workflow mirror GAS bersifat validasi saja, bukan auto-deploy ke Apps Script production.
- Credential tidak boleh ditulis langsung di source workflow.
- Perubahan ke `validate.yml` atau `sync-repositories.yml` perlu diuji karena keduanya menjaga konsistensi katalog publik.
