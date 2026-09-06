## Ringkasan

Jelaskan perubahan utama dan alasan perubahan.

## Area yang berubah

- [ ] TUI / UX
- [ ] Installer / managed packages
- [ ] Registry / catalog
- [ ] GitHub / private repository
- [ ] Packaging / PyPI
- [ ] Documentation
- [ ] Security / workflow

## Pengujian

Tuliskan command dan platform yang diuji.

```text
baska version
baska --help
python3 scripts/audit_catalog.py
```

## Checklist

- [ ] Tidak ada token, password, `.env`, private key, cookie, atau credential.
- [ ] Tidak ada metadata private repository di katalog publik.
- [ ] ID paket lama tidak berubah tanpa alasan migrasi yang jelas.
- [ ] Platform paket sudah sesuai.
- [ ] Installer tidak mereset workspace Git pengguna di luar `~/.baska/packages/`.
- [ ] Dokumentasi diperbarui bila perilaku pengguna berubah.
- [ ] CI/validator relevan sudah lulus.
