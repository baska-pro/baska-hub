# Android Apps

Folder ini menampung paket aplikasi Android yang dapat didistribusikan atau dipasang melalui BASKA Hub/Termux.

## Isi folder

| Path | Fungsi |
|---|---|
| `kuisingo/` | Paket distribusi Android KuisinGo beserta metadata instalasinya. |
| `lavideck/` | **LaviDeck v2.2.0** — APK, AAB, source code Android, dan metadata katalog. |
| `README.md` | Dokumentasi folder Android. |

Setiap subfolder aplikasi Android menyimpan APK dan metadata `package.json` yang menunjuk file entry yang benar agar installer BASKA dapat mengenali paket secara deterministik. Instalasi APK tetap melalui Android Package Installer.
