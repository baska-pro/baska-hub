# Security Policy

BASKA Hub dapat mendistribusikan file yang dijalankan pada perangkat. Karena itu:

- Jangan simpan token, password, private key, credential, `.env`, atau cookie sesi.
- Gunakan SHA-256 untuk paket executable bila memungkinkan.
- Jangan menjalankan paket dari sumber eksternal yang tidak dikontrol tanpa verifikasi.
- Review perubahan pada `install.sh`, `bin/baska`, workflow, dan registry dengan lebih ketat karena file tersebut memengaruhi rantai distribusi.
- Jika sebuah credential pernah ter-commit, menghapus file saja tidak cukup; credential harus segera dirotasi.
