# `.github`

Folder ini berisi konfigurasi kolaborasi dan otomasi GitHub untuk BASKA Hub. File di sini tidak menjadi bagian dari runtime CLI `baska`, tetapi mengatur template kontribusi, issue, dan GitHub Actions.

## Isi folder

| Path | Fungsi |
|---|---|
| `pull_request_template.md` | Template default saat membuat Pull Request agar perubahan, pengujian, dampak kompatibilitas, dan checklist keamanan dijelaskan konsisten. |
| `ISSUE_TEMPLATE/` | Template issue GitHub untuk laporan bug, permintaan fitur, dan konfigurasi issue chooser. Lihat `ISSUE_TEMPLATE/README.md`. |
| `workflows/` | Seluruh workflow GitHub Actions: validasi, sinkronisasi katalog, Pages, release, PyPI, dan mirror GAS. Lihat `workflows/README.md`. |
| `README.md` | Dokumentasi folder ini. |

## Catatan

Perubahan workflow dapat memengaruhi CI/CD repository. Jangan menaruh token, password, API key, atau credential langsung di YAML; gunakan GitHub Secrets/Variables bila workflow memang memerlukannya.
