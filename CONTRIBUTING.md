# Contributing to BASKA Hub

Terima kasih telah membantu meningkatkan BASKA Hub.

## Prinsip utama

- Jangan commit secret, token, password, private key, `.env`, cookie, credential cloud, atau data private.
- Jangan menambahkan private repository ke katalog publik.
- Jangan mengubah ID paket lama hanya karena urutan repo berubah.
- Installer harus aman, dapat diaudit, dan hanya berjalan pada platform yang memang didukung.
- Workspace Git pengguna di luar `~/.baska/packages/` tidak boleh di-reset otomatis.

## Struktur katalog

Source of truth utama:

- `registry/overrides.json` — policy khusus repo publik
- `registry/assets.json` — asset non-repository
- `registry/repo-sync.json` — mapping repository ID → BASKA ID
- `scripts/sync_repositories.py` — generator katalog
- `registry/catalog.json` dan `registry/packages.tsv` — hasil sinkronisasi
- `manifest.json` — manifest distribusi

Untuk repository publik yang berasal dari GitHub, **jangan mengedit `catalog.json`, `packages.tsv`, atau `manifest.json` secara manual** kecuali sedang mengembangkan generator. Ubah policy di `registry/overrides.json`, lalu jalankan sync.

## ID policy

- Public repository: `00000`–`99999` (5 digit)
- Private repository: `Pxxxxx`, hanya lokal
- Asset: `Axxxxx`

ID lama harus stabil dan tidak digunakan ulang.

## Menambahkan / menyesuaikan paket repository

Tambahkan override bila autodetection tidak cukup:

```json
{
  "repositories": {
    "GITHUB_REPOSITORY_ID": {
      "platforms": ["linux", "termux"],
      "action": "smart",
      "tags": ["linux", "termux"]
    }
  }
}
```

Action yang didukung:

- `smart`
- `git`
- `recipe:recipes/<nama>.sh`

Recipe wajib berada di `recipes/` dan harus lolos `sh -n`.

## Menambahkan asset

Tambahkan metadata ke `registry/assets.json`. Untuk file executable atau installer, sediakan SHA-256 bila memungkinkan.

## Validasi lokal

```bash
python3 scripts/audit_catalog.py
python3 -m py_compile bin/baska baska_help.py baska_tui_v2.py baska_core_v2.py scripts/sync_repositories.py
sh -n install.sh
find recipes -type f -name '*.sh' -print0 | xargs -0 -r -n1 sh -n
python3 -m json.tool registry/overrides.json >/dev/null
python3 -m json.tool registry/assets.json >/dev/null
```

Untuk rebuild katalog:

```bash
python3 scripts/sync_repositories.py
python3 scripts/audit_catalog.py
```

## Pull request

PR sebaiknya:

- fokus pada satu perubahan utama;
- menjelaskan platform yang diuji;
- menjelaskan perubahan installer bila ada;
- menyertakan langkah reproduksi untuk bug;
- tidak menyertakan secret atau private metadata.

## Security-sensitive changes

Perubahan pada area berikut perlu review ekstra:

- `bin/baska`
- `baska_core_v2.py`
- `install.sh`
- `recipes/`
- `.github/workflows/`
- `registry/`
- publishing / release configuration

Lihat `SECURITY.md` untuk pelaporan kerentanan.
