# LaviDeck — Android App Organizer

**Versi:** 2.2.0 · **Package:** `com.lavi.apphub` · **Android:** 8.0+ (API 26) · **Target:** API 36

LaviDeck adalah pengelola shortcut aplikasi Android mandiri dan offline. Fitur: kategorisasi otomatis/manual, folder campuran aplikasi dan website, pencarian, favorit, Light/Dark Mode, serta shortcut layar utama. Versi 2.2.0 menggunakan daftar aplikasi virtual untuk mengurangi lag dan menambahkan area tujuan besar untuk drag-and-drop.

## Download & instal

| File | Fungsi |
|---|---|
| [LaviDeck-v2.2.0.apk](./LaviDeck-v2.2.0.apk) | APK untuk instalasi langsung Android |
| [LaviDeck-v2.2.0.aab](./LaviDeck-v2.2.0.aab) | Android App Bundle bertanda tangan untuk pengujian publikasi |
| [package.json](./package.json) | Metadata katalog BASKA Hub |

**SHA-256 APK:** `ff7185256fdde040d7517b9aa644b9e554b906b37da3d7ca6f56b29174d5c9da`

Buka APK di Android dan setujui instalasi melalui package installer sistem. LaviDeck menggunakan ID paket dan sertifikat yang sama dengan Lavi Apps/Lavi Shortcuts sebelumnya agar bisa diperbarui tanpa menghapus konfigurasi pengguna.

## Struktur kode

- [app/](./app/) — sumber Android Java, manifest, ikon dan string.
- [play-store/](./play-store/) — proyek Gradle untuk dibuka dengan Android Studio (compileSdk 36).
- [store-assets/](./store-assets/) — ikon, materi listing, dan draf kebijakan privasi.
- [RELEASE_NOTES.md](./RELEASE_NOTES.md) — catatan perubahan.

Untuk membangun sendiri, buka folder `play-store/` menggunakan Android Studio dan jalankan build Gradle. Bundel resmi yang disertakan telah ditandatangani dengan kunci penerbit lokal yang **tidak disimpan di GitHub**. APK hasil build dengan kunci berbeda tidak dapat memperbarui versi resmi tanpa uninstall.

> Status: paket berhasil dikompilasi dan tanda tangan divalidasi; uji perilaku pada perangkat Android serta peninjauan Play Console tetap diperlukan sebelum dianggap siap produksi.
