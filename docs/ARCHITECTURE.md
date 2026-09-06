# Arsitektur BASKA Hub

BASKA Hub memisahkan **storage**, **metadata**, dan **client**.

```text
GitHub Repository
├── files/packages
├── manifest.json
└── registry/packages.tsv
          │
          v
      BASKA CLI
          │
   ┌──────┴──────┐
   v             v
 Termux        Linux
```

## Registry

`registry/packages.tsv` sengaja menggunakan TSV agar shell dapat membacanya tanpa dependensi `jq` atau Python.

Kolom schema v1:

1. `id`
2. `name`
3. `category`
4. `type`
5. `version`
6. `platforms`
7. `path`
8. `action`
9. `sha256`
10. `description`

## Manifest

`manifest.json` menyediakan metadata yang lebih kaya untuk integrasi web, API, dashboard, atau generator katalog di masa depan.

## Actions instalasi v1

- `open` — download lalu buka dengan handler OS jika tersedia.
- `executable` — download ke `~/.baska/packages/<id>/` dan beri executable bit.
- `download` / `file` — download saja.

## File besar

Git repository cocok untuk script dan file kecil. APK, archive, video, dan binary besar sebaiknya dipindahkan bertahap ke GitHub Releases. Registry dapat dikembangkan untuk mendukung URL release secara eksplisit pada schema berikutnya.
