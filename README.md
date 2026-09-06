# BASKA Hub

BASKA Hub adalah package/repository manager pribadi untuk Linux, Termux, dan terminal Windows.

## Install
```bash
curl -fsSL https://raw.githubusercontent.com/baska-pro/baska-hub/main/install.sh | sh
baska
```

`baska` tanpa argumen membuka dashboard terminal interaktif.

## Command
```bash
baska list
baska search <kata>
baska info <id|slug>
baska install <id|slug>[@tag]
baska status
baska outdated
baska update <id|slug>
baska update-all
baska remove <id|slug>
baska repair <id|slug>
baska rollback <id|slug>
baska versions <id|slug>
baska profile list
baska profile setup server
baska favorite add <id|slug>
baska notifications
baska init
baska refresh
baska doctor
```

## ID policy
Public repo memakai 5 digit dengan anchor 50000 untuk repo terbaru saat migrasi. Repo lama turun 49999, 49998, dst. Repo publik baru berikutnya mendapat 50001, 50002, dst. Repo private memakai Pxxxxx dan hanya dibuat lokal setelah baska init. Asset memakai Axxxxx.

## Private repository
Metadata private tidak disimpan di katalog publik. `baska init` memverifikasi akun GitHub lokal dan hanya menampilkan private repo bila akun terautentikasi adalah `baska-pro`.

## Fitur
Dashboard interaktif, auto-sync public repos, smart installer, platform/arch detection, install/update/remove/status/repair/rollback, version pinning, dependency resolver, release metadata, SHA-256/provenance, tags/categories, profiles, favorites, notifications, dan web catalog.
