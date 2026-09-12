# Registry

Folder ini menyimpan data katalog dan metadata package yang dibaca/dihasilkan oleh BASKA Hub. Sebagian file merupakan output sinkronisasi otomatis, sedangkan `overrides.json` memuat kebijakan eksplisit yang dipelihara manual.

## File

| File | Fungsi |
|---|---|
| `catalog.json` | Katalog publik utama dalam JSON: package/repository yang dapat ditemukan BASKA beserta ID, platform, dependency, install action, metadata repo, release, dan status. Dibangun ulang oleh proses sync. |
| `packages.tsv` | Representasi tab-separated yang ringkas untuk daftar package; berguna untuk konsumsi/tooling yang tidak memerlukan struktur JSON penuh. |
| `collections.json` | Definisi koleksi/grup paket yang mengelompokkan package terkait. |
| `assets.json` | Registry metadata aset/distribusi yang digunakan mekanisme katalog. |
| `overrides.json` | Kebijakan install dan metadata override per `repository_id`; file ini memastikan repository publik memiliki install policy eksplisit dan tervalidasi. |
| `repo-sync.json` | Metadata hasil sinkronisasi repository untuk membantu pencatatan/state proses discovery dan refresh katalog. |
| `README.md` | Dokumentasi registry. |

## Penting

`catalog.json` dan file hasil generate dapat berubah lewat workflow `Sync BASKA Catalog`. Untuk mengubah kebijakan instalasi repository tertentu, gunakan `overrides.json` lalu biarkan proses sync membangun ulang output turunannya.
