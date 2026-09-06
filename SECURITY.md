# Security Policy

BASKA Hub dapat mengunduh dan menjalankan installer dari repository yang dipilih pengguna. Karena itu perubahan pada installer, registry, publishing, dan GitHub Actions diperlakukan sebagai perubahan supply-chain sensitive.

## Versi yang didukung

Versi terbaru BASKA di PyPI dan branch `main` menerima perbaikan keamanan. Versi lama sebaiknya di-upgrade sebelum melaporkan bug yang sudah tidak dapat direproduksi pada versi terbaru.

## Melaporkan kerentanan

Jangan membuka issue publik bila laporan mengandung:

- token, API key, password, cookie, private key, atau credential;
- cara eksploitasi yang belum diperbaiki dan dapat membahayakan pengguna;
- metadata repository private.

Gunakan fitur **GitHub private vulnerability reporting / Security Advisory** pada repository ini bila tersedia. Jika fitur tersebut belum aktif, hubungi maintainer melalui profil GitHub `baska-pro` tanpa menempelkan secret pada issue publik.

Sertakan bila memungkinkan:

- versi BASKA;
- platform dan arsitektur;
- langkah reproduksi minimal;
- dampak keamanan;
- paket/repository yang terlibat;
- saran mitigasi bila ada.

## Aturan keamanan repository

- Jangan commit `.env`, token bot, password, API key, credential cloud, private key, cookie sesi, atau database berisi data sensitif.
- Private repository tidak boleh dimasukkan ke registry publik.
- Gunakan SHA-256 untuk artifact executable/installer bila memungkinkan.
- Jangan menjalankan sumber eksternal yang tidak dikontrol tanpa review.
- Perubahan pada `install.sh`, `bin/baska`, `baska_core_v2.py`, `recipes/`, `.github/workflows/`, dan `registry/` harus direview lebih ketat.
- Jika credential pernah ter-commit, menghapus file saja tidak cukup; credential harus segera dirotasi.
- Managed recovery hanya boleh reset repository di bawah `~/.baska/packages/`; workspace Git pengguna di luar direktori itu tidak boleh di-reset otomatis.

## Scope

Laporan keamanan yang relevan antara lain:

- command injection atau arbitrary command execution yang tidak sesuai aksi pengguna;
- kebocoran token/private repository metadata;
- path traversal atau overwrite file di luar direktori yang seharusnya;
- supply-chain compromise pada publishing atau auto-sync;
- bypass validasi platform/trust yang menyebabkan installer yang salah dijalankan;
- insecure credential storage.
