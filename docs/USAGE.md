# BASKA CLI Usage

Jalankan `baska` untuk dashboard. Direct command tetap tersedia.

## Install dan versi
```bash
baska install server-control
baska install 49990
baska install server-control@linux-v4.0.0
baska versions server-control
```

## Lifecycle
```bash
baska status
baska outdated
baska update server-control
baska update-all
baska rollback server-control
baska repair server-control
baska remove server-control
```

## Private
```bash
baska init
baska list
baska logout
```
Private repo muncul sebagai Pxxxxx hanya setelah autentikasi akun baska-pro.

## Profiles
```bash
baska profile list
baska profile show windows
baska profile setup windows
```

## Smart installer
Mendeteksi install.sh, install.ps1, requirements*.txt, pyproject.toml/setup.py, package.json, Docker Compose dan Dockerfile. Paket reviewed meminta konfirmasi sebelum eksekusi.
