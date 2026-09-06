# Sinkronisasi Repository Otomatis

BASKA Hub menyimpan ID paket repository berdasarkan **GitHub Repository ID**, sehingga rename repository tidak membuat ID BASKA berubah.

## Aturan ID

- Format: 5 digit (`00001`, `00002`, ...).
- ID lama tidak diubah.
- ID yang pernah dipakai tidak didaur ulang.
- Repository baru mendapat ID berikutnya dari `registry/repo-sync.json`.
- `baska-hub` sendiri tidak dimasukkan sebagai paket.

## Jadwal

Workflow `.github/workflows/sync-repositories.yml` berjalan setiap jam dan juga dapat dijalankan manual dari GitHub Actions.

Repo publik milik `baska-pro` dapat ditemukan otomatis tanpa secret tambahan.

## Repository privat

Repository privat yang sudah ada telah dimasukkan ke registry. Agar **repo privat baru** juga ditemukan otomatis, tambahkan repository secret bernama:

```text
BASKA_GH_PAT
```

Token harus memiliki akses baca metadata/repository privat akun `baska-pro`. Jangan menyimpan token di source code atau registry.

## Instalasi repo privat

`baska install <id|slug>` menggunakan `git clone`/`git pull`. Karena itu device pengguna tetap harus sudah memiliki autentikasi GitHub yang dapat membaca repo privat tersebut, misalnya SSH key, Git credential manager, atau GitHub CLI/token yang dikonfigurasi secara aman.
