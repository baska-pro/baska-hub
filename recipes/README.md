# Installation Recipes

Folder ini berisi recipe installer yang dipanggil BASKA untuk paket yang memerlukan langkah instalasi khusus di luar clone/download biasa.

## File

| File | Fungsi |
|---|---|
| `server-control.sh` | Recipe Linux untuk Server Control Suite: memeriksa platform, memasang dependency dasar bila perlu, clone/update repository, membuat Python virtual environment, memasang requirements, menyiapkan `.env`, dan membuat launcher `run-baska.sh`. Tidak ditujukan untuk Termux. |
| `shell-installer.sh` | Recipe generik untuk paket berbasis shell/installer; digunakan oleh install policy repository yang membutuhkan alur pemasangan shell terkontrol. |
| `README.md` | Dokumentasi folder recipe. |

## Keamanan

Recipe dieksekusi pada mesin pengguna dan dapat memasang dependency. Setiap perubahan harus menjaga `set -e`/error handling, tidak menyisipkan secret, dan tidak menjalankan command destruktif yang tidak diperlukan.
