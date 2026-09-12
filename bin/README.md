# BASKA Executables

Folder ini berisi entry point executable untuk CLI BASKA.

## File

| File | Fungsi |
|---|---|
| `baska` | Launcher utama Python. Menentukan versi package, menangani `help`, `upgrade/self-update`, meneruskan command langsung ke core, lalu memilih TUI curses atau fallback UI portable saat dijalankan tanpa argumen. |
| `baska-core` | Core runtime standalone yang menangani katalog, state/config lokal, package directory, instalasi/operasi paket, network/download, hashing, platform detection, dan fungsi CLI tingkat rendah. |
| `README.md` | Dokumentasi folder executable. |

## Hubungan runtime

`baska` adalah entry point yang ramah pengguna, sedangkan `baska-core` menyediakan implementasi runtime yang lebih lengkap. File di folder ini memiliki mode executable dan perlu dipertahankan permission-nya saat release/install.
