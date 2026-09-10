/**
 * =====================================================================
 * WA NOTIFIKASI ABSEN - GOOGLE APPS SCRIPT + WUZAPI
 * Versi: 4.3.0
 * =====================================================================
 *
 * FITUR UTAMA
 * 1) Counter jumlah pesan terkirim per baris.
 * 2) Kirim TEXT / IMAGE / VIDEO / AUDIO / DOCUMENT / STICKER.
 * 3) Media dari URL, Google Drive URL, drive:FILE_ID, atau data URI base64.
 * 4) Mention kontak berdasarkan nama/alias/nomor/JID dan @semua.
 * 5) Format teks WhatsApp: bold, italic, bold+italic, strike, monospace, quote.
 * 6) Multi-penerima: Group WhatsApp + chat pribadi dalam satu jadwal.
 * 7) Sheet PENERIMA_WA sebagai daftar utama group/kontak tersimpan.
 * 8) Sinkron otomatis group (/group/list) + kontak (/user/contacts) dari WuzAPI.
 * 9) Sheet KONTAK tetap didukung untuk mention dan kompatibilitas versi lama.
 * 10) Sheet TEMPLATE dengan variabel dinamis.
 * 11) Kalender LIBUR + sinkron otomatis hari libur Indonesia.
 * 12) Retry otomatis dengan queue dan anti-duplikat.
 * 13) Health check session WuzAPI sebelum kirim.
 * 14) Periode aktif mulai/sampai.
 * 15) Prioritas pengiriman jika beberapa jadwal jatuh di menit yang sama.
 * 16) Statistik Jadwal Berhasil / Gagal / Success %.
 * 17) Backup konfigurasi otomatis + restore backup terakhir.
 * 18) Scheduler catch-up anti-miss + heartbeat + diagnostik trigger (v4.1.0).
 * 19) Health-check mode SOFT/HARD agar variasi fork WuzAPI tidak memblokir send (v4.1.0).
 * 20) FIX v4.2.0: deteksi baris bermakna, migrasi penerima self-heal, Success % tanpa formula locale.
 * 21) PRECISION v4.3.0: pre-fire scheduler untuk mulai tepat di awal menit target.
 * 22) FAST SETUP v4.3.0: setup incremental tanpa backup/sinkron internet yang memblokir.
 * 23) RESEND v4.3.0: perubahan jam membatalkan retry lama dan mengizinkan kirim ulang.
 *
 * TARGET PENERIMA (kolom N NOTIFIKASI)
 * - DEFAULT                  : semua penerima yang dicentang Default
 * - ABSEN                    : berdasarkan Kode/Nama/Alias di PENERIMA_WA
 * - ABSEN,ADMIN1             : beberapa target sekaligus
 * - @SEMUA_GROUP             : semua group aktif
 * - @SEMUA_PRIVATE           : semua chat pribadi aktif
 * - @SEMUA                   : semua penerima aktif
 * - Nomor/JID langsung juga didukung.
 *
 * DEFAULT JADWAL
 * - Senin-Jumat 07:50 WIB : Jangan Lupa ABSEN MASUK
 * - Senin-Kamis 17:00 WIB : Jangan Lupa ABSEN PULANG
 * - Jumat       16:00 WIB : Jangan Lupa ABSEN PULANG
 *
 * CATATAN
 * - Script hanya mengirim notifikasi. Tidak membaca isi chat.
 * - Script menggunakan trigger dispatcher setiap 1 menit.
 * - Secret seperti WUZAPI_TOKEN tetap disimpan di Script Properties,
 *   tidak disalin ke sheet backup.
 * =====================================================================
 */

const APP = Object.freeze({
  NAME: 'WA Notifikasi Absen',
  VERSION: '4.5.0',
  TIMEZONE: 'Asia/Jakarta',

  SHEET_NOTIF: 'NOTIFIKASI',
  SHEET_CONTACT: 'KONTAK',
  SHEET_GROUP: 'GROUP_WA',
  SHEET_RECIPIENT: 'PENERIMA_WA',
  SHEET_TEMPLATE: 'TEMPLATE',
  SHEET_HOLIDAY: 'LIBUR',
  SHEET_RETRY: 'RETRY_QUEUE',
  SHEET_LOG: 'LOG_KIRIM',
  SHEET_BACKUP: 'BACKUP_CONFIG',

  TRIGGER_DISPATCH: 'dispatcherNotifikasi',
  TRIGGER_MAINTENANCE: 'maintenanceHarian',
  TRIGGER_EDIT: 'onEditNotifikasiTerpasang',

  NOTIF_HEADERS: [
    'Aktif',                    // A
    'Hari',                     // B
    'Jam',                      // C
    'Pesan',                    // D
    'Keterangan',               // E
    'Jumlah Pesan Terkirim',    // F
    'Tipe',                     // G
    'Sumber Media',             // H
    'Nama File',                // I
    'Mention',                  // J
    'Style',                    // K
    'Kirim Terakhir',           // L
    'Status Terakhir',          // M
    'Target Penerima',          // N
    'Mulai',                    // O
    'Sampai',                   // P
    'Prioritas',                // Q
    'Max Retry',                // R
    'Delay Retry (Menit)',      // S
    'Jadwal Berhasil',          // T
    'Jadwal Gagal',             // U
    'Success %',                // V
    'Template',                 // W
    'Kirim Saat Libur',         // X
    'ID Jadwal'                 // Y
  ],

  CONTACT_HEADERS: [
    'Aktif',
    'Kode',
    'Nama',
    'Nomor',
    'ID / JID',
    'Alias',
    'Default',
    'Sumber',
    'Keterangan',
    'Sinkron Terakhir'
  ],

  GROUP_HEADERS: [
    'Aktif',
    'Kode',
    'Nama Group',
    'Group JID',
    'Default',
    'Keterangan',
    'Sinkron Terakhir'
  ],

  RECIPIENT_HEADERS: [
    'Aktif',
    'Kode',
    'Nama',
    'Jenis',                    // GROUP / PRIVATE
    'Nomor',                    // PRIVATE: nomor internasional tanpa +
    'ID / JID',                 // @g.us / @s.whatsapp.net / @lid
    'Alias',
    'Default',
    'Sumber',
    'Keterangan',
    'Sinkron Terakhir'
  ],

  TEMPLATE_HEADERS: [
    'Aktif',
    'Nama Template',
    'Pesan',
    'Style',
    'Keterangan'
  ],

  HOLIDAY_HEADERS: [
    'Aktif',
    'Tanggal',
    'Nama Libur',
    'Jenis',
    'Sumber',
    'Diperbarui'
  ],

  RETRY_HEADERS: [
    'Queue ID',
    'Dibuat',
    'Next Retry',
    'ID Jadwal',
    'Dedup Key',
    'Snapshot JSON',
    'Retry Ke',
    'Max Retry',
    'Delay Menit',
    'Status',
    'Error Terakhir',
    'Selesai'
  ],

  LOG_HEADERS: [
    'Waktu',
    'ID Jadwal',
    'Baris',
    'Hari',
    'Jam',
    'Penerima',
    'Tipe',
    'Bagian',
    'Percobaan',
    'Pesan / Caption',
    'Media',
    'Status',
    'HTTP',
    'Message ID',
    'Response'
  ],

  BACKUP_HEADERS: [
    'Backup ID',
    'Waktu',
    'Alasan',
    'Bagian',
    'Total Bagian',
    'Data Base64 GZIP'
  ]
});


/* =====================================================================
 * MENU & EDIT HOOK
 * ===================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('WA Notifikasi')
    .addItem('Setup Cepat / Upgrade Sistem', 'setupAwal')
    .addSeparator()
    .addItem('Pasang / Ulang Trigger', 'pasangTriggerNotifikasi')
    .addItem('Cek Scheduler', 'cekStatusScheduler')
    .addItem('Pulihkan Scheduler + Cek Sekarang', 'perbaikiScheduler')
    .addItem('Hapus Trigger', 'hapusTriggerNotifikasi')
    .addSeparator()
    .addItem('Tes Koneksi WuzAPI', 'tesKoneksiWuzapi')
    .addItem('Tes Kirim Baris Terpilih', 'tesKirimBarisTerpilih')
    .addSeparator()
    .addItem('Sinkron Buku Group + Kontak', 'sinkronPenerimaWuzapi')
    .addItem('Sinkron Hari Libur', 'sinkronLiburIndonesia')
    .addSeparator()
    .addItem('Backup Konfigurasi Sekarang', 'backupKonfigurasiManual')
    .addItem('Restore Backup Terakhir', 'restoreBackupTerakhir')
    .addSeparator()
    .addItem('Cek Konfigurasi', 'cekKonfigurasi')
    .addToUi();
}


function onEdit(e) {
  try {
    if (!e || !e.range) {
      return;
    }

    const sheet = e.range.getSheet();
    const name = sheet.getName();

    // Invalidate cache agar perubahan sheet langsung dipakai.
    if (name === APP.SHEET_CONTACT) {
      CacheService.getScriptCache().remove('CONTACT_MAP_V4');
      syncBookEditToRecipient_(sheet, e.range, 'PRIVATE', e);
      return;
    }

    if (name === APP.SHEET_RECIPIENT) {
      CacheService.getScriptCache().remove('CONTACT_MAP_V4');

      // v4.4: saat checkbox Aktif (A) diubah, penerima aktif otomatis
      // dipindahkan ke bagian paling atas. Uncheck akan turun ke kelompok
      // nonaktif. Urutan di dalam masing-masing kelompok tetap stabil.
      const firstColRecipient = e.range.getColumn();
      const lastColRecipient = e.range.getLastColumn();
      if (firstColRecipient <= 1 && lastColRecipient >= 1) {
        let preferredIdentity = '';

        // Jika satu checkbox baru diaktifkan, jadikan baris tersebut penerima
        // aktif PALING ATAS (row 2), bukan sekadar masuk kelompok aktif.
        if (e.range.getNumRows() === 1 && String(e.value || '').toUpperCase() === 'TRUE') {
          const recipientRow = sheet
            .getRange(e.range.getRow(), 1, 1, APP.RECIPIENT_HEADERS.length)
            .getValues()[0];
          preferredIdentity = recipientIdentity_(recipientRowToObject_(recipientRow));
        }

        sortRecipientSheetActiveFirst_(sheet, preferredIdentity);
      }
      return;
    }

    if (name === APP.SHEET_HOLIDAY) {
      CacheService.getScriptCache().remove('HOLIDAY_MAP_V3');
      return;
    }

    if (name === APP.SHEET_GROUP) {
      syncBookEditToRecipient_(sheet, e.range, 'GROUP', e);
      return;
    }

    if (name !== APP.SHEET_NOTIF) {
      return;
    }

    const row = e.range.getRow();

    if (row < 2) {
      return;
    }

    ensureScheduleDefaults_(sheet, row);

  } catch (err) {
    console.error('onEdit:', err);
  }
}


/**
 * Installable on-edit trigger v4.5.0.
 * Berbeda dari simple onEdit, handler ini memiliki otorisasi penuh sehingga
 * boleh memanggil dispatcher dan WuzAPI. Dipakai terutama saat kolom Jam (C)
 * diubah untuk mengizinkan kirim ulang dan meningkatkan presisi test jadwal.
 */
function onEditNotifikasiTerpasang(e) {
  try {
    if (!e || !e.range) {
      return;
    }

    const sheet = e.range.getSheet();

    if (sheet.getName() !== APP.SHEET_NOTIF) {
      return;
    }

    const firstRow = Math.max(2, e.range.getRow());
    const lastRow = e.range.getLastRow();
    const firstCol = e.range.getColumn();
    const lastCol = e.range.getLastColumn();

    // Hanya perubahan yang menyentuh kolom Jam (C).
    if (firstCol > 3 || lastCol < 3) {
      return;
    }

    for (let row = firstRow; row <= lastRow; row++) {
      resetScheduleAfterTimeEdit_(sheet, row);
    }

    // Jika jam baru adalah menit sekarang / menit berikutnya, dispatcher
    // langsung berjalan. Precision pre-fire dapat menunggu sampai awal menit.
    dispatcherNotifikasi();

  } catch (err) {
    console.error('onEditNotifikasiTerpasang:', err);
  }
}


function resetScheduleAfterTimeEdit_(sheet, row) {
  ensureScheduleDefaults_(sheet, row);

  const scheduleId = String(sheet.getRange(row, 25).getValue() || '').trim();

  if (!scheduleId) {
    return;
  }

  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(donePropertyKey_(scheduleId));
  props.deleteProperty(queuedPropertyKey_(scheduleId));

  // Batalkan retry lama agar perubahan jam tidak menyebabkan pesan lama
  // terkirim di waktu yang sudah tidak berlaku.
  try {
    const ss = sheet.getParent();
    const retrySheet = ss.getSheetByName(APP.SHEET_RETRY);

    if (retrySheet && retrySheet.getLastRow() >= 2) {
      const rows = retrySheet
        .getRange(2, 1, retrySheet.getLastRow() - 1, APP.RETRY_HEADERS.length)
        .getValues();

      rows.forEach(function(item, idx) {
        const status = String(item[9] || '').toUpperCase();
        if (
          String(item[3] || '').trim() === scheduleId &&
          (status === 'MENUNGGU' || status === 'RETRY')
        ) {
          retrySheet.getRange(idx + 2, 10).setValue('DIBATALKAN_EDIT_JAM');
          retrySheet.getRange(idx + 2, 12).setValue(new Date());
        }
      });
    }
  } catch (err) {
    console.warn('Reset retry edit jam:', err.message);
  }

  // Bersihkan marker bagian TEXT/MEDIA untuk target jadwal ini.
  try {
    const rowValues = sheet
      .getRange(row, 1, 1, APP.NOTIF_HEADERS.length)
      .getValues()[0];
    const snapshot = buildScheduleSnapshot_(
      rowValues,
      row,
      getHariIndonesia_(new Date(), getTimezone_()),
      String(rowValues[2] || '')
    );
    clearPartMarkersForSnapshot_(snapshot, '');
  } catch (_) {}

  sheet.getRange(row, 13).setValue('JADWAL DIUBAH - MENUNGGU');
}


/* =====================================================================
 * SETUP / UPGRADE
 * ===================================================================== */

function setupAwal() {
  const started = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'Script harus dipasang dari Google Spreadsheet: Extensions > Apps Script.'
    );
  }

  ss.setSpreadsheetTimeZone(APP.TIMEZONE);

  // v4.5.0 FAST SETUP + SEPARATE BOOKS:
  // Tidak lagi melakukan backup penuh, sinkron WuzAPI, atau sinkron API libur
  // secara blocking setiap kali setup dijalankan. Semua fungsi inti lokal tetap
  // dibuat/di-upgrade dan trigger dipastikan aktif.
  setupProperties_(ss);
  // v4.5: migrasikan KONTAK 5 kolom lama sebelum header buku kontak baru diterapkan.
  upgradeContactBookSchema_(ss);
  ensureAllSheetsIncremental_(ss);
  migrateLegacyRecipients_(ss);

  const recipientSheet = ss.getSheetByName(APP.SHEET_RECIPIENT);
  cleanupRecipientBlankRows_(recipientSheet);
  sortRecipientSheetActiveFirst_(recipientSheet);

  // v4.5: bila indeks gabungan sudah terisi, pecah lokal ke buku GROUP_WA
  // dan KONTAK tanpa request internet. Ini menjaga setup tetap cepat.
  const localRecipientRows = getMeaningfulRecipientRows_(recipientSheet);
  if (localRecipientRows.length) {
    syncSeparateBooksFromRecipients_(ss, localRecipientRows);
  }

  // v4.5: direktori group + kontak terisi otomatis ke buku terpisah. Agar setup tetap cepat,
  // sinkron hanya dilakukan bila belum pernah sinkron / snapshot sudah cukup
  // lama. sinkronPenerimaWuzapi() sendiri memakai UrlFetchApp.fetchAll().
  let recipientSync = null;
  if (
    propertyBool_('RECIPIENT_AUTO_SYNC', true) &&
    propertyBool_('RECIPIENT_SYNC_ON_SETUP', true) &&
    isWuzapiConfigured_() &&
    shouldSyncRecipientsOnSetup_()
  ) {
    try {
      recipientSync = sinkronPenerimaWuzapi(false);
    } catch (syncErr) {
      // Kegagalan WuzAPI tidak boleh membuat setup inti gagal.
      console.warn('Setup sinkron penerima:', syncErr.message);
    }
  }

  const notif = ss.getSheetByName(APP.SHEET_NOTIF);
  ensureAllScheduleRows_(notif);

  // Jangan hapus/buat ulang trigger jika trigger yang benar sudah ada.
  const triggerStatus = pastikanTriggerAktif_();

  const props = PropertiesService.getScriptProperties();
  props.setProperty('SETUP_SCHEMA_VERSION', APP.VERSION);
  props.setProperty('LAST_SETUP_AT', new Date().toISOString());

  SpreadsheetApp.flush();

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  ss.toast(
    'Setup selesai (' + elapsed + ' dtk). Dispatcher=' +
      triggerStatus.dispatchCount + ', Edit=' + triggerStatus.editCount +
      ', Maintenance=' + triggerStatus.maintenanceCount + '.',
    APP.NAME,
    8
  );

  return {
    version: APP.VERSION,
    seconds: Number(elapsed),
    triggers: triggerStatus,
    recipientReady: hasValidRecipientData_(ss.getSheetByName(APP.SHEET_RECIPIENT)),
    recipientSync: recipientSync
  };
}



function upgradeContactBookSchema_(ss) {
  const sheet = ss.getSheetByName(APP.SHEET_CONTACT);
  if (!sheet) return;

  const oldHeaders = sheet.getRange(1, 1, 1, Math.min(5, sheet.getMaxColumns()))
    .getValues()[0]
    .map(function(v) { return String(v || '').trim(); });

  const looksLegacy =
    oldHeaders[0] === 'Aktif' &&
    oldHeaders[1] === 'Nama' &&
    /Nomor\s*\/\s*JID/i.test(oldHeaders[2] || '');

  if (!looksLegacy) return;

  const lastRow = sheet.getLastRow();
  const source = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, 5).getValues()
    : [];

  const used = {};
  let seq = 1;
  const converted = [];

  source.forEach(function(row) {
    const name = String(row[1] || '').trim();
    const raw = String(row[2] || '').trim();
    const alias = String(row[3] || '').trim();
    const note = String(row[4] || '').trim();
    if (!name && !raw && !alias && !note) return;

    const jid = normalizePrivateJid_(raw);
    const phone = phoneFromJidOrValue_(raw || jid);
    let code;
    do {
      code = 'USR' + String(seq++).padStart(3, '0');
    } while (used[code.toLowerCase()]);
    used[code.toLowerCase()] = true;

    converted.push([
      isAktif_(row[0]),
      code,
      name || phone || jid || code,
      phone,
      jid || raw,
      alias,
      false,
      'MIGRASI KONTAK LAMA',
      note,
      ''
    ]);
  });

  ensureSheetSize_(sheet, Math.max(sheet.getMaxRows(), converted.length + 10), APP.CONTACT_HEADERS.length);
  sheet.getRange(1, 1, 1, APP.CONTACT_HEADERS.length).setValues([APP.CONTACT_HEADERS]);

  if (converted.length) {
    sheet.getRange(2, 1, converted.length, APP.CONTACT_HEADERS.length).setValues(converted);
  }

  const oldDataRows = Math.max(0, lastRow - 1);
  if (oldDataRows > converted.length) {
    sheet.getRange(2 + converted.length, 1, oldDataRows - converted.length, APP.CONTACT_HEADERS.length).clearContent();
  }

  const checkbox = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  const validationRows = Math.min(Math.max(converted.length + 50, 100), sheet.getMaxRows() - 1);
  if (validationRows > 0) {
    sheet.getRange(2, 1, validationRows, 1).setDataValidation(checkbox);
    sheet.getRange(2, 7, validationRows, 1).setDataValidation(checkbox);
  }
}

/**
 * Setup incremental: sheet yang sudah ada tidak diformat ulang ribuan sel.
 * Full ensure hanya dipanggil saat sheet belum ada. Untuk sheet yang sudah ada,
 * cukup pastikan header dan struktur inti tetap benar.
 */
function ensureAllSheetsIncremental_(ss) {
  const configs = [
    [APP.SHEET_NOTIF, APP.NOTIF_HEADERS, ensureNotificationSheet_],
    [APP.SHEET_CONTACT, APP.CONTACT_HEADERS, ensureContactSheet_],
    [APP.SHEET_GROUP, APP.GROUP_HEADERS, ensureGroupSheet_],
    [APP.SHEET_RECIPIENT, APP.RECIPIENT_HEADERS, ensureRecipientSheet_],
    [APP.SHEET_TEMPLATE, APP.TEMPLATE_HEADERS, ensureTemplateSheet_],
    [APP.SHEET_HOLIDAY, APP.HOLIDAY_HEADERS, ensureHolidaySheet_],
    [APP.SHEET_RETRY, APP.RETRY_HEADERS, ensureRetrySheet_],
    [APP.SHEET_LOG, APP.LOG_HEADERS, ensureLogSheet_],
    [APP.SHEET_BACKUP, APP.BACKUP_HEADERS, ensureBackupSheet_]
  ];

  configs.forEach(function(cfg) {
    const name = cfg[0];
    const headers = cfg[1];
    const fullEnsure = cfg[2];
    let sheet = ss.getSheetByName(name);

    if (!sheet) {
      fullEnsure(ss);
      return;
    }

    // Pastikan kolom cukup dan header sinkron, tanpa menyentuh ribuan baris.
    ensureSheetSize_(sheet, Math.max(sheet.getMaxRows(), 50), headers.length);
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  });
}


function setupProperties_(ss) {
  const props = PropertiesService.getScriptProperties();
  const current = props.getProperties();

  const defaults = {
    SPREADSHEET_ID: ss.getId(),

    WUZAPI_URL: 'https://wuzapi.domainanda.com',
    WUZAPI_TOKEN: 'ISI_TOKEN_WUZAPI',

    // Dipertahankan untuk kompatibilitas versi lama.
    WUZAPI_GROUP_JID: '120363XXXXXXXXXXXX@g.us',
    DEFAULT_GROUP_CODE: 'ABSEN',

    TIMEZONE: APP.TIMEZONE,

    // Legacy v1-v4.0.0. Tidak lagi menjadi satu-satunya toleransi scheduler.
    MAX_DELAY_MINUTES: '2',

    // FIX v4.1.0: Apps Script time-driven trigger tidak menjamin eksekusi
    // tepat pada detik/menit yang diminta. Scheduler tetap mencoba jadwal
    // yang belum terkirim dalam jendela ini (menit), dengan anti-duplikat.
    SCHEDULE_CATCHUP_MINUTES: '120',

    // v4.3.0 precision: dispatcher satu menit sebelumnya boleh menunggu
    // sampai awal menit target. Ini mengurangi risiko tampil terlambat 1 menit.
    PRECISION_MODE: 'true',
    PRECISION_PREFIRE_SECONDS: '75',
    PRECISION_MAX_SLEEP_SECONDS: '75',

    // HARD = status session yang tidak sehat memblokir kirim.
    // SOFT = hanya peringatan; request kirim tetap dicoba dan retry menangani gagal nyata.
    SESSION_HEALTHCHECK_MODE: 'SOFT',

    DEFAULT_RETRY_MAX: '3',
    DEFAULT_RETRY_DELAY_MINUTES: '5',

    MEDIA_MAX_MB: '15',
    DEFAULT_COUNTRY_CODE: '62',
    MENTION_ALL_VISIBLE: 'true',

    SESSION_HEALTHCHECK: 'true',

    RECIPIENT_AUTO_SYNC: 'true',
    RECIPIENT_SYNC_DAYS: '1',
    // v4.4: setup pertama/refresh lama langsung mengisi direktori penerima.
    // Dua endpoint WuzAPI dipanggil paralel agar setup tetap cepat.
    RECIPIENT_SYNC_ON_SETUP: 'true',
    RECIPIENT_SETUP_SYNC_MAX_AGE_MINUTES: '60',

    SKIP_HOLIDAYS: 'true',
    HOLIDAY_AUTO_SYNC: 'true',
    HOLIDAY_SYNC_DAYS: '7',

    // Sumber utama gratis tanpa API key.
    HOLIDAY_API_URL:
      'https://api-hari-libur.vercel.app/api?year={year}',

    // Fallback gratis.
    HOLIDAY_API_FALLBACK_URL:
      'https://app.opica.id/api-libur/api?year={year}',

    BACKUP_AUTO: 'true',
    BACKUP_INTERVAL_DAYS: '7',
    BACKUP_KEEP: '20',

    RETRY_QUEUE_KEEP_DAYS: '30',
    ENABLE_LOG: 'true'
  };

  Object.keys(defaults).forEach(function(key) {
    if (
      current[key] === undefined ||
      current[key] === null ||
      current[key] === ''
    ) {
      props.setProperty(key, defaults[key]);
    }
  });

  // Selalu mengikat ke spreadsheet saat setup dijalankan.
  props.setProperty('SPREADSHEET_ID', ss.getId());
}


function ensureAllSheets_(ss) {
  ensureNotificationSheet_(ss);
  ensureContactSheet_(ss);
  ensureGroupSheet_(ss);
  ensureRecipientSheet_(ss);
  ensureTemplateSheet_(ss);
  ensureHolidaySheet_(ss);
  ensureRetrySheet_(ss);
  ensureLogSheet_(ss);
  ensureBackupSheet_(ss);
}


/* =====================================================================
 * SHEET: NOTIFIKASI
 * ===================================================================== */

function ensureNotificationSheet_(ss) {
  let sheet = ss.getSheetByName(APP.SHEET_NOTIF);
  const isNew = !sheet;

  if (!sheet) {
    sheet = ss.insertSheet(APP.SHEET_NOTIF);
  }

  const hadRows = sheet.getLastRow() >= 2;

  ensureSheetSize_(sheet, 1000, APP.NOTIF_HEADERS.length);

  sheet.getRange(1, 1, 1, APP.NOTIF_HEADERS.length)
    .setValues([APP.NOTIF_HEADERS])
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  if (isNew || !hadRows) {
    const retryMax = propertyInt_('DEFAULT_RETRY_MAX', 3, 0);
    const retryDelay = propertyInt_('DEFAULT_RETRY_DELAY_MINUTES', 5, 1);

    const rows = [
      [
        true,
        'Senin,Selasa,Rabu,Kamis,Jumat',
        '07:50',
        'Jangan Lupa ABSEN MASUK',
        'Notifikasi absen masuk',
        0,
        'TEXT',
        '',
        '',
        '',
        'NONE',
        '',
        '',
        'DEFAULT',
        '',
        '',
        100,
        retryMax,
        retryDelay,
        0,
        0,
        '',
        '',
        false,
        newScheduleId_()
      ],
      [
        true,
        'Senin,Selasa,Rabu,Kamis',
        '17:00',
        'Jangan Lupa ABSEN PULANG',
        'Notifikasi absen pulang Senin-Kamis',
        0,
        'TEXT',
        '',
        '',
        '',
        'NONE',
        '',
        '',
        'DEFAULT',
        '',
        '',
        100,
        retryMax,
        retryDelay,
        0,
        0,
        '',
        '',
        false,
        newScheduleId_()
      ],
      [
        true,
        'Jumat',
        '16:00',
        'Jangan Lupa ABSEN PULANG',
        'Notifikasi absen pulang khusus Jumat',
        0,
        'TEXT',
        '',
        '',
        '',
        'NONE',
        '',
        '',
        'DEFAULT',
        '',
        '',
        100,
        retryMax,
        retryDelay,
        0,
        0,
        '',
        '',
        false,
        newScheduleId_()
      ]
    ];

    sheet.getRange(2, 1, rows.length, APP.NOTIF_HEADERS.length)
      .setValues(rows);
  }

  const checkbox = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();

  sheet.getRange('A2:A1000').setDataValidation(checkbox);
  sheet.getRange('X2:X1000').setDataValidation(checkbox);

  const typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(
      ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER'],
      true
    )
    .setAllowInvalid(false)
    .build();

  sheet.getRange('G2:G1000').setDataValidation(typeRule);

  const styleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(
      [
        'AUTO',
        'NONE',
        'BOLD',
        'ITALIC',
        'BOLD_ITALIC',
        'STRIKE',
        'MONO',
        'QUOTE'
      ],
      true
    )
    .setAllowInvalid(false)
    .build();

  sheet.getRange('K2:K1000').setDataValidation(styleRule);

  sheet.setFrozenRows(1);

  sheet.getRange('C2:C1000').setNumberFormat('@');
  sheet.getRange('F2:F1000').setNumberFormat('0');
  sheet.getRange('L2:L1000').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.getRange('O2:P1000').setNumberFormat('dd/mm/yyyy');
  sheet.getRange('Q2:U1000').setNumberFormat('0');
  sheet.getRange('V2:V1000').setNumberFormat('0.00%');

  sheet.getRange('B2:Y1000').setVerticalAlignment('top');
  sheet.getRange('B2:E1000').setWrap(true);
  sheet.getRange('H2:Y1000').setWrap(true);

  const widths = [
    65, 240, 75, 340, 220, 120, 100, 310, 170, 220,
    110, 155, 280, 170, 105, 105, 85, 90, 125, 110,
    105, 90, 165, 120, 180
  ];

  widths.forEach(function(width, i) {
    sheet.setColumnWidth(i + 1, width);
  });
}


function ensureAllScheduleRows_(sheet) {
  if (!sheet) {
    return;
  }

  const lastMeaningfulRow = getLastMeaningfulScheduleRow_(sheet);

  if (lastMeaningfulRow < 2) {
    return;
  }

  for (let row = 2; row <= lastMeaningfulRow; row++) {
    ensureScheduleDefaults_(sheet, row);
  }
}


/**
 * FIX v4.2.0
 * Data validation/checkbox pada ribuan baris dapat membuat getLastRow()
 * terlihat seolah-olah seluruh area berisi data. Scheduler tidak boleh
 * menganggap baris yang hanya berisi FALSE/default sistem sebagai jadwal.
 */
function getLastMeaningfulScheduleRow_(sheet) {
  if (!sheet || sheet.getMaxRows() < 2) {
    return 1;
  }

  // Cukup baca A:D untuk menentukan apakah sebuah baris benar-benar jadwal.
  // Jadwal valid minimal memiliki Aktif atau Hari/Jam/Pesan yang diisi user.
  const maxRows = Math.min(sheet.getMaxRows() - 1, 5000);
  const values = sheet.getRange(2, 1, maxRows, 4).getValues();

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const meaningful =
      row[0] === true ||
      String(row[1] || '').trim() !== '' ||
      String(row[2] || '').trim() !== '' ||
      String(row[3] || '').trim() !== '';

    if (meaningful) {
      return i + 2;
    }
  }

  return 1;
}


function isMeaningfulScheduleValues_(values) {
  if (!values || !values.length) {
    return false;
  }

  return (
    values[0] === true ||
    String(values[1] || '').trim() !== '' ||
    String(values[2] || '').trim() !== '' ||
    String(values[3] || '').trim() !== ''
  );
}


function ensureScheduleDefaults_(sheet, row) {
  const values = sheet
    .getRange(row, 1, 1, APP.NOTIF_HEADERS.length)
    .getValues()[0];

  if (!isMeaningfulScheduleValues_(values)) {
    return;
  }

  if (!values[5] || isNaN(Number(values[5]))) {
    sheet.getRange(row, 6).setValue(0);
  }

  if (!String(values[6] || '').trim()) {
    sheet.getRange(row, 7).setValue('TEXT');
  }

  if (!String(values[10] || '').trim()) {
    sheet.getRange(row, 11).setValue('NONE');
  }

  if (!String(values[13] || '').trim()) {
    sheet.getRange(row, 14).setValue('DEFAULT');
  }

  if (
    values[16] === '' ||
    values[16] === null ||
    isNaN(Number(values[16]))
  ) {
    sheet.getRange(row, 17).setValue(100);
  }

  if (
    values[17] === '' ||
    values[17] === null ||
    isNaN(Number(values[17]))
  ) {
    sheet.getRange(row, 18)
      .setValue(propertyInt_('DEFAULT_RETRY_MAX', 3, 0));
  }

  if (
    values[18] === '' ||
    values[18] === null ||
    isNaN(Number(values[18]))
  ) {
    sheet.getRange(row, 19)
      .setValue(propertyInt_('DEFAULT_RETRY_DELAY_MINUTES', 5, 1));
  }

  if (
    values[19] === '' ||
    values[19] === null ||
    isNaN(Number(values[19]))
  ) {
    sheet.getRange(row, 20).setValue(0);
  }

  if (
    values[20] === '' ||
    values[20] === null ||
    isNaN(Number(values[20]))
  ) {
    sheet.getRange(row, 21).setValue(0);
  }

  if (!String(values[24] || '').trim()) {
    sheet.getRange(row, 25).setValue(newScheduleId_());
  }

  // FIX v4.2.0: hindari formula yang bergantung locale spreadsheet.
  // Hitung nilai Success % langsung dari T dan U.
  updateSuccessRateCell_(sheet, row);
}


function updateSuccessRateCell_(sheet, row) {
  const success = Number(sheet.getRange(row, 20).getValue()) || 0;
  const failed = Number(sheet.getRange(row, 21).getValue()) || 0;
  const total = success + failed;
  const cell = sheet.getRange(row, 22);

  // Hapus formula lama yang bisa #ERROR pada locale tertentu.
  cell.clearContent();

  if (total > 0) {
    cell.setValue(success / total);
  }

  cell.setNumberFormat('0.00%');
}


/* =====================================================================
 * SHEET: KONTAK
 * ===================================================================== */

function ensureContactSheet_(ss) {
  let sheet = ss.getSheetByName(APP.SHEET_CONTACT);

  if (!sheet) {
    sheet = ss.insertSheet(APP.SHEET_CONTACT);
  }

  ensureSheetSize_(sheet, 1000, APP.CONTACT_HEADERS.length);

  sheet.getRange(1, 1, 1, APP.CONTACT_HEADERS.length)
    .setValues([APP.CONTACT_HEADERS])
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  const checkbox = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();

  sheet.getRange('A2:A1000').setDataValidation(checkbox);
  sheet.getRange('G2:G1000').setDataValidation(checkbox);

  [70, 110, 220, 165, 245, 200, 80, 170, 300, 160].forEach(function(width, i) {
    sheet.setColumnWidth(i + 1, width);
  });

  sheet.getRange('B2:J1000').setWrap(true);
}


/* =====================================================================
 * SHEET: GROUP_WA
 * ===================================================================== */

function ensureGroupSheet_(ss) {
  let sheet = ss.getSheetByName(APP.SHEET_GROUP);
  const isNew = !sheet;

  if (!sheet) {
    sheet = ss.insertSheet(APP.SHEET_GROUP);
  }

  ensureSheetSize_(sheet, 500, APP.GROUP_HEADERS.length);

  sheet.getRange(1, 1, 1, APP.GROUP_HEADERS.length)
    .setValues([APP.GROUP_HEADERS])
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  if (isNew || sheet.getLastRow() < 2) {
    const props = PropertiesService.getScriptProperties();

    sheet.getRange(2, 1, 1, APP.GROUP_HEADERS.length)
      .setValues([[
        true,
        String(props.getProperty('DEFAULT_GROUP_CODE') || 'ABSEN'),
        'Group Absen',
        String(
          props.getProperty('WUZAPI_GROUP_JID') ||
          '120363XXXXXXXXXXXX@g.us'
        ),
        true,
        'Group utama notifikasi',
        ''
      ]]);
  }

  sheet.setFrozenRows(1);

  const checkbox = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();

  sheet.getRange('A2:A500').setDataValidation(checkbox);
  sheet.getRange('E2:E500').setDataValidation(checkbox);

  [70, 110, 230, 240, 80, 320, 160].forEach(function(width, i) {
    sheet.setColumnWidth(i + 1, width);
  });

  sheet.getRange('B2:G500').setWrap(true);
}


/* =====================================================================
 * SHEET: PENERIMA_WA (SUMBER UTAMA TARGET)
 * ===================================================================== */

function ensureRecipientSheet_(ss) {
  let sheet = ss.getSheetByName(APP.SHEET_RECIPIENT);

  if (!sheet) {
    sheet = ss.insertSheet(APP.SHEET_RECIPIENT);
  }

  ensureSheetSize_(sheet, 5000, APP.RECIPIENT_HEADERS.length);

  sheet.getRange(1, 1, 1, APP.RECIPIENT_HEADERS.length)
    .setValues([APP.RECIPIENT_HEADERS])
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);

  const checkbox = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();

  sheet.getRange('A2:A5000').setDataValidation(checkbox);
  sheet.getRange('H2:H5000').setDataValidation(checkbox);

  const typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['GROUP', 'PRIVATE'], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange('D2:D5000').setDataValidation(typeRule);

  [
    70, 115, 240, 95, 165, 245,
    210, 80, 150, 300, 160
  ].forEach(function(width, i) {
    sheet.setColumnWidth(i + 1, width);
  });

  sheet.getRange('B2:K5000').setWrap(true);
}


function hasValidRecipientData_(sheet) {
  if (!sheet || sheet.getMaxRows() < 2) {
    return false;
  }

  // Identitas penerima ada di Kode/Nama/Jenis/Nomor/JID (B:F).
  const maxRows = Math.min(sheet.getMaxRows() - 1, 5000);
  const rows = sheet.getRange(2, 1, maxRows, APP.RECIPIENT_HEADERS.length)
    .getValues();

  return rows.some(function(row) {
    if (!isAktif_(row[0])) {
      return false;
    }

    return isValidRecipient_(recipientRowToObject_(row));
  });
}


/**
 * Mengembalikan baris penerima yang benar-benar memiliki identitas.
 * Checkbox FALSE pada baris kosong tidak dianggap sebagai data.
 */
function getMeaningfulRecipientRows_(sheet) {
  if (!sheet || sheet.getMaxRows() < 2) {
    return [];
  }

  const lastRow = Math.min(sheet.getLastRow(), 5001);
  if (lastRow < 2) {
    return [];
  }

  const scanRows = lastRow - 1;
  const values = sheet
    .getRange(2, 1, scanRows, APP.RECIPIENT_HEADERS.length)
    .getValues();

  return values.filter(function(row) {
    return recipientRowHasIdentity_(row);
  });
}


function recipientRowHasIdentity_(row) {
  if (!row) {
    return false;
  }

  // Kode, Nama, Jenis, Nomor, atau JID cukup untuk dianggap data nyata.
  return [1, 2, 3, 4, 5].some(function(index) {
    return String(row[index] || '').trim() !== '';
  });
}


/**
 * Bersihkan baris placeholder yang hanya berisi FALSE/default kosong.
 * Validation checkbox tetap dipertahankan karena clearContent tidak
 * menghapus data validation.
 */
function cleanupRecipientBlankRows_(sheet) {
  if (!sheet || sheet.getMaxRows() < 2) {
    return;
  }

  const lastRow = Math.min(sheet.getLastRow(), 5001);
  if (lastRow < 2) {
    return;
  }

  const scanRows = lastRow - 1;
  const values = sheet
    .getRange(2, 1, scanRows, APP.RECIPIENT_HEADERS.length)
    .getValues();

  const meaningful = values.filter(recipientRowHasIdentity_);

  // Tulis ulang hanya data nyata di atas, sisanya dikosongkan.
  if (meaningful.length) {
    sheet
      .getRange(2, 1, meaningful.length, APP.RECIPIENT_HEADERS.length)
      .setValues(meaningful);
  }

  const rest = scanRows - meaningful.length;
  if (rest > 0) {
    sheet
      .getRange(2 + meaningful.length, 1, rest, APP.RECIPIENT_HEADERS.length)
      .clearContent();
  }
}


/**
 * Stable partition: Aktif=TRUE selalu di atas, nonaktif di bawah.
 * Urutan antar penerima aktif tidak diacak; begitu juga penerima nonaktif.
 */
function sortRecipientRowsActiveFirst_(rows) {
  const active = [];
  const inactive = [];

  (rows || []).forEach(function(row) {
    (isAktif_(row[0]) ? active : inactive).push(row);
  });

  return active.concat(inactive);
}


function sortRecipientSheetActiveFirst_(sheet, preferredIdentity) {
  if (!sheet) {
    return;
  }

  const rows = getMeaningfulRecipientRows_(sheet);
  if (!rows.length) {
    cleanupRecipientBlankRows_(sheet);
    return;
  }

  let sorted = sortRecipientRowsActiveFirst_(rows);
  const preferred = String(preferredIdentity || '').toLowerCase();

  if (preferred) {
    const preferredIndex = sorted.findIndex(function(row) {
      if (!isAktif_(row[0])) {
        return false;
      }
      return recipientIdentity_(recipientRowToObject_(row)).toLowerCase() === preferred;
    });

    if (preferredIndex > 0) {
      const selected = sorted.splice(preferredIndex, 1)[0];
      sorted.unshift(selected);
    }
  }

  const previousLastRow = Math.min(sheet.getLastRow(), 5001);
  const previousCount = Math.max(0, previousLastRow - 1);

  sheet
    .getRange(2, 1, sorted.length, APP.RECIPIENT_HEADERS.length)
    .setValues(sorted);

  const rest = previousCount - sorted.length;
  if (rest > 0) {
    sheet
      .getRange(2 + sorted.length, 1, rest, APP.RECIPIENT_HEADERS.length)
      .clearContent();
  }
}



function shouldSyncRecipientsOnSetup_() {
  const props = PropertiesService.getScriptProperties();

  // Upgrade schema tidak memaksa request internet bila direktori lokal masih
  // baru. Buku GROUP_WA/KONTAK dibangun dari PENERIMA_WA secara lokal.

  const last = String(props.getProperty('LAST_RECIPIENT_SYNC') || '').trim();

  if (!last) {
    return true;
  }

  const parsed = new Date(last);
  if (isNaN(parsed.getTime())) {
    return true;
  }

  const maxAgeMinutes = propertyInt_(
    'RECIPIENT_SETUP_SYNC_MAX_AGE_MINUTES',
    60,
    0
  );

  if (maxAgeMinutes <= 0) {
    return true;
  }

  return (Date.now() - parsed.getTime()) >= maxAgeMinutes * 60 * 1000;
}


function hasAnyRecipientData_(sheet) {
  return getMeaningfulRecipientRows_(sheet).some(function(row) {
    return isValidRecipient_(recipientRowToObject_(row));
  });
}


/**
 * Memigrasikan GROUP_WA dan KONTAK lama ke PENERIMA_WA hanya jika belum ada.
 * Sheet lama tidak dihapus agar file versi lama / data mention tetap aman.
 */
function migrateLegacyRecipients_(ss) {
  ensureRecipientSheet_(ss);

  const target = ss.getSheetByName(APP.SHEET_RECIPIENT);

  // FIX v4.2.0: jangan pakai getLastRow() sebagai indikator isi.
  // Checkbox/data validation dapat membuat baris kosong tampak ada.
  if (hasAnyRecipientData_(target)) {
    return;
  }

  const rows = [];
  const usedCodes = {};
  const usedJids = {};

  const legacyGroups = ss.getSheetByName(APP.SHEET_GROUP);

  if (legacyGroups && legacyGroups.getLastRow() >= 2) {
    const data = legacyGroups
      .getRange(2, 1, legacyGroups.getLastRow() - 1, APP.GROUP_HEADERS.length)
      .getValues();

    data.forEach(function(row) {
      const jid = String(row[3] || '').trim();

      if (!/@g\.us$/i.test(jid) || /X{3,}/i.test(jid) || usedJids[jid.toLowerCase()]) {
        return;
      }

      const code = uniqueRecipientCode_(
        String(row[1] || '').trim() || 'GRP',
        usedCodes
      );

      usedJids[jid.toLowerCase()] = true;

      rows.push([
        isAktif_(row[0]),
        code,
        String(row[2] || '').trim() || code,
        'GROUP',
        '',
        jid,
        '',
        boolCell_(row[4]),
        'MIGRASI GROUP_WA',
        String(row[5] || ''),
        row[6] || ''
      ]);
    });
  }

  const legacyContacts = ss.getSheetByName(APP.SHEET_CONTACT);

  if (legacyContacts && legacyContacts.getLastRow() >= 2) {
    const width = Math.max(5, APP.CONTACT_HEADERS.length);
    const data = legacyContacts
      .getRange(2, 1, legacyContacts.getLastRow() - 1, width)
      .getValues();

    let seq = 1;

    data.forEach(function(row) {
      // Kompatibel dengan KONTAK lama (5 kolom) dan buku kontak v4.5 (10 kolom).
      const isNewBook = String(row[1] || '').trim().toUpperCase().match(/^USR\d+$/) || String(row[4] || '').indexOf('@') >= 0;
      const raw = isNewBook ? String(row[4] || row[3] || '').trim() : String(row[2] || '').trim();
      const jid = normalizePrivateJid_(raw);

      if (!jid || usedJids[jid.toLowerCase()]) {
        return;
      }

      let code = isNewBook ? String(row[1] || '').trim() : '';
      if (!code) {
        do {
          code = 'USR' + String(seq++).padStart(3, '0');
        } while (usedCodes[code.toLowerCase()]);
      }
      usedCodes[code.toLowerCase()] = true;
      usedJids[jid.toLowerCase()] = true;

      rows.push([
        isAktif_(row[0]),
        code,
        isNewBook ? (String(row[2] || '').trim() || code) : (String(row[1] || '').trim() || code),
        'PRIVATE',
        isNewBook ? String(row[3] || '').trim() : phoneFromJidOrValue_(raw || jid),
        jid,
        isNewBook ? String(row[5] || '').trim() : String(row[3] || '').trim(),
        isNewBook ? boolCell_(row[6]) : false,
        isNewBook ? String(row[7] || 'MIGRASI KONTAK') : 'MIGRASI KONTAK',
        isNewBook ? String(row[8] || '') : String(row[4] || ''),
        isNewBook ? (row[9] || '') : ''
      ]);
    });
  }

  // Fallback property lama jika belum ditemukan di GROUP_WA.
  if (!rows.some(function(row) { return row[3] === 'GROUP'; })) {
    const props = PropertiesService.getScriptProperties();
    const jid = String(props.getProperty('WUZAPI_GROUP_JID') || '').trim();

    if (/@g\.us$/i.test(jid) && !/X{3,}/i.test(jid)) {
      rows.push([
        true,
        uniqueRecipientCode_(String(props.getProperty('DEFAULT_GROUP_CODE') || 'ABSEN'), usedCodes),
        'Group Absen',
        'GROUP',
        '',
        jid,
        '',
        true,
        'SCRIPT PROPERTY',
        'Migrasi default versi lama',
        ''
      ]);
    }
  }

  if (rows.length) {
    target.getRange(2, 1, rows.length, APP.RECIPIENT_HEADERS.length)
      .setValues(rows);
  }
}


/* =====================================================================
 * SHEET: TEMPLATE
 * ===================================================================== */

function ensureTemplateSheet_(ss) {
  let sheet = ss.getSheetByName(APP.SHEET_TEMPLATE);
  const isNew = !sheet;

  if (!sheet) {
    sheet = ss.insertSheet(APP.SHEET_TEMPLATE);
  }

  ensureSheetSize_(sheet, 500, APP.TEMPLATE_HEADERS.length);

  sheet.getRange(1, 1, 1, APP.TEMPLATE_HEADERS.length)
    .setValues([APP.TEMPLATE_HEADERS])
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  if (isNew || sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 2, APP.TEMPLATE_HEADERS.length)
      .setValues([
        [
          true,
          'ABSEN_MASUK',
          'Jangan Lupa *ABSEN MASUK*\n\nHari: {hari}\nTanggal: {tanggal}',
          'NONE',
          'Contoh template masuk'
        ],
        [
          true,
          'ABSEN_PULANG',
          'Jangan Lupa *ABSEN PULANG*\n\nHari: {hari}\nTanggal: {tanggal}',
          'NONE',
          'Contoh template pulang'
        ]
      ]);
  }

  sheet.setFrozenRows(1);

  const checkbox = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();

  sheet.getRange('A2:A500').setDataValidation(checkbox);

  const styleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(
      [
        'NONE',
        'BOLD',
        'ITALIC',
        'BOLD_ITALIC',
        'STRIKE',
        'MONO',
        'QUOTE'
      ],
      true
    )
    .setAllowInvalid(false)
    .build();

  sheet.getRange('D2:D500').setDataValidation(styleRule);

  [70, 190, 430, 120, 320].forEach(function(width, i) {
    sheet.setColumnWidth(i + 1, width);
  });

  sheet.getRange('B2:E500').setWrap(true);
}


/* =====================================================================
 * SHEET: LIBUR
 * ===================================================================== */

function ensureHolidaySheet_(ss) {
  let sheet = ss.getSheetByName(APP.SHEET_HOLIDAY);

  if (!sheet) {
    sheet = ss.insertSheet(APP.SHEET_HOLIDAY);
  }

  ensureSheetSize_(sheet, 1000, APP.HOLIDAY_HEADERS.length);

  sheet.getRange(1, 1, 1, APP.HOLIDAY_HEADERS.length)
    .setValues([APP.HOLIDAY_HEADERS])
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  const checkbox = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();

  sheet.getRange('A2:A1000').setDataValidation(checkbox);
  sheet.getRange('B2:B1000').setNumberFormat('@');

  [70, 120, 340, 150, 220, 160].forEach(function(width, i) {
    sheet.setColumnWidth(i + 1, width);
  });

  sheet.getRange('C2:F1000').setWrap(true);
}


/* =====================================================================
 * SHEET: RETRY_QUEUE
 * ===================================================================== */

function ensureRetrySheet_(ss) {
  let sheet = ss.getSheetByName(APP.SHEET_RETRY);

  if (!sheet) {
    sheet = ss.insertSheet(APP.SHEET_RETRY);
  }

  ensureSheetSize_(sheet, 1000, APP.RETRY_HEADERS.length);

  sheet.getRange(1, 1, 1, APP.RETRY_HEADERS.length)
    .setValues([APP.RETRY_HEADERS])
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  sheet.getRange('B2:C1000').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.getRange('L2:L1000').setNumberFormat('dd/mm/yyyy hh:mm:ss');

  [210, 160, 160, 180, 190, 420, 90, 90, 100, 120, 400, 160]
    .forEach(function(width, i) {
      sheet.setColumnWidth(i + 1, width);
    });

  sheet.getRange('F2:L1000').setWrap(true);
}


/* =====================================================================
 * SHEET: LOG
 * ===================================================================== */

function ensureLogSheet_(ss) {
  let sheet = ss.getSheetByName(APP.SHEET_LOG);

  if (!sheet) {
    sheet = ss.insertSheet(APP.SHEET_LOG);
  }

  ensureSheetSize_(sheet, 1000, APP.LOG_HEADERS.length);

  sheet.getRange(1, 1, 1, APP.LOG_HEADERS.length)
    .setValues([APP.LOG_HEADERS])
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  const widths = [
    160, 180, 70, 90, 75, 220, 100, 100, 90,
    340, 280, 120, 70, 220, 430
  ];

  widths.forEach(function(width, i) {
    sheet.setColumnWidth(i + 1, width);
  });

  sheet.getRange('F2:O1000').setWrap(true);
}


/* =====================================================================
 * SHEET: BACKUP_CONFIG
 * ===================================================================== */

function ensureBackupSheet_(ss) {
  let sheet = ss.getSheetByName(APP.SHEET_BACKUP);

  if (!sheet) {
    sheet = ss.insertSheet(APP.SHEET_BACKUP);
  }

  ensureSheetSize_(sheet, 1000, APP.BACKUP_HEADERS.length);

  sheet.getRange(1, 1, 1, APP.BACKUP_HEADERS.length)
    .setValues([APP.BACKUP_HEADERS])
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  [220, 160, 220, 90, 100, 520].forEach(function(width, i) {
    sheet.setColumnWidth(i + 1, width);
  });

  sheet.getRange('C2:F1000').setWrap(true);
}


/* =====================================================================
 * TRIGGER
 * ===================================================================== */

function pasangTriggerNotifikasi() {
  hapusTriggerNotifikasi();

  const status = pastikanTriggerAktif_();
  const ss = getSpreadsheet_();

  if (ss) {
    ss.toast(
      'Trigger aktif: dispatcher setiap 1 menit + maintenance harian. ' +
      'Dispatcher=' + status.dispatchCount + ', Edit=' + status.editCount + ', Maintenance=' + status.maintenanceCount,
      APP.NAME,
      8
    );
  }

  return status;
}


function pastikanTriggerAktif_() {
  const triggers = ScriptApp.getProjectTriggers();

  let dispatchCount = triggers.filter(function(trigger) {
    return trigger.getHandlerFunction() === APP.TRIGGER_DISPATCH;
  }).length;

  let maintenanceCount = triggers.filter(function(trigger) {
    return trigger.getHandlerFunction() === APP.TRIGGER_MAINTENANCE;
  }).length;

  let editCount = triggers.filter(function(trigger) {
    return trigger.getHandlerFunction() === APP.TRIGGER_EDIT;
  }).length;

  // Jika trigger hilang karena terhapus/gagal saat upgrade, buat kembali.
  if (dispatchCount === 0) {
    ScriptApp.newTrigger(APP.TRIGGER_DISPATCH)
      .timeBased()
      .everyMinutes(1)
      .create();
    dispatchCount = 1;
  }

  if (maintenanceCount === 0) {
    ScriptApp.newTrigger(APP.TRIGGER_MAINTENANCE)
      .timeBased()
      .atHour(5)
      .everyDays(1)
      .create();
    maintenanceCount = 1;
  }

  if (editCount === 0) {
    const ss = getSpreadsheet_();
    if (ss) {
      ScriptApp.newTrigger(APP.TRIGGER_EDIT)
        .forSpreadsheet(ss)
        .onEdit()
        .create();
      editCount = 1;
    }
  }

  return {
    dispatchCount: dispatchCount,
    maintenanceCount: maintenanceCount,
    editCount: editCount
  };
}


function cekStatusScheduler() {
  const props = PropertiesService.getScriptProperties();
  const triggers = ScriptApp.getProjectTriggers();

  const dispatchCount = triggers.filter(function(trigger) {
    return trigger.getHandlerFunction() === APP.TRIGGER_DISPATCH;
  }).length;

  const maintenanceCount = triggers.filter(function(trigger) {
    return trigger.getHandlerFunction() === APP.TRIGGER_MAINTENANCE;
  }).length;

  const editCount = triggers.filter(function(trigger) {
    return trigger.getHandlerFunction() === APP.TRIGGER_EDIT;
  }).length;

  const result = {
    version: APP.VERSION,
    timezone: getTimezone_(),
    dispatcherTriggers: dispatchCount,
    maintenanceTriggers: maintenanceCount,
    editTriggers: editCount,
    precisionMode: propertyBool_('PRECISION_MODE', true),
    precisionPrefireSeconds: propertyInt_('PRECISION_PREFIRE_SECONDS', 75, 0),
    catchupMinutes: propertyInt_('SCHEDULE_CATCHUP_MINUTES', 120, 0),
    meaningfulScheduleLastRow: (function() {
      try {
        const sh = getSpreadsheet_().getSheetByName(APP.SHEET_NOTIF);
        return getLastMeaningfulScheduleRow_(sh);
      } catch (_) {
        return 0;
      }
    })(),
    hasValidRecipientData: (function() {
      try {
        const sh = getSpreadsheet_().getSheetByName(APP.SHEET_RECIPIENT);
        return hasValidRecipientData_(sh);
      } catch (_) {
        return false;
      }
    })(),
    lastDispatchRun: props.getProperty('LAST_DISPATCH_RUN') || '',
    lastDispatchLocal: props.getProperty('LAST_DISPATCH_LOCAL') || '',
    lastDispatchOk: props.getProperty('LAST_DISPATCH_OK') || '',
    lastDispatchError: props.getProperty('LAST_DISPATCH_ERROR') || '',
    lastRetryError: props.getProperty('LAST_RETRY_PROCESS_ERROR') || ''
  };

  const ss = getSpreadsheet_();

  if (ss) {
    ss.toast(
      'Dispatcher=' + dispatchCount +
      ', Edit=' + editCount +
      ', Maintenance=' + maintenanceCount +
      ', Last=' + (result.lastDispatchLocal || '-') +
      (result.lastDispatchError ? ', ERROR=' + result.lastDispatchError.substring(0, 80) : ''),
      APP.NAME,
      10
    );
  }

  console.log(JSON.stringify(result));
  return result;
}


function perbaikiScheduler() {
  const ss = getSpreadsheet_();

  // Reinstall trigger supaya hanya ada satu set trigger resmi.
  const status = pasangTriggerNotifikasi();

  // Jalankan dispatcher sekarang. Catch-up akan mengirim jadwal hari ini
  // yang belum terkirim dan masih berada dalam jendela aman.
  dispatcherNotifikasi();

  const result = cekStatusScheduler();

  if (ss) {
    ss.toast(
      'Scheduler dipulihkan dan pemeriksaan jadwal dijalankan sekarang.',
      APP.NAME,
      8
    );
  }

  result.reinstalled = status;
  return result;
}


function hapusTriggerNotifikasi() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const fn = trigger.getHandlerFunction();

    if (
      fn === APP.TRIGGER_DISPATCH ||
      fn === APP.TRIGGER_MAINTENANCE ||
      fn === APP.TRIGGER_EDIT
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}


/* =====================================================================
 * DISPATCHER UTAMA
 * ===================================================================== */

function dispatcherNotifikasi() {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  const timezone = getTimezone_();
  const startedAt = new Date();

  props.setProperty('LAST_DISPATCH_RUN', startedAt.toISOString());
  props.setProperty(
    'LAST_DISPATCH_LOCAL',
    Utilities.formatDate(startedAt, timezone, 'yyyy-MM-dd HH:mm:ss')
  );

  if (!lock.tryLock(5000)) {
    props.setProperty(
      'LAST_DISPATCH_ERROR',
      'SKIP_LOCK: eksekusi lain sedang berjalan'
    );
    return;
  }

  try {
    const ss = getSpreadsheet_();

    if (!ss) {
      throw new Error('Spreadsheet tidak ditemukan.');
    }

    const sheet = ss.getSheetByName(APP.SHEET_NOTIF);
    const lastMeaningfulRow = getLastMeaningfulScheduleRow_(sheet);

    if (!sheet || lastMeaningfulRow < 2) {
      props.setProperty('LAST_DISPATCH_OK', new Date().toISOString());
      props.deleteProperty('LAST_DISPATCH_ERROR');
      return;
    }

    ensureAllScheduleRows_(sheet);

    const now = new Date();
    const hari = getHariIndonesia_(now, timezone);
    const dateIso = Utilities.formatDate(now, timezone, 'yyyy-MM-dd');
    const clockNow = Utilities.formatDate(now, timezone, 'HH:mm:ss');
    const clockParts = clockNow.split(':').map(Number);
    const secondsNow = clockParts[0] * 3600 + clockParts[1] * 60 + clockParts[2];

    const catchupMinutes = propertyInt_(
      'SCHEDULE_CATCHUP_MINUTES',
      120,
      0
    );

    const precisionMode = propertyBool_('PRECISION_MODE', true);
    const precisionPrefireSeconds = propertyInt_(
      'PRECISION_PREFIRE_SECONDS',
      75,
      0
    );
    const precisionMaxSleepSeconds = propertyInt_(
      'PRECISION_MAX_SLEEP_SECONDS',
      75,
      0
    );

    const holidayMap = buildHolidayMap_(ss);

    const rows = sheet
      .getRange(2, 1, lastMeaningfulRow - 1, APP.NOTIF_HEADERS.length)
      .getValues();

    const due = [];

    rows.forEach(function(row, index) {
      const rowNumber = index + 2;

      if (!isAktif_(row[0])) return;
      if (!hariCocok_(row[1], hari)) return;
      if (!isDateWithinPeriod_(dateIso, row[14], row[15], timezone)) return;

      const scheduledMinutes = nilaiJamKeMenit_(row[2], timezone);

      if (scheduledMinutes === null) {
        updateScheduleStatusByRow_(
          sheet,
          rowNumber,
          'JAM TIDAK VALID: ' + String(row[2] || ''),
          null
        );
        return;
      }

      const scheduledSeconds = scheduledMinutes * 60;
      const deltaSeconds = scheduledSeconds - secondsNow;
      const lateSeconds = Math.max(0, -deltaSeconds);
      const isFuturePrecision =
        deltaSeconds > 0 &&
        precisionMode &&
        deltaSeconds <= precisionPrefireSeconds;

      // Belum waktunya dan terlalu jauh untuk pre-fire precision.
      if (deltaSeconds > 0 && !isFuturePrecision) {
        return;
      }

      // Sudah terlalu lama lewat dari jendela catch-up.
      if (deltaSeconds <= 0 && lateSeconds > catchupMinutes * 60) {
        return;
      }

      const scheduleId = String(row[24] || '').trim();
      if (!scheduleId) return;

      const scheduledTime = menitKeJam_(scheduledMinutes);
      const dedupKey = dateIso + '|' + scheduledTime;

      if (isScheduleDone_(scheduleId, dedupKey)) return;
      if (isScheduleQueued_(scheduleId, dedupKey)) return;

      const sendOnHoliday = boolCell_(row[23]);

      if (
        propertyBool_('SKIP_HOLIDAYS', true) &&
        !sendOnHoliday &&
        holidayMap[dateIso]
      ) {
        markScheduleDone_(scheduleId, dedupKey);
        updateScheduleStatusByRow_(
          sheet,
          rowNumber,
          'DILEWATI - LIBUR: ' + holidayMap[dateIso].name,
          null
        );
        return;
      }

      due.push({
        rowNumber: rowNumber,
        row: row,
        priority: safeNumber_(row[16], 100),
        scheduleId: scheduleId,
        dedupKey: dedupKey,
        hari: hari,
        jam: scheduledTime,
        scheduledSeconds: scheduledSeconds,
        waitSeconds: Math.max(0, deltaSeconds),
        delaySeconds: lateSeconds
      });
    });

    // Catch-up yang sudah terlambat diproses dahulu; future precision setelahnya.
    due.sort(function(a, b) {
      const aFuture = a.waitSeconds > 0 ? 1 : 0;
      const bFuture = b.waitSeconds > 0 ? 1 : 0;

      if (aFuture !== bFuture) return aFuture - bFuture;

      if (!aFuture && b.delaySeconds !== a.delaySeconds) {
        return b.delaySeconds - a.delaySeconds;
      }

      if (aFuture && a.scheduledSeconds !== b.scheduledSeconds) {
        return a.scheduledSeconds - b.scheduledSeconds;
      }

      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.rowNumber - b.rowNumber;
    });

    due.forEach(function(item) {
      // Precision pre-fire: trigger pada menit sebelumnya menunggu sampai awal
      // menit target. Dengan phase trigger mis. xx:47, jadwal 18:18 akan mulai
      // sekitar 18:18:00, bukan menunggu trigger 18:18:47.
      if (item.waitSeconds > 0 && precisionMode) {
        const currentClock = Utilities.formatDate(new Date(), timezone, 'HH:mm:ss')
          .split(':')
          .map(Number);
        const currentSeconds =
          currentClock[0] * 3600 + currentClock[1] * 60 + currentClock[2];
        const remaining = item.scheduledSeconds - currentSeconds;

        if (remaining > 0 && remaining <= precisionMaxSleepSeconds) {
          Utilities.sleep(remaining * 1000 + 50);
        }
      }

      const snapshot = buildScheduleSnapshot_(
        item.row,
        item.rowNumber,
        item.hari,
        item.jam
      );

      const delayMinutes = Math.floor(item.delaySeconds / 60);
      const precisionLabel = item.waitSeconds > 0 ? 'INITIAL-PRECISION' : 'INITIAL';

      try {
        executeScheduleSnapshot_(snapshot, {
          dedupKey: item.dedupKey,
          attemptLabel:
            delayMinutes > 1
              ? 'INITIAL-CATCHUP+' + delayMinutes + 'm'
              : precisionLabel,
          test: false,
          force: false
        });

        finalizeScheduleSuccess_(
          snapshot,
          item.dedupKey,
          delayMinutes > 1
            ? 'BERHASIL - CATCH-UP +' + delayMinutes + ' menit'
            : (item.waitSeconds > 0 ? 'BERHASIL - PRECISION' : 'BERHASIL')
        );

      } catch (err) {
        handleInitialScheduleFailure_(snapshot, item.dedupKey, err);
      }
    });

    try {
      processRetryQueue_(ss, 5);
      props.deleteProperty('LAST_RETRY_PROCESS_ERROR');
    } catch (retryErr) {
      props.setProperty(
        'LAST_RETRY_PROCESS_ERROR',
        ambilErrorSingkat_(retryErr)
      );
      console.error('Retry queue dispatcher:', retryErr);
    }

    props.setProperty('LAST_DISPATCH_OK', new Date().toISOString());
    props.deleteProperty('LAST_DISPATCH_ERROR');

  } catch (fatalErr) {
    props.setProperty(
      'LAST_DISPATCH_ERROR',
      ambilErrorSingkat_(fatalErr)
    );
    console.error('dispatcherNotifikasi fatal:', fatalErr);

  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
 * SNAPSHOT JADWAL
 * ===================================================================== */

function buildScheduleSnapshot_(row, rowNumber, hari, jam) {
  const templateName = String(row[22] || '').trim();
  const template = templateName
    ? getTemplateByName_(templateName)
    : null;

  return {
    version: APP.VERSION,
    scheduleId: String(row[24] || '').trim(),
    originalRow: rowNumber,

    days: String(row[1] || ''),
    time: jam,
    message: String(row[3] || ''),
    description: String(row[4] || ''),

    type: String(row[6] || 'TEXT').trim().toUpperCase(),
    mediaSource: String(row[7] || '').trim(),
    fileName: String(row[8] || '').trim(),
    mention: String(row[9] || '').trim(),
    style: String(row[10] || 'NONE').trim().toUpperCase(),

    targetRecipient: String(row[13] || 'DEFAULT').trim(),
    // Alias lama dipertahankan agar snapshot retry v3 tetap kompatibel.
    targetGroup: String(row[13] || 'DEFAULT').trim(),
    startDate: row[14] || '',
    endDate: row[15] || '',
    priority: safeNumber_(row[16], 100),

    maxRetry: Math.max(
      0,
      parseInt(
        row[17] === '' || row[17] === null
          ? propertyInt_('DEFAULT_RETRY_MAX', 3, 0)
          : row[17],
        10
      ) || 0
    ),

    retryDelayMinutes: Math.max(
      1,
      parseInt(
        row[18] === '' || row[18] === null
          ? propertyInt_('DEFAULT_RETRY_DELAY_MINUTES', 5, 1)
          : row[18],
        10
      ) || 1
    ),

    templateName: templateName,
    templateBody: template ? template.body : '',
    templateStyle: template ? template.style : 'NONE',

    sendOnHoliday: boolCell_(row[23]),

    hari: hari,
    jam: jam,
    createdAt: new Date().toISOString()
  };
}


/* =====================================================================
 * EKSEKUSI SNAPSHOT
 * ===================================================================== */

function executeScheduleSnapshot_(snapshot, options) {
  options = options || {};

  if (!snapshot || !snapshot.scheduleId) {
    throw new Error('Snapshot jadwal tidak valid.');
  }

  if (
    !['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER']
      .includes(snapshot.type)
  ) {
    throw new Error('Tipe tidak dikenal: ' + snapshot.type);
  }

  if (propertyBool_('SESSION_HEALTHCHECK', true)) {
    const health = checkSessionHealth_();

    if (!health.ok) {
      const healthMode = String(
        PropertiesService
          .getScriptProperties()
          .getProperty('SESSION_HEALTHCHECK_MODE') || 'SOFT'
      ).trim().toUpperCase();

      if (healthMode === 'HARD') {
        const err = new Error(
          'Session WuzAPI tidak siap: ' + health.detail
        );

        err.isHealthCheck = true;
        throw err;
      }

      // SOFT: beberapa fork WuzAPI memberi response /session/status yang
      // berbeda walaupun endpoint send tetap berfungsi. Biarkan request
      // pengiriman menjadi sumber kebenaran; jika benar-benar gagal,
      // mekanisme retry tetap bekerja.
      console.warn(
        'Health check SOFT warning: ' + health.detail
      );
    }
  }

  let targets;

  if (
    Array.isArray(snapshot.resolvedRecipients) &&
    snapshot.resolvedRecipients.length
  ) {
    targets = snapshot.resolvedRecipients
      .map(function(item) {
        return {
          code: String(item.code || '').trim(),
          name: String(item.name || '').trim(),
          type: String(item.type || '').trim().toUpperCase(),
          phone: String(item.phone || '').trim(),
          jid: String(item.jid || '').trim(),
          aliases: Array.isArray(item.aliases) ? item.aliases : [],
          isDefault: Boolean(item.isDefault),
          source: String(item.source || '').trim(),
          note: String(item.note || '').trim()
        };
      })
      .filter(isValidRecipient_);
  } else {
    targets = resolveTargets_(
      snapshot.targetRecipient || snapshot.targetGroup || 'DEFAULT'
    );

    // Kunci daftar penerima ke snapshot. Jika retry terjadi kemudian,
    // perubahan sheet PENERIMA_WA tidak menambah penerima baru ke jadwal lama.
    snapshot.resolvedRecipients = targets.map(function(target) {
      return {
        code: target.code,
        name: target.name,
        type: target.type,
        phone: target.phone,
        jid: target.jid,
        aliases: target.aliases || [],
        isDefault: target.isDefault,
        source: target.source || '',
        note: target.note || ''
      };
    });
  }

  if (!targets.length) {
    throw new Error(
      'Tidak ada target penerima aktif untuk: ' +
      (snapshot.targetRecipient || snapshot.targetGroup || 'DEFAULT')
    );
  }

  let media = null;

  if (snapshot.type !== 'TEXT') {
    if (!snapshot.mediaSource) {
      throw new Error(
        'Sumber Media wajib diisi untuk tipe ' + snapshot.type + '.'
      );
    }

    media = ambilMedia_(
      snapshot.mediaSource,
      snapshot.fileName,
      snapshot.type
    );
  }

  targets.forEach(function(group) {
    const body = renderScheduleMessage_(
      snapshot,
      group,
      options.test === true
    );

    const mention = prepareMentions_(
      snapshot.mention,
      group.jid
    );

    const finalMessage = gabungkanMentionDenganPesan_(
      mention,
      body
    );

    const contextInfo = buildContextInfo_(mention);

    sendMessageForGroup_(
      snapshot,
      group,
      media,
      finalMessage,
      contextInfo,
      options
    );
  });
}


function sendMessageForGroup_(
  snapshot,
  group,
  media,
  message,
  contextInfo,
  options
) {
  const type = snapshot.type;
  const dedupKey = options.dedupKey || '';

  if (type === 'TEXT') {
    if (!message) {
      throw new Error('Pesan TEXT kosong.');
    }

    const messageId = deterministicMessageId_(
      snapshot.scheduleId,
      dedupKey,
      group.jid,
      'TEXT'
    );

    sendPart_(
      snapshot,
      group,
      options,
      'TEXT',
      '/chat/send/text',
      {
        Phone: recipientAddress_(group),
        Body: message,
        Id: messageId,
        ContextInfo: contextInfo
      },
      {
        message: message,
        media: ''
      }
    );

    return;
  }

  if (type === 'IMAGE') {
    sendPart_(
      snapshot,
      group,
      options,
      'MEDIA',
      '/chat/send/image',
      {
        Phone: recipientAddress_(group),
        Caption: message,
        Image: media.dataUri,
        ContextInfo: contextInfo
      },
      {
        message: message,
        media: media.displaySource
      }
    );

    return;
  }

  if (type === 'VIDEO') {
    sendPart_(
      snapshot,
      group,
      options,
      'MEDIA',
      '/chat/send/video',
      {
        Phone: recipientAddress_(group),
        Caption: message,
        Video: media.dataUri,
        ContextInfo: contextInfo
      },
      {
        message: message,
        media: media.displaySource
      }
    );

    return;
  }

  if (type === 'AUDIO') {
    sendPart_(
      snapshot,
      group,
      options,
      'MEDIA',
      '/chat/send/audio',
      {
        Phone: recipientAddress_(group),
        Audio: media.dataUri,
        ContextInfo: contextInfo
      },
      {
        message: '',
        media: media.displaySource
      }
    );

    // Endpoint audio WuzAPI tidak menyediakan caption yang konsisten.
    if (message) {
      const textId = deterministicMessageId_(
        snapshot.scheduleId,
        dedupKey,
        group.jid,
        'TEXT'
      );

      sendPart_(
        snapshot,
        group,
        options,
        'TEXT',
        '/chat/send/text',
        {
          Phone: recipientAddress_(group),
          Body: message,
          Id: textId,
          ContextInfo: contextInfo
        },
        {
          message: message,
          media: ''
        }
      );
    }

    return;
  }

  if (type === 'DOCUMENT') {
    sendPart_(
      snapshot,
      group,
      options,
      'MEDIA',
      '/chat/send/document',
      {
        Phone: recipientAddress_(group),
        FileName: media.fileName,
        Document: media.dataUri,
        ContextInfo: contextInfo
      },
      {
        message: '',
        media: media.displaySource
      }
    );

    if (message) {
      const textId = deterministicMessageId_(
        snapshot.scheduleId,
        dedupKey,
        group.jid,
        'TEXT'
      );

      sendPart_(
        snapshot,
        group,
        options,
        'TEXT',
        '/chat/send/text',
        {
          Phone: recipientAddress_(group),
          Body: message,
          Id: textId,
          ContextInfo: contextInfo
        },
        {
          message: message,
          media: ''
        }
      );
    }

    return;
  }

  if (type === 'STICKER') {
    sendPart_(
      snapshot,
      group,
      options,
      'MEDIA',
      '/chat/send/sticker',
      {
        Phone: recipientAddress_(group),
        Sticker: media.dataUri,
        ContextInfo: contextInfo
      },
      {
        message: '',
        media: media.displaySource
      }
    );

    if (message) {
      const textId = deterministicMessageId_(
        snapshot.scheduleId,
        dedupKey,
        group.jid,
        'TEXT'
      );

      sendPart_(
        snapshot,
        group,
        options,
        'TEXT',
        '/chat/send/text',
        {
          Phone: recipientAddress_(group),
          Body: message,
          Id: textId,
          ContextInfo: contextInfo
        },
        {
          message: message,
          media: ''
        }
      );
    }
  }
}


function sendPart_(
  snapshot,
  group,
  options,
  partName,
  endpoint,
  payload,
  meta
) {
  const force = options.force === true;
  const dedupKey = options.dedupKey || '';

  const partProperty = partPropertyKey_(
    snapshot.scheduleId,
    group.jid,
    partName
  );

  const props = PropertiesService.getScriptProperties();

  if (
    !force &&
    dedupKey &&
    props.getProperty(partProperty) === dedupKey
  ) {
    return;
  }

  const result = wuzapiRequest_(
    endpoint,
    'post',
    payload
  );

  // Hanya pesan yang benar-benar mendapat respons sukses API
  // yang menambah "Jumlah Pesan Terkirim".
  incrementSentMessageCount_(snapshot.scheduleId, 1);

  if (!force && dedupKey) {
    props.setProperty(partProperty, dedupKey);
  }

  logKirim_({
    scheduleId: snapshot.scheduleId,
    row: findScheduleRowById_(snapshot.scheduleId),
    hari: snapshot.hari || getHariIndonesia_(new Date(), getTimezone_()),
    jam: snapshot.jam || Utilities.formatDate(new Date(), getTimezone_(), 'HH:mm'),
    group: recipientLabel_(group),
    tipe: snapshot.type,
    bagian: partName,
    percobaan: options.attemptLabel || '',
    pesan: meta.message || '',
    media: meta.media || '',
    status: options.test ? 'TEST BERHASIL' : 'BERHASIL',
    http: result.httpCode,
    messageId: extractMessageId_(result.json),
    response: result.responseText
  });
}


/* =====================================================================
 * RETRY
 * ===================================================================== */

function handleInitialScheduleFailure_(snapshot, dedupKey, err) {
  const maxRetry = Math.max(0, Number(snapshot.maxRetry) || 0);

  logKirim_({
    scheduleId: snapshot.scheduleId,
    row: findScheduleRowById_(snapshot.scheduleId),
    hari: snapshot.hari,
    jam: snapshot.jam,
    group: '',
    tipe: snapshot.type,
    bagian: 'ROW',
    percobaan: 'INITIAL',
    pesan: snapshot.message,
    media: snapshot.mediaSource,
    status: 'GAGAL_INITIAL',
    http: err.httpCode || '',
    messageId: '',
    response: err.responseText || err.message || String(err)
  });

  if (maxRetry > 0) {
    enqueueRetry_(snapshot, dedupKey, 1, err);

    markScheduleQueued_(snapshot.scheduleId, dedupKey);

    updateScheduleStatusById_(
      snapshot.scheduleId,
      'RETRY 1/' + maxRetry +
      ' dijadwalkan: ' + ambilErrorSingkat_(err),
      null
    );

    return;
  }

  finalizeScheduleFailure_(
    snapshot,
    dedupKey,
    'GAGAL FINAL: ' + ambilErrorSingkat_(err)
  );
}


function enqueueRetry_(snapshot, dedupKey, retryNo, err) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(APP.SHEET_RETRY);

  if (!sheet) {
    throw new Error('Sheet RETRY_QUEUE tidak ditemukan.');
  }

  const existingRow = findActiveRetryRow_(
    sheet,
    snapshot.scheduleId,
    dedupKey
  );

  if (existingRow) {
    return;
  }

  const delay = Math.max(
    1,
    Number(snapshot.retryDelayMinutes) || 5
  );

  const nextRetry = new Date(
    Date.now() + delay * 60 * 1000
  );

  sheet.appendRow([
    newQueueId_(),
    new Date(),
    nextRetry,
    snapshot.scheduleId,
    dedupKey,
    JSON.stringify(snapshot),
    retryNo,
    snapshot.maxRetry,
    delay,
    'MENUNGGU',
    ambilErrorSingkat_(err),
    ''
  ]);
}


function processRetryQueue_(ss, maxItems) {
  const sheet = ss.getSheetByName(APP.SHEET_RETRY);

  if (!sheet || sheet.getLastRow() < 2) {
    return;
  }

  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, APP.RETRY_HEADERS.length)
    .getValues();

  const now = new Date();
  let processed = 0;

  for (let i = 0; i < rows.length; i++) {
    if (processed >= maxItems) {
      break;
    }

    const rowNumber = i + 2;
    const row = rows[i];

    const status = String(row[9] || '').toUpperCase();

    if (
      status !== 'MENUNGGU' &&
      status !== 'RETRY'
    ) {
      continue;
    }

    const nextRetry = asDate_(row[2]);

    if (!nextRetry || nextRetry.getTime() > now.getTime()) {
      continue;
    }

    const scheduleId = String(row[3] || '').trim();
    const dedupKey = String(row[4] || '').trim();

    if (!scheduleId || !dedupKey) {
      sheet.getRange(rowNumber, 10).setValue('INVALID');
      sheet.getRange(rowNumber, 12).setValue(new Date());
      continue;
    }

    if (isScheduleDone_(scheduleId, dedupKey)) {
      sheet.getRange(rowNumber, 10).setValue('SELESAI/SKIP');
      sheet.getRange(rowNumber, 12).setValue(new Date());
      clearScheduleQueued_(scheduleId, dedupKey);
      continue;
    }

    let snapshot;

    try {
      snapshot = JSON.parse(String(row[5] || '{}'));
    } catch (err) {
      sheet.getRange(rowNumber, 10).setValue('INVALID JSON');
      sheet.getRange(rowNumber, 11).setValue(err.message);
      sheet.getRange(rowNumber, 12).setValue(new Date());

      finalizeScheduleFailureById_(
        scheduleId,
        dedupKey,
        'GAGAL FINAL: snapshot retry rusak.'
      );

      continue;
    }

    const retryNo = Math.max(1, Number(row[6]) || 1);
    const maxRetry = Math.max(0, Number(row[7]) || 0);
    const delay = Math.max(1, Number(row[8]) || 5);

    processed++;

    try {
      executeScheduleSnapshot_(snapshot, {
        dedupKey: dedupKey,
        attemptLabel: 'RETRY-' + retryNo,
        test: false,
        force: false
      });

      sheet.getRange(rowNumber, 10).setValue('BERHASIL');
      sheet.getRange(rowNumber, 11).setValue('');
      sheet.getRange(rowNumber, 12).setValue(new Date());

      finalizeScheduleSuccess_(
        snapshot,
        dedupKey,
        'BERHASIL SETELAH RETRY-' + retryNo
      );

    } catch (err) {
      logKirim_({
        scheduleId: scheduleId,
        row: findScheduleRowById_(scheduleId),
        hari: snapshot.hari || '',
        jam: snapshot.jam || '',
        group: '',
        tipe: snapshot.type || '',
        bagian: 'ROW',
        percobaan: 'RETRY-' + retryNo,
        pesan: snapshot.message || '',
        media: snapshot.mediaSource || '',
        status: 'GAGAL_RETRY',
        http: err.httpCode || '',
        messageId: '',
        response: err.responseText || err.message || String(err)
      });

      if (retryNo < maxRetry) {
        const nextNo = retryNo + 1;
        const next = new Date(
          Date.now() + delay * 60 * 1000
        );

        sheet.getRange(rowNumber, 3).setValue(next);
        sheet.getRange(rowNumber, 7).setValue(nextNo);
        sheet.getRange(rowNumber, 10).setValue('RETRY');
        sheet.getRange(rowNumber, 11).setValue(ambilErrorSingkat_(err));

        updateScheduleStatusById_(
          scheduleId,
          'RETRY ' + nextNo + '/' + maxRetry +
          ' dijadwalkan: ' + ambilErrorSingkat_(err),
          null
        );

      } else {
        sheet.getRange(rowNumber, 10).setValue('GAGAL FINAL');
        sheet.getRange(rowNumber, 11).setValue(ambilErrorSingkat_(err));
        sheet.getRange(rowNumber, 12).setValue(new Date());

        finalizeScheduleFailure_(
          snapshot,
          dedupKey,
          'GAGAL FINAL setelah retry: ' + ambilErrorSingkat_(err)
        );
      }
    }
  }
}


function findActiveRetryRow_(sheet, scheduleId, dedupKey) {
  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, APP.RETRY_HEADERS.length)
    .getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const status = String(row[9] || '').toUpperCase();

    if (
      String(row[3] || '') === scheduleId &&
      String(row[4] || '') === dedupKey &&
      (status === 'MENUNGGU' || status === 'RETRY')
    ) {
      return i + 2;
    }
  }

  return 0;
}


/* =====================================================================
 * FINALISASI & STATISTIK
 * ===================================================================== */

function finalizeScheduleSuccess_(snapshot, dedupKey, status) {
  markScheduleDone_(snapshot.scheduleId, dedupKey);
  clearScheduleQueued_(snapshot.scheduleId, dedupKey);
  clearPartMarkersForSnapshot_(snapshot, dedupKey);

  const row = findScheduleRowById_(snapshot.scheduleId);

  if (row) {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(APP.SHEET_NOTIF);

    incrementCell_(sheet.getRange(row, 20), 1); // T
    updateScheduleStatusByRow_(
      sheet,
      row,
      status || 'BERHASIL',
      new Date()
    );

    ensureScheduleDefaults_(sheet, row);
  }
}


function finalizeScheduleFailure_(snapshot, dedupKey, status) {
  markScheduleDone_(snapshot.scheduleId, dedupKey);
  clearScheduleQueued_(snapshot.scheduleId, dedupKey);
  clearPartMarkersForSnapshot_(snapshot, dedupKey);

  const row = findScheduleRowById_(snapshot.scheduleId);

  if (row) {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(APP.SHEET_NOTIF);

    incrementCell_(sheet.getRange(row, 21), 1); // U
    updateScheduleStatusByRow_(
      sheet,
      row,
      status || 'GAGAL FINAL',
      null
    );

    ensureScheduleDefaults_(sheet, row);
  }
}


function finalizeScheduleFailureById_(scheduleId, dedupKey, status) {
  const snapshot = {
    scheduleId: scheduleId,
    targetRecipient: 'DEFAULT',
    targetGroup: 'DEFAULT'
  };

  finalizeScheduleFailure_(snapshot, dedupKey, status);
}


function incrementSentMessageCount_(scheduleId, amount) {
  const row = findScheduleRowById_(scheduleId);

  if (!row) {
    return;
  }

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(APP.SHEET_NOTIF);

  incrementCell_(
    sheet.getRange(row, 6),
    Number(amount || 1)
  );
}


function incrementCell_(cell, amount) {
  const current = Number(cell.getValue()) || 0;
  cell.setValue(current + Number(amount || 1));
}


function updateScheduleStatusById_(scheduleId, status, sentAt) {
  const row = findScheduleRowById_(scheduleId);

  if (!row) {
    return;
  }

  const sheet = getSpreadsheet_()
    .getSheetByName(APP.SHEET_NOTIF);

  updateScheduleStatusByRow_(
    sheet,
    row,
    status,
    sentAt
  );
}


function updateScheduleStatusByRow_(sheet, row, status, sentAt) {
  if (sentAt) {
    sheet.getRange(row, 12).setValue(sentAt);
  }

  sheet.getRange(row, 13).setValue(status || '');
}


function findScheduleRowById_(scheduleId) {
  const ss = getSpreadsheet_();
  const sheet = ss ? ss.getSheetByName(APP.SHEET_NOTIF) : null;

  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }

  const finder = sheet
    .getRange(2, 25, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(scheduleId))
    .matchEntireCell(true)
    .findNext();

  return finder ? finder.getRow() : 0;
}


/* =====================================================================
 * DEDUP / PART MARKERS
 * ===================================================================== */

function donePropertyKey_(scheduleId) {
  return 'DONE_' + compactKey_(scheduleId);
}


function queuedPropertyKey_(scheduleId) {
  return 'QUEUED_' + compactKey_(scheduleId);
}


function partPropertyKey_(scheduleId, groupJid, partName) {
  return (
    'PART_' +
    compactKey_(scheduleId) +
    '_' +
    shortHash_(groupJid) +
    '_' +
    String(partName || '').toUpperCase()
  );
}


function isScheduleDone_(scheduleId, dedupKey) {
  return (
    PropertiesService
      .getScriptProperties()
      .getProperty(donePropertyKey_(scheduleId)) === dedupKey
  );
}


function markScheduleDone_(scheduleId, dedupKey) {
  PropertiesService
    .getScriptProperties()
    .setProperty(
      donePropertyKey_(scheduleId),
      dedupKey
    );
}


function isScheduleQueued_(scheduleId, dedupKey) {
  return (
    PropertiesService
      .getScriptProperties()
      .getProperty(queuedPropertyKey_(scheduleId)) === dedupKey
  );
}


function markScheduleQueued_(scheduleId, dedupKey) {
  PropertiesService
    .getScriptProperties()
    .setProperty(
      queuedPropertyKey_(scheduleId),
      dedupKey
    );
}


function clearScheduleQueued_(scheduleId, dedupKey) {
  const props = PropertiesService.getScriptProperties();
  const key = queuedPropertyKey_(scheduleId);

  if (!dedupKey || props.getProperty(key) === dedupKey) {
    props.deleteProperty(key);
  }
}


function clearPartMarkersForSnapshot_(snapshot, dedupKey) {
  try {
    const groups = (
      Array.isArray(snapshot.resolvedRecipients) &&
      snapshot.resolvedRecipients.length
    )
      ? snapshot.resolvedRecipients
      : resolveTargets_(
          snapshot.targetRecipient || snapshot.targetGroup || 'DEFAULT'
        );

    const props = PropertiesService.getScriptProperties();

    groups.forEach(function(group) {
      ['TEXT', 'MEDIA'].forEach(function(part) {
        const key = partPropertyKey_(
          snapshot.scheduleId,
          group.jid,
          part
        );

        if (!dedupKey || props.getProperty(key) === dedupKey) {
          props.deleteProperty(key);
        }
      });
    });
  } catch (err) {
    console.warn('Clear part marker:', err.message);
  }
}


/* =====================================================================
 * PENERIMA UNIVERSAL: GROUP + PRIVATE
 * ===================================================================== */

function resolveTargets_(spec) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(APP.SHEET_RECIPIENT);

  // FIX v4.2.0: self-heal bila sheet ada tetapi hanya berisi checkbox FALSE
  // atau baris kosong hasil formatting/data validation.
  if (!hasValidRecipientData_(sheet)) {
    migrateLegacyRecipients_(ss);
    sheet = ss.getSheetByName(APP.SHEET_RECIPIENT);
  }

  if (!hasValidRecipientData_(sheet)) {
    return fallbackDefaultRecipient_();
  }

  const maxRows = Math.min(sheet.getMaxRows() - 1, 5000);
  const rows = sheet
    .getRange(
      2,
      1,
      maxRows,
      APP.RECIPIENT_HEADERS.length
    )
    .getValues();

  const active = rows
    .filter(function(row) {
      return isAktif_(row[0]);
    })
    .map(recipientRowToObject_)
    .filter(function(target) {
      return isValidRecipient_(target);
    });

  const text = String(spec || '').trim();

  if (!text || /^DEFAULT$/i.test(text)) {
    let defaults = active.filter(function(target) {
      return target.isDefault;
    });

    if (!defaults.length) {
      const defaultCode = String(
        PropertiesService
          .getScriptProperties()
          .getProperty('DEFAULT_GROUP_CODE') || ''
      ).trim();

      if (defaultCode) {
        defaults = active.filter(function(target) {
          return target.code.toLowerCase() === defaultCode.toLowerCase();
        });
      }
    }

    if (!defaults.length && active.length) {
      defaults = [active[0]];
    }

    if (!defaults.length) {
      return fallbackDefaultRecipient_();
    }

    return uniqueRecipients_(defaults);
  }

  const normalized = text.toLowerCase().replace(/\s+/g, '');

  if (
    normalized === 'all' ||
    normalized === '@all' ||
    normalized === 'semua' ||
    normalized === '@semua' ||
    normalized === 'semuapenerima'
  ) {
    return uniqueRecipients_(active);
  }

  if (
    normalized === '@semua_group' ||
    normalized === 'semua_group' ||
    normalized === '@semuagroup' ||
    normalized === 'semuagroup' ||
    normalized === '@all_group' ||
    normalized === '@allgroup'
  ) {
    return uniqueRecipients_(active.filter(function(target) {
      return target.type === 'GROUP';
    }));
  }

  if (
    normalized === '@semua_private' ||
    normalized === 'semua_private' ||
    normalized === '@semuaprivate' ||
    normalized === 'semuaprivate' ||
    normalized === '@all_private' ||
    normalized === '@allprivate'
  ) {
    return uniqueRecipients_(active.filter(function(target) {
      return target.type === 'PRIVATE';
    }));
  }

  const tokens = text
    .split(/[,;|\n]+/)
    .map(function(v) {
      return String(v || '').trim();
    })
    .filter(Boolean);

  const result = [];

  tokens.forEach(function(token) {
    const tokenNorm = token.toLowerCase();
    const tokenCompact = tokenNorm.replace(/\s+/g, '');

    if (tokenCompact === 'default') {
      const defaults = resolveTargets_('DEFAULT');
      Array.prototype.push.apply(result, defaults);
      return;
    }

    if (
      tokenCompact === '@semua_group' ||
      tokenCompact === 'semua_group' ||
      tokenCompact === '@semuagroup' ||
      tokenCompact === 'semuagroup' ||
      tokenCompact === '@all_group' ||
      tokenCompact === '@allgroup'
    ) {
      Array.prototype.push.apply(
        result,
        active.filter(function(target) { return target.type === 'GROUP'; })
      );
      return;
    }

    if (
      tokenCompact === '@semua_private' ||
      tokenCompact === 'semua_private' ||
      tokenCompact === '@semuaprivate' ||
      tokenCompact === 'semuaprivate' ||
      tokenCompact === '@all_private' ||
      tokenCompact === '@allprivate'
    ) {
      Array.prototype.push.apply(
        result,
        active.filter(function(target) { return target.type === 'PRIVATE'; })
      );
      return;
    }

    if (
      tokenCompact === '@semua' ||
      tokenCompact === 'semua' ||
      tokenCompact === '@all' ||
      tokenCompact === 'all'
    ) {
      Array.prototype.push.apply(result, active);
      return;
    }

    const tokenDigits = normalizePhoneNumber_(token);

    let match = active.find(function(target) {
      if (
        target.code.toLowerCase() === tokenNorm ||
        target.name.toLowerCase() === tokenNorm ||
        target.jid.toLowerCase() === tokenNorm ||
        (target.phone && target.phone === tokenDigits)
      ) {
        return true;
      }

      return target.aliases.some(function(alias) {
        return alias.toLowerCase() === tokenNorm;
      });
    });

    if (!match) {
      match = directRecipientFromToken_(token);
    }

    if (!match) {
      throw new Error(
        'Target penerima tidak ditemukan/aktif: ' + token
      );
    }

    result.push(match);
  });

  return uniqueRecipients_(result);
}


// Alias kompatibilitas fungsi versi 3.
function resolveTargetGroups_(spec) {
  return resolveTargets_(spec);
}


function recipientRowToObject_(row) {
  const type = String(row[3] || '').trim().toUpperCase();
  const rawJid = String(row[5] || '').trim();
  const rawPhone = String(row[4] || '').trim();

  let jid = rawJid;
  let phone = normalizePhoneNumber_(rawPhone || rawJid);

  if (type === 'PRIVATE' && !jid && phone) {
    jid = phone + '@s.whatsapp.net';
  }

  return {
    code: String(row[1] || '').trim(),
    name: String(row[2] || '').trim(),
    type: type,
    phone: phone,
    jid: jid,
    aliases: String(row[6] || '')
      .split(/[,;|\n]+/)
      .map(function(v) { return v.trim(); })
      .filter(Boolean),
    isDefault: boolCell_(row[7]),
    source: String(row[8] || '').trim(),
    note: String(row[9] || '').trim()
  };
}


function isValidRecipient_(target) {
  if (!target) {
    return false;
  }

  if (target.type === 'GROUP') {
    const jid = String(target.jid || '');
    return /@g\.us$/i.test(jid) && !/X{3,}/i.test(jid);
  }

  if (target.type === 'PRIVATE') {
    const jid = String(target.jid || '');
    const phone = String(target.phone || '');

    if (/@lid$/i.test(jid)) {
      return true;
    }

    const normalized = phone || phoneFromJidOrValue_(jid);
    return /^\d{7,20}$/.test(normalized);
  }

  return false;
}


function directRecipientFromToken_(token) {
  const text = String(token || '').trim();

  if (/@g\.us$/i.test(text)) {
    return {
      code: 'DIRECT_GROUP',
      name: 'Direct Group',
      type: 'GROUP',
      phone: '',
      jid: text,
      aliases: [],
      isDefault: false,
      source: 'DIRECT',
      note: ''
    };
  }

  if (
    /@s\.whatsapp\.net$/i.test(text) ||
    /@lid$/i.test(text)
  ) {
    return {
      code: 'DIRECT_PRIVATE',
      name: phoneFromJidOrValue_(text) || text,
      type: 'PRIVATE',
      phone: phoneFromJidOrValue_(text),
      jid: text,
      aliases: [],
      isDefault: false,
      source: 'DIRECT',
      note: ''
    };
  }

  const phone = normalizePhoneNumber_(text);

  if (phone) {
    return {
      code: 'DIRECT_PRIVATE',
      name: phone,
      type: 'PRIVATE',
      phone: phone,
      jid: phone + '@s.whatsapp.net',
      aliases: [],
      isDefault: false,
      source: 'DIRECT',
      note: ''
    };
  }

  return null;
}


function fallbackDefaultRecipient_() {
  const props = PropertiesService.getScriptProperties();
  const jid = String(
    props.getProperty('WUZAPI_GROUP_JID') || ''
  ).trim();

  if (!/@g\.us$/i.test(jid) || /X{3,}/i.test(jid)) {
    throw new Error(
      'Tidak ada penerima default valid. Isi sheet PENERIMA_WA.'
    );
  }

  return [{
    code: String(props.getProperty('DEFAULT_GROUP_CODE') || 'DEFAULT'),
    name: 'Default Group',
    type: 'GROUP',
    phone: '',
    jid: jid,
    aliases: [],
    isDefault: true,
    source: 'SCRIPT PROPERTY',
    note: ''
  }];
}


function uniqueRecipients_(targets) {
  const seen = {};

  return (targets || []).filter(function(target) {
    const key = recipientIdentity_(target);

    if (!key || seen[key]) {
      return false;
    }

    seen[key] = true;
    return true;
  });
}


// Alias lama.
function uniqueGroups_(groups) {
  return uniqueRecipients_(groups);
}


function recipientIdentity_(target) {
  if (!target) {
    return '';
  }

  if (target.type === 'GROUP') {
    return String(target.jid || '').toLowerCase();
  }

  return String(
    target.jid || target.phone || ''
  ).toLowerCase();
}


function recipientAddress_(target) {
  if (!target) {
    throw new Error('Target penerima kosong.');
  }

  if (target.type === 'GROUP') {
    if (!/@g\.us$/i.test(String(target.jid || ''))) {
      throw new Error('Group JID tidak valid: ' + String(target.jid || ''));
    }

    return target.jid;
  }

  if (target.type === 'PRIVATE') {
    if (target.phone) {
      return target.phone;
    }

    if (
      /@s\.whatsapp\.net$/i.test(String(target.jid || '')) ||
      /@lid$/i.test(String(target.jid || ''))
    ) {
      return target.jid;
    }
  }

  throw new Error('Alamat penerima tidak valid: ' + recipientLabel_(target));
}


function recipientLabel_(target) {
  return (
    String(target.name || target.phone || target.jid || 'Penerima') +
    ' [' + String(target.code || target.type || '-') + ']' +
    (target.type ? ' {' + target.type + '}' : '')
  );
}


function normalizePhoneNumber_(value) {
  let text = String(value || '').trim();

  if (!text) {
    return '';
  }

  // Jangan menganggap Group/LID sebagai nomor telepon biasa.
  if (/@g\.us$/i.test(text) || /@lid$/i.test(text)) {
    return '';
  }

  text = text.replace(/@s\.whatsapp\.net$/i, '');

  // Nama/kode seperti USR001 tidak boleh salah dianggap nomor WhatsApp.
  if (/[A-Za-z]/.test(text)) {
    return '';
  }

  let digits = text.replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  const cc = String(
    PropertiesService
      .getScriptProperties()
      .getProperty('DEFAULT_COUNTRY_CODE') || '62'
  ).replace(/\D/g, '');

  if (digits.charAt(0) === '0' && cc) {
    digits = cc + digits.substring(1);
  }

  if (!/^\d{7,20}$/.test(digits)) {
    return '';
  }

  return digits;
}


function phoneFromJidOrValue_(value) {
  const text = String(value || '').trim();

  if (/@lid$/i.test(text) || /@g\.us$/i.test(text)) {
    return '';
  }

  return normalizePhoneNumber_(text);
}


function normalizePrivateJid_(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  if (
    /@s\.whatsapp\.net$/i.test(text) ||
    /@lid$/i.test(text)
  ) {
    return text;
  }

  const phone = normalizePhoneNumber_(text);
  return phone ? phone + '@s.whatsapp.net' : '';
}


function uniqueRecipientCode_(preferred, used) {
  used = used || {};

  let base = String(preferred || 'TARGET')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'TARGET';

  let code = base;
  let i = 2;

  while (used[code.toLowerCase()]) {
    code = base + '_' + i++;
  }

  used[code.toLowerCase()] = true;
  return code;
}


function isWuzapiConfigured_() {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('WUZAPI_URL') || '').trim();
  const token = String(props.getProperty('WUZAPI_TOKEN') || '').trim();

  return Boolean(
    url &&
    /^https?:\/\//i.test(url) &&
    !/domainanda/i.test(url) &&
    token &&
    !/ISI_TOKEN/i.test(token)
  );
}



/**
 * v4.5: buku GROUP_WA dan KONTAK dipisahkan dari indeks gabungan PENERIMA_WA.
 * Hasil WuzAPI ditulis ke ketiganya dalam satu sinkronisasi.
 */
function syncSeparateBooksFromRecipients_(ss, recipientRows) {
  ensureContactSheet_(ss);
  ensureGroupSheet_(ss);

  const groupSheet = ss.getSheetByName(APP.SHEET_GROUP);
  const contactSheet = ss.getSheetByName(APP.SHEET_CONTACT);
  const now = new Date();

  const existingGroups = readMeaningfulGroupBookRows_(groupSheet);
  const existingContacts = readMeaningfulContactBookRows_(contactSheet);

  const groupById = {};
  existingGroups.forEach(function(row) {
    const jid = String(row[3] || '').trim().toLowerCase();
    if (jid) groupById[jid] = row;
  });

  const contactById = {};
  existingContacts.forEach(function(row) {
    const jid = normalizePrivateJid_(row[4] || row[3] || '');
    if (jid) contactById[jid.toLowerCase()] = row;
  });

  (recipientRows || []).forEach(function(row) {
    if (!recipientRowHasIdentity_(row)) return;
    const r = recipientRowToObject_(row);

    if (r.type === 'GROUP' && /@g\.us$/i.test(r.jid || '')) {
      const key = String(r.jid).toLowerCase();
      const old = groupById[key];
      if (old) {
        old[0] = r.isActive !== undefined ? Boolean(r.isActive) : isAktif_(row[0]);
        old[1] = r.code || old[1];
        old[2] = r.name || old[2];
        old[3] = r.jid;
        old[4] = r.isDefault;
        old[6] = now;
      } else {
        const created = [
          isAktif_(row[0]), r.code || '', r.name || r.code || '', r.jid,
          r.isDefault, r.note || '', now
        ];
        existingGroups.push(created);
        groupById[key] = created;
      }
    }

    if (r.type === 'PRIVATE') {
      const jid = normalizePrivateJid_(r.jid || r.phone || '');
      if (!jid) return;
      const key = jid.toLowerCase();
      const old = contactById[key];
      if (old) {
        old[0] = isAktif_(row[0]);
        old[1] = r.code || old[1];
        old[2] = r.name || old[2];
        old[3] = r.phone || phoneFromJidOrValue_(jid) || old[3];
        old[4] = jid;
        old[5] = (r.aliases || []).join(', ') || old[5];
        old[6] = r.isDefault;
        old[7] = r.source || 'WUZAPI /user/contacts';
        old[8] = r.note || old[8];
        old[9] = now;
      } else {
        const created = [
          isAktif_(row[0]), r.code || '', r.name || r.code || '',
          r.phone || phoneFromJidOrValue_(jid), jid,
          (r.aliases || []).join(', '), r.isDefault,
          r.source || 'WUZAPI /user/contacts', r.note || '', now
        ];
        existingContacts.push(created);
        contactById[key] = created;
      }
    }
  });

  writeGroupBookRows_(groupSheet, stableActiveFirst_(existingGroups));
  writeContactBookRows_(contactSheet, stableActiveFirst_(existingContacts));
}

function stableActiveFirst_(rows) {
  const active = [], inactive = [];
  (rows || []).forEach(function(row) {
    (isAktif_(row[0]) ? active : inactive).push(row);
  });
  return active.concat(inactive);
}

function readMeaningfulGroupBookRows_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, APP.GROUP_HEADERS.length)
    .getValues()
    .filter(function(row) {
      return String(row[1] || row[2] || row[3] || '').trim() !== '';
    });
}

function readMeaningfulContactBookRows_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, APP.CONTACT_HEADERS.length)
    .getValues()
    .filter(function(row) {
      return String(row[1] || row[2] || row[3] || row[4] || '').trim() !== '';
    });
}

function writeGroupBookRows_(sheet, rows) {
  const previous = Math.max(0, sheet.getLastRow() - 1);
  if (rows.length) {
    ensureSheetSize_(sheet, rows.length + 10, APP.GROUP_HEADERS.length);
    sheet.getRange(2, 1, rows.length, APP.GROUP_HEADERS.length).setValues(rows);
    const checkbox = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    sheet.getRange(2, 1, rows.length, 1).setDataValidation(checkbox);
    sheet.getRange(2, 5, rows.length, 1).setDataValidation(checkbox);
  }
  if (previous > rows.length) {
    sheet.getRange(2 + rows.length, 1, previous - rows.length, APP.GROUP_HEADERS.length).clearContent();
  }
}

function writeContactBookRows_(sheet, rows) {
  const previous = Math.max(0, sheet.getLastRow() - 1);
  if (rows.length) {
    ensureSheetSize_(sheet, rows.length + 10, APP.CONTACT_HEADERS.length);
    sheet.getRange(2, 1, rows.length, APP.CONTACT_HEADERS.length).setValues(rows);
    const checkbox = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    sheet.getRange(2, 1, rows.length, 1).setDataValidation(checkbox);
    sheet.getRange(2, 7, rows.length, 1).setDataValidation(checkbox);
  }
  if (previous > rows.length) {
    sheet.getRange(2 + rows.length, 1, previous - rows.length, APP.CONTACT_HEADERS.length).clearContent();
  }
}

function syncBookEditToRecipient_(sheet, range, type, e) {
  if (!sheet || !range || range.getRow() < 2) return;

  const ss = getSpreadsheet_();
  const recipientSheet = ss.getSheetByName(APP.SHEET_RECIPIENT);
  if (!recipientSheet) return;

  const width = type === 'GROUP' ? APP.GROUP_HEADERS.length : APP.CONTACT_HEADERS.length;
  const row = sheet.getRange(range.getRow(), 1, 1, width).getValues()[0];
  let jid = '';
  let active = isAktif_(row[0]);
  let isDefault = false;

  if (type === 'GROUP') {
    jid = String(row[3] || '').trim();
    isDefault = boolCell_(row[4]);
  } else {
    jid = normalizePrivateJid_(row[4] || row[3] || '');
    isDefault = boolCell_(row[6]);
  }
  if (!jid) return;

  const data = getMeaningfulRecipientRows_(recipientSheet);
  const idx = data.findIndex(function(r) {
    return String(r[5] || '').trim().toLowerCase() === jid.toLowerCase();
  });
  if (idx >= 0) {
    data[idx][0] = active;
    data[idx][7] = isDefault;
    recipientSheet.getRange(2 + idx, 1, 1, APP.RECIPIENT_HEADERS.length).setValues([data[idx]]);
  }

  // Buku terpisah juga selalu aktif di atas. Yang baru dicentang jadi row 2.
  const preferred = active ? jid.toLowerCase() : '';
  if (type === 'GROUP') {
    const rows = stableActiveFirst_(readMeaningfulGroupBookRows_(sheet));
    if (preferred) {
      const i = rows.findIndex(function(r) { return String(r[3] || '').toLowerCase() === preferred; });
      if (i > 0) rows.unshift(rows.splice(i, 1)[0]);
    }
    writeGroupBookRows_(sheet, rows);
  } else {
    const rows = stableActiveFirst_(readMeaningfulContactBookRows_(sheet));
    if (preferred) {
      const i = rows.findIndex(function(r) { return normalizePrivateJid_(r[4] || r[3] || '').toLowerCase() === preferred; });
      if (i > 0) rows.unshift(rows.splice(i, 1)[0]);
    }
    writeContactBookRows_(sheet, rows);
  }

  sortRecipientSheetActiveFirst_(recipientSheet, active ? jid : '');
  CacheService.getScriptCache().remove('CONTACT_MAP_V4');
}

/**
 * Sinkron semua target yang tersedia dari WuzAPI:
 * - GET /group/list     -> GROUP
 * - GET /user/contacts -> PRIVATE
 *
 * Data manual yang sudah ada tidak dihapus. Kode, Alias, Default, Aktif,
 * dan Keterangan pengguna dipertahankan saat item yang sama ditemukan lagi.
 */
function sinkronPenerimaWuzapi(showToast) {
  if (showToast === undefined) {
    showToast = true;
  }

  const ss = getSpreadsheet_();

  if (!ss) {
    throw new Error('Spreadsheet tidak ditemukan.');
  }

  // Pastikan KONTAK lama sudah dinaikkan ke schema buku kontak v4.5
  // meskipun sinkron dijalankan langsung tanpa setupAwal().
  upgradeContactBookSchema_(ss);
  ensureRecipientSheet_(ss);
  migrateLegacyRecipients_(ss);

  const sheet = ss.getSheetByName(APP.SHEET_RECIPIENT);
  cleanupRecipientBlankRows_(sheet);
  const existing = getMeaningfulRecipientRows_(sheet);

  const byIdentity = {};
  const usedCodes = {};

  existing.forEach(function(row) {
    const obj = recipientRowToObject_(row);
    const identity = recipientIdentity_(obj);

    if (identity) {
      byIdentity[identity] = row;
    }

    const code = String(row[1] || '').trim();
    if (code) {
      usedCodes[code.toLowerCase()] = true;
    }
  });

  let groupCount = 0;
  let contactCount = 0;
  const syncWarnings = [];
  const now = new Date();

  // v4.4: group + kontak diambil paralel agar sinkron/setup lebih cepat.
  const parallel = wuzapiFetchMany_([
    '/group/list',
    '/user/contacts'
  ]);

  let groups = [];
  if (parallel['/group/list'].ok) {
    groups = extractGroupList_(parallel['/group/list'].json);
  } else {
    syncWarnings.push(
      '/group/list: ' + parallel['/group/list'].error
    );
  }

  groups.forEach(function(group) {
    const jid = String(
      group.JID || group.jid || group.Id || group.id || ''
    ).trim();

    if (!/@g\.us$/i.test(jid)) {
      return;
    }

    const name = String(
      group.Name || group.name || group.GroupName || group.Subject || ''
    ).trim();

    const identity = jid.toLowerCase();
    let row = byIdentity[identity];

    if (row) {
      // Jangan menimpa pilihan Aktif/Kode/Alias/Default/Keterangan user.
      row[2] = name || row[2] || row[1];
      row[3] = 'GROUP';
      row[4] = '';
      row[5] = jid;
      row[8] = 'WUZAPI /group/list';
      row[10] = now;
    } else {
      const code = nextRecipientCode_('GRP', usedCodes);
      row = [
        false,
        code,
        name || code,
        'GROUP',
        '',
        jid,
        '',
        false,
        'WUZAPI /group/list',
        '',
        now
      ];
      existing.push(row);
      byIdentity[identity] = row;
    }

    groupCount++;
  });

  // CONTACTS / PRIVATE
  let contacts = [];
  if (parallel['/user/contacts'].ok) {
    contacts = extractContactList_(parallel['/user/contacts'].json);
  } else {
    syncWarnings.push(
      '/user/contacts: ' + parallel['/user/contacts'].error
    );
  }

  contacts.forEach(function(contact) {
    const jid = String(contact.jid || '').trim();

    if (!jid || /@g\.us$/i.test(jid)) {
      return;
    }

    if (
      !/@s\.whatsapp\.net$/i.test(jid) &&
      !/@lid$/i.test(jid)
    ) {
      return;
    }

    const identity = jid.toLowerCase();
    const phone = contact.phone || phoneFromJidOrValue_(jid);
    let row = byIdentity[identity];

    if (row) {
      row[2] = contact.name || row[2] || row[1];
      row[3] = 'PRIVATE';
      row[4] = phone || row[4];
      row[5] = jid;
      row[8] = 'WUZAPI /user/contacts';
      row[10] = now;
    } else {
      const code = nextRecipientCode_('USR', usedCodes);
      row = [
        false,
        code,
        contact.name || phone || jid,
        'PRIVATE',
        phone,
        jid,
        '',
        false,
        'WUZAPI /user/contacts',
        '',
        now
      ];
      existing.push(row);
      byIdentity[identity] = row;
    }

    contactCount++;
  });

  // v4.4: hasil deteksi baru TIDAK diaktifkan dan TIDAK dijadikan default
  // otomatis. Pengguna tinggal centang penerima yang memang ingin dipakai.
  // Nilai Aktif/Default milik baris yang sudah ada tetap dipertahankan.

  const sortedExisting = sortRecipientRowsActiveFirst_(
    existing.filter(recipientRowHasIdentity_)
  );

  cleanupRecipientBlankRows_(sheet);

  if (sortedExisting.length) {
    ensureSheetSize_(sheet, sortedExisting.length + 10, APP.RECIPIENT_HEADERS.length);
    sheet.getRange(2, 1, sortedExisting.length, APP.RECIPIENT_HEADERS.length)
      .setValues(sortedExisting);
  }

  // v4.5: tulis ulang juga ke buku terpisah agar group/kontak tidak tercampur.
  syncSeparateBooksFromRecipients_(ss, sortedExisting);

  sortRecipientSheetActiveFirst_(sheet);

  if (groupCount > 0 || contactCount > 0 || syncWarnings.length === 0) {
    PropertiesService.getScriptProperties()
      .setProperty('LAST_RECIPIENT_SYNC', new Date().toISOString());
  }

  CacheService.getScriptCache().remove('CONTACT_MAP_V4');

  if (showToast) {
    const suffix = syncWarnings.length
      ? ' | Peringatan: ' + syncWarnings.join(' ; ')
      : '';

    ss.toast(
      'Sinkron penerima: ' +
      groupCount + ' group + ' + contactCount + ' kontak.' + suffix,
      APP.NAME,
      10
    );
  }

  if (syncWarnings.length >= 2 && groupCount === 0 && contactCount === 0) {
    throw new Error('Sinkron penerima gagal: ' + syncWarnings.join(' ; '));
  }

  return {
    groups: groupCount,
    contacts: contactCount,
    totalRows: sortedExisting.length,
    warnings: syncWarnings
  };
}


function nextRecipientCode_(prefix, usedCodes) {
  let i = 1;
  let code;

  do {
    code = prefix + String(i++).padStart(3, '0');
  } while (usedCodes[code.toLowerCase()]);

  usedCodes[code.toLowerCase()] = true;
  return code;
}


function extractGroupList_(json) {
  if (!json) {
    return [];
  }

  if (json.data && Array.isArray(json.data.Groups)) {
    return json.data.Groups;
  }

  if (json.data && Array.isArray(json.data.groups)) {
    return json.data.groups;
  }

  if (Array.isArray(json.data)) {
    return json.data;
  }

  if (Array.isArray(json.Groups)) {
    return json.Groups;
  }

  if (Array.isArray(json.groups)) {
    return json.groups;
  }

  if (Array.isArray(json)) {
    return json;
  }

  return [];
}


function extractContactList_(json) {
  if (!json) {
    return [];
  }

  let data = (json && typeof json === 'object' && 'data' in json)
    ? json.data
    : json;

  if (data && data.Contacts !== undefined) {
    data = data.Contacts;
  } else if (data && data.contacts !== undefined) {
    data = data.contacts;
  }

  // Sebagian fork mengembalikan array contact object.
  if (Array.isArray(data)) {
    return data.map(function(info) {
      info = info || {};
      const jid = String(
        info.JID || info.jid || info.Id || info.id || info.Phone || info.phone || ''
      ).trim();

      return {
        jid: normalizePrivateJid_(jid) || jid,
        phone: phoneFromJidOrValue_(
          info.Phone || info.phone || info.Mobile || info.mobile || jid
        ),
        name: chooseContactName_(info, jid),
        raw: info
      };
    }).filter(function(item) {
      return Boolean(item.jid);
    });
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  // Bentuk map: { "628xx@s.whatsapp.net": { ... } }
  return Object.keys(data).map(function(jid) {
    const info = data[jid] || {};

    return {
      jid: jid,
      phone: phoneFromJidOrValue_(
        info.Phone || info.phone || info.Mobile || info.mobile || jid
      ),
      name: chooseContactName_(info, jid),
      raw: info
    };
  });
}


function chooseContactName_(info, jid) {
  info = info || {};

  const candidates = [
    info.FullName,
    info.PushName,
    info.BusinessName,
    info.FirstName,
    info.Name,
    info.name,
    info.VerifiedName
  ];

  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] && typeof candidates[i] !== 'object') {
      const text = String(candidates[i]).trim();
      if (text) {
        return text;
      }
    }
  }

  return phoneFromJidOrValue_(jid) || String(jid || '');
}


// Nama fungsi lama tetap tersedia; sekarang sinkron ke sumber utama PENERIMA_WA.
function sinkronGroupWuzapi() {
  return sinkronPenerimaWuzapi(true);
}


/* =====================================================================
 * KONTAK & MENTION
 * ===================================================================== */

function prepareMentions_(spec, groupJid) {
  spec = String(spec || '').trim();

  if (!spec) {
    return {
      all: false,
      jids: [],
      visibleTags: []
    };
  }

  const normalized = spec
    .toLowerCase()
    .replace(/\s+/g, '');

  if (
    normalized === '@semua' ||
    normalized === 'semua' ||
    normalized === '@all' ||
    normalized === 'all' ||
    normalized === '@everyone' ||
    normalized === 'everyone'
  ) {
    // Mention @semua hanya bermakna di group. Pada chat pribadi,
    // notifikasi tetap dikirim tanpa metadata mention.
    if (!/@g\.us$/i.test(String(groupJid || ''))) {
      return {
        all: false,
        jids: [],
        visibleTags: []
      };
    }

    const jids = getGroupParticipantJids_(groupJid);

    return {
      all: true,
      jids: unique_(jids),
      visibleTags: unique_(jids).map(jidKeVisibleTag_)
    };
  }

  const contacts = buildContactsMap_();

  const tokens = spec
    .split(/[,;|\n]+/)
    .map(function(v) {
      return String(v || '').trim();
    })
    .filter(Boolean);

  const jids = [];

  tokens.forEach(function(token) {
    let clean = token.replace(/^@+/, '').trim();
    let jid = '';

    // Nama / alias dari sheet KONTAK.
    const contactMatch = contacts[clean.toLowerCase()];

    if (contactMatch) {
      jid = contactMatch;
    } else {
      jid = normalizeMentionJid_(clean);
    }

    if (!jid) {
      throw new Error(
        'Mention tidak ditemukan di PENERIMA_WA/KONTAK atau bukan nomor valid: ' + token
      );
    }

    jids.push(jid);
  });

  const uniqueJids = unique_(jids);

  return {
    all: false,
    jids: uniqueJids,
    visibleTags: uniqueJids.map(jidKeVisibleTag_)
  };
}


function buildContactsMap_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('CONTACT_MAP_V4');

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_) {}
  }

  const ss = getSpreadsheet_();
  const map = {};

  // Sumber utama: PRIVATE pada PENERIMA_WA.
  const recipientSheet = ss.getSheetByName(APP.SHEET_RECIPIENT);

  if (recipientSheet && recipientSheet.getLastRow() >= 2) {
    const rows = recipientSheet
      .getRange(
        2,
        1,
        recipientSheet.getLastRow() - 1,
        APP.RECIPIENT_HEADERS.length
      )
      .getValues();

    rows.forEach(function(row) {
      if (!isAktif_(row[0])) {
        return;
      }

      const target = recipientRowToObject_(row);

      if (target.type !== 'PRIVATE') {
        return;
      }

      const jid = normalizePrivateJid_(target.jid || target.phone);

      if (!jid) {
        return;
      }

      [target.name, target.code, target.phone, target.jid]
        .concat(target.aliases || [])
        .map(function(v) { return String(v || '').trim(); })
        .filter(Boolean)
        .forEach(function(key) {
          map[key.toLowerCase()] = jid;
        });
    });
  }

  // Legacy KONTAK tetap dibaca agar file lama tidak kehilangan mention.
  const sheet = ss.getSheetByName(APP.SHEET_CONTACT);

  if (sheet && sheet.getLastRow() >= 2) {
    const rows = sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        APP.CONTACT_HEADERS.length
      )
      .getValues();

    rows.forEach(function(row) {
      if (!isAktif_(row[0])) {
        return;
      }

      const newBook = APP.CONTACT_HEADERS.length >= 10;
      const name = newBook ? String(row[2] || '').trim() : String(row[1] || '').trim();
      const raw = newBook ? String(row[4] || row[3] || '').trim() : String(row[2] || '').trim();
      const aliases = newBook ? String(row[5] || '').trim() : String(row[3] || '').trim();
      const jid = normalizeMentionJid_(raw);

      if (!jid) {
        return;
      }

      if (name) {
        map[name.toLowerCase()] = jid;
      }

      aliases
        .split(/[,;|]+/)
        .map(function(v) { return v.trim(); })
        .filter(Boolean)
        .forEach(function(alias) {
          map[alias.toLowerCase()] = jid;
        });

      map[raw.toLowerCase()] = jid;
      map[jid.toLowerCase()] = jid;
    });
  }

  try {
    cache.put(
      'CONTACT_MAP_V4',
      JSON.stringify(map),
      300
    );
  } catch (_) {}

  return map;
}


function getGroupParticipantJids_(groupJid) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'GROUP_PART_' + shortHash_(groupJid);
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_) {}
  }

  const result = wuzapiRequest_('/group/list', 'get', null);
  const groups = extractGroupList_(result.json);

  const group = groups.find(function(item) {
    const jid = String(
      item.JID ||
      item.jid ||
      item.Id ||
      item.id ||
      ''
    ).trim();

    return jid === groupJid;
  });

  if (!group) {
    throw new Error(
      'Group JID tidak ditemukan di /group/list: ' + groupJid
    );
  }

  const participants =
    Array.isArray(group.Participants)
      ? group.Participants
      : Array.isArray(group.participants)
        ? group.participants
        : [];

  const jids = participants
    .map(function(item) {
      if (typeof item === 'string') {
        return item;
      }

      return String(
        item.JID ||
        item.jid ||
        item.Phone ||
        item.phone ||
        item.Id ||
        item.id ||
        ''
      ).trim();
    })
    .filter(Boolean);

  try {
    cache.put(
      cacheKey,
      JSON.stringify(jids),
      300
    );
  } catch (_) {}

  return jids;
}


function normalizeMentionJid_(value) {
  let text = String(value || '').trim();

  if (!text) {
    return '';
  }

  if (
    /@s\.whatsapp\.net$/i.test(text) ||
    /@lid$/i.test(text)
  ) {
    return text;
  }

  text = text.replace(/^@+/, '');

  let digits = text.replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  const cc = String(
    PropertiesService
      .getScriptProperties()
      .getProperty('DEFAULT_COUNTRY_CODE') || '62'
  ).replace(/\D/g, '');

  if (digits.charAt(0) === '0' && cc) {
    digits = cc + digits.substring(1);
  }

  return digits + '@s.whatsapp.net';
}


function jidKeVisibleTag_(jid) {
  return '@' + String(jid || '').split('@')[0];
}


function gabungkanMentionDenganPesan_(mention, message) {
  message = String(message || '');

  if (
    !mention ||
    !mention.jids ||
    !mention.jids.length
  ) {
    return message;
  }

  const showAll = propertyBool_(
    'MENTION_ALL_VISIBLE',
    true
  );

  let prefix = '';

  if (mention.all) {
    prefix = showAll
      ? mention.visibleTags.join(' ')
      : '@semua';
  } else {
    prefix = mention.visibleTags.join(' ');
  }

  if (!prefix) {
    return message;
  }

  if (!message) {
    return prefix;
  }

  return prefix + '\n\n' + message;
}


function buildContextInfo_(mention) {
  if (
    !mention ||
    !mention.jids ||
    !mention.jids.length
  ) {
    return {};
  }

  return {
    MentionedJid: mention.jids
  };
}


/* =====================================================================
 * TEMPLATE & FORMAT TEXT
 * ===================================================================== */

function getTemplateByName_(name) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(APP.SHEET_TEMPLATE);

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(
      'Template tidak ditemukan: ' + name
    );
  }

  const rows = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      APP.TEMPLATE_HEADERS.length
    )
    .getValues();

  const lower = String(name || '').trim().toLowerCase();

  const row = rows.find(function(item) {
    return (
      isAktif_(item[0]) &&
      String(item[1] || '').trim().toLowerCase() === lower
    );
  });

  if (!row) {
    throw new Error(
      'Template tidak ditemukan / nonaktif: ' + name
    );
  }

  return {
    name: String(row[1] || '').trim(),
    body: String(row[2] || ''),
    style: String(row[3] || 'NONE').trim().toUpperCase()
  };
}


function renderScheduleMessage_(snapshot, group, isTest) {
  const timezone = getTimezone_();
  const now = new Date();

  let body = String(snapshot.message || '');

  if (snapshot.templateName) {
    body = String(snapshot.templateBody || '');

    if (body.indexOf('{pesan}') !== -1) {
      body = body.replace(/\{pesan\}/gi, String(snapshot.message || ''));
    } else if (snapshot.message) {
      body += (body ? '\n\n' : '') + String(snapshot.message);
    }
  }

  const variables = {
    '{hari}': snapshot.hari || getHariIndonesia_(now, timezone),
    '{tanggal}': Utilities.formatDate(now, timezone, 'dd/MM/yyyy'),
    '{tanggal_iso}': Utilities.formatDate(now, timezone, 'yyyy-MM-dd'),
    '{jam}': snapshot.jam || Utilities.formatDate(now, timezone, 'HH:mm'),
    '{penerima}': group.name || '',
    '{nama_penerima}': group.name || '',
    '{kode_penerima}': group.code || '',
    '{jenis_penerima}': group.type || '',
    '{nomor_penerima}': group.phone || '',
    '{jid_penerima}': group.jid || '',
    // Alias template v3 tetap didukung.
    '{group}': group.name || '',
    '{nama_group}': group.name || '',
    '{group_kode}': group.code || '',
    '{keterangan}': snapshot.description || '',
    '{tipe}': snapshot.type || '',
    '{id_jadwal}': snapshot.scheduleId || ''
  };

  Object.keys(variables).forEach(function(key) {
    body = replaceAllInsensitive_(
      body,
      key,
      String(variables[key])
    );
  });

  let style = String(snapshot.style || 'NONE').toUpperCase();

  if (
    !style ||
    style === 'AUTO'
  ) {
    style = String(
      snapshot.templateStyle || 'NONE'
    ).toUpperCase();
  }

  body = applyStyle_(body, style);

  if (isTest) {
    body = '[TEST NOTIFIKASI]\n\n' + body;
  }

  return body;
}


function applyStyle_(text, style) {
  text = String(text || '');
  style = String(style || 'NONE')
    .trim()
    .toUpperCase();

  if (
    !text ||
    !style ||
    style === 'NONE' ||
    style === 'AUTO'
  ) {
    return text;
  }

  if (style === 'BOLD') {
    return '*' + text + '*';
  }

  if (style === 'ITALIC') {
    return '_' + text + '_';
  }

  if (style === 'BOLD_ITALIC') {
    return '_*' + text + '*_';
  }

  if (style === 'STRIKE') {
    return '~' + text + '~';
  }

  if (style === 'MONO') {
    return '```' + text + '```';
  }

  if (style === 'QUOTE') {
    return text
      .split(/\r?\n/)
      .map(function(line) {
        return '> ' + line;
      })
      .join('\n');
  }

  return text;
}


/* =====================================================================
 * HEALTH CHECK WUZAPI
 * ===================================================================== */

function checkSessionHealth_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('WUZAPI_HEALTH_V3');

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_) {}
  }

  let health;

  try {
    const result = wuzapiRequest_(
      '/session/status',
      'get',
      null,
      { skipHealth: true }
    );

    const json = result.json || {};
    const data = json.data || json;

    const connected = firstBoolean_([
      data.connected,
      data.Connected,
      data.isConnected,
      data.IsConnected
    ]);

    const loggedIn = firstBoolean_([
      data.loggedIn,
      data.LoggedIn,
      data.loggedin,
      data.isLoggedIn,
      data.IsLoggedIn
    ]);

    if (connected === false || loggedIn === false) {
      health = {
        ok: false,
        detail:
          'connected=' + connected +
          ', loggedIn=' + loggedIn
      };
    } else {
      health = {
        ok: true,
        detail:
          'connected=' +
          (connected === null ? 'unknown' : connected) +
          ', loggedIn=' +
          (loggedIn === null ? 'unknown' : loggedIn)
      };
    }

  } catch (err) {
    health = {
      ok: false,
      detail: ambilErrorSingkat_(err)
    };
  }

  try {
    cache.put(
      'WUZAPI_HEALTH_V3',
      JSON.stringify(health),
      45
    );
  } catch (_) {}

  return health;
}


function firstBoolean_(values) {
  for (let i = 0; i < values.length; i++) {
    if (typeof values[i] === 'boolean') {
      return values[i];
    }

    if (String(values[i]).toLowerCase() === 'true') {
      return true;
    }

    if (String(values[i]).toLowerCase() === 'false') {
      return false;
    }
  }

  return null;
}


/* =====================================================================
 * WUZAPI REQUEST
 * ===================================================================== */

/**
 * Fetch beberapa endpoint GET WuzAPI secara paralel.
 * Hasil per endpoint tidak melempar global error agar satu endpoint yang gagal
 * tidak menghapus hasil endpoint lain.
 */
function wuzapiFetchMany_(endpoints) {
  const cfg = getWuzapiConfig_();
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const list = (endpoints || []).map(function(endpoint) {
    return String(endpoint || '').trim();
  }).filter(Boolean);

  const requests = list.map(function(endpoint) {
    return {
      url: base + '/' + endpoint.replace(/^\/+/, ''),
      method: 'get',
      headers: {
        Token: cfg.token,
        Accept: 'application/json'
      },
      muteHttpExceptions: true,
      followRedirects: true
    };
  });

  const output = {};

  let responses;
  try {
    responses = UrlFetchApp.fetchAll(requests);
  } catch (err) {
    list.forEach(function(endpoint) {
      output[endpoint] = {
        ok: false,
        httpCode: '',
        json: null,
        responseText: '',
        error: 'Gagal menghubungi WuzAPI: ' + err.message
      };
    });
    return output;
  }

  list.forEach(function(endpoint, index) {
    const response = responses[index];
    const httpCode = response.getResponseCode();
    const responseText = response.getContentText() || '';
    let json = null;

    try {
      json = JSON.parse(responseText);
    } catch (_) {}

    const httpSuccess = httpCode >= 200 && httpCode < 300;
    const apiSuccess =
      !json || typeof json.success === 'undefined' || json.success === true;

    output[endpoint] = {
      ok: httpSuccess && apiSuccess,
      httpCode: httpCode,
      json: json,
      responseText: responseText,
      error: (httpSuccess && apiSuccess)
        ? ''
        : ('HTTP ' + httpCode + ': ' + responseText.substring(0, 800))
    };
  });

  return output;
}


function wuzapiRequest_(endpoint, method, payload, internalOptions) {
  internalOptions = internalOptions || {};

  const cfg = getWuzapiConfig_();

  const url =
    cfg.baseUrl.replace(/\/+$/, '') +
    '/' +
    String(endpoint || '').replace(/^\/+/, '');

  const options = {
    method: String(method || 'get').toLowerCase(),
    headers: {
      Token: cfg.token,
      Accept: 'application/json'
    },
    muteHttpExceptions: true,
    followRedirects: true
  };

  if (payload !== undefined && payload !== null) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  let response;

  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (err) {
    const e = new Error(
      'Gagal menghubungi WuzAPI: ' + err.message
    );

    e.httpCode = '';
    e.responseText = '';
    throw e;
  }

  const httpCode = response.getResponseCode();
  const responseText = response.getContentText() || '';

  let json = null;

  try {
    json = JSON.parse(responseText);
  } catch (_) {}

  const httpSuccess =
    httpCode >= 200 &&
    httpCode < 300;

  const apiSuccess =
    !json ||
    typeof json.success === 'undefined' ||
    json.success === true;

  if (!httpSuccess || !apiSuccess) {
    const err = new Error(
      'WuzAPI gagal. HTTP ' +
      httpCode +
      ': ' +
      responseText.substring(0, 1500)
    );

    err.httpCode = httpCode;
    err.responseText = responseText;
    throw err;
  }

  return {
    httpCode: httpCode,
    responseText: responseText,
    json: json
  };
}


function getWuzapiConfig_() {
  const props = PropertiesService.getScriptProperties();

  const baseUrl = String(
    props.getProperty('WUZAPI_URL') || ''
  ).trim();

  const token = String(
    props.getProperty('WUZAPI_TOKEN') || ''
  ).trim();

  if (
    !baseUrl ||
    /domainanda/i.test(baseUrl)
  ) {
    throw new Error(
      'WUZAPI_URL belum dikonfigurasi.'
    );
  }

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error(
      'WUZAPI_URL harus diawali http:// atau https://'
    );
  }

  if (
    !token ||
    /ISI_TOKEN/i.test(token)
  ) {
    throw new Error(
      'WUZAPI_TOKEN belum dikonfigurasi.'
    );
  }

  return {
    baseUrl: baseUrl,
    token: token
  };
}


/* =====================================================================
 * MEDIA
 * ===================================================================== */

function ambilMedia_(source, customFileName, type) {
  source = String(source || '').trim();
  type = String(type || '').toUpperCase();

  if (!source) {
    throw new Error('Sumber media kosong.');
  }

  if (/^data:/i.test(source)) {
    return validasiDanNormalisasiDataUri_(
      source,
      customFileName,
      type,
      'DATA URI'
    );
  }

  let blob;
  let displaySource = source;

  const driveId = extractGoogleDriveId_(source);

  if (driveId) {
    try {
      const file = DriveApp.getFileById(driveId);
      blob = file.getBlob();

      if (!customFileName) {
        customFileName = file.getName();
      }

      displaySource =
        'Google Drive: ' + file.getName();

    } catch (err) {
      throw new Error(
        'Gagal membaca file Google Drive. Pastikan akun GAS punya akses. ' +
        err.message
      );
    }
  } else {
    let response;

    try {
      response = UrlFetchApp.fetch(source, {
        followRedirects: true,
        muteHttpExceptions: true
      });
    } catch (err) {
      throw new Error(
        'Gagal mengambil media URL: ' + err.message
      );
    }

    const code = response.getResponseCode();

    if (code < 200 || code >= 300) {
      throw new Error(
        'Media URL gagal diambil. HTTP ' +
        code +
        ': ' +
        source
      );
    }

    blob = response.getBlob();

    if (!customFileName) {
      customFileName =
        namaFileDariUrl_(source) ||
        blob.getName() ||
        '';
    }
  }

  const bytes = blob.getBytes();
  checkMediaSize_(bytes.length);

  let mime = String(
    blob.getContentType() || ''
  ).toLowerCase();

  if (
    !mime ||
    mime === 'application/octet-stream'
  ) {
    mime =
      mimeDariNamaFile_(customFileName) ||
      mime;
  }

  return buatDataMedia_(
    bytes,
    mime,
    customFileName,
    type,
    displaySource
  );
}


function extractGoogleDriveId_(source) {
  const text = String(source || '').trim();

  if (/^drive:/i.test(text)) {
    return text
      .replace(/^drive:/i, '')
      .trim();
  }

  let m = text.match(
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/
  );

  if (m) {
    return m[1];
  }

  m = text.match(
    /[?&]id=([a-zA-Z0-9_-]{10,})/
  );

  if (m) {
    return m[1];
  }

  return '';
}


function buatDataMedia_(
  bytes,
  mime,
  fileName,
  type,
  displaySource
) {
  mime = String(
    mime || 'application/octet-stream'
  ).toLowerCase();

  fileName = String(
    fileName || ''
  ).trim();

  validateMimeForType_(
    mime,
    fileName,
    type
  );

  const base64 = Utilities.base64Encode(bytes);

  if (type === 'DOCUMENT') {
    if (!fileName) {
      fileName =
        'dokumen_' +
        Utilities.formatDate(
          new Date(),
          getTimezone_(),
          'yyyyMMdd_HHmmss'
        );
    }

    return {
      dataUri:
        'data:application/octet-stream;base64,' +
        base64,
      fileName: fileName,
      mime: mime,
      displaySource: displaySource
    };
  }

  return {
    dataUri:
      'data:' +
      mime +
      ';base64,' +
      base64,
    fileName:
      fileName ||
      namaFileDefault_(type, mime),
    mime: mime,
    displaySource: displaySource
  };
}


function validasiDanNormalisasiDataUri_(
  dataUri,
  customFileName,
  type,
  displaySource
) {
  const match = String(dataUri).match(
    /^data:([^;,]+);base64,([\s\S]+)$/i
  );

  if (!match) {
    throw new Error(
      'DATA URI tidak valid. Format: data:mime/type;base64,XXXX'
    );
  }

  const mime = String(
    match[1] || ''
  ).toLowerCase();

  const rawBase64 = String(
    match[2] || ''
  ).replace(/\s+/g, '');

  let bytes;

  try {
    bytes = Utilities.base64Decode(
      rawBase64
    );
  } catch (_) {
    throw new Error(
      'Base64 media tidak valid.'
    );
  }

  checkMediaSize_(bytes.length);

  return buatDataMedia_(
    bytes,
    mime,
    customFileName,
    type,
    displaySource
  );
}


function validateMimeForType_(mime, fileName, type) {
  const ext = extensionDariNama_(fileName);

  if (type === 'IMAGE') {
    const okMime = [
      'image/jpeg',
      'image/jpg',
      'image/png'
    ].includes(mime);

    const okExt = [
      'jpg',
      'jpeg',
      'png'
    ].includes(ext);

    if (!okMime && !okExt) {
      throw new Error(
        'IMAGE WuzAPI harus PNG/JPEG. MIME: ' + mime
      );
    }
  }

  if (type === 'VIDEO') {
    const okMime = [
      'video/mp4',
      'video/3gpp',
      'video/3gp'
    ].includes(mime);

    const okExt = [
      'mp4',
      '3gp',
      '3gpp'
    ].includes(ext);

    if (!okMime && !okExt) {
      throw new Error(
        'VIDEO WuzAPI harus MP4/3GPP. MIME: ' + mime
      );
    }
  }

  if (type === 'AUDIO') {
    const okMime = [
      'audio/ogg',
      'application/ogg',
      'audio/opus'
    ].includes(mime);

    const okExt = [
      'ogg',
      'opus'
    ].includes(ext);

    if (!okMime && !okExt) {
      throw new Error(
        'AUDIO WuzAPI standar harus OGG/Opus. GAS tidak mentranscode MP3 otomatis.'
      );
    }
  }

  if (type === 'STICKER') {
    const okMime = mime === 'image/webp';
    const okExt = ext === 'webp';

    if (!okMime && !okExt) {
      throw new Error(
        'STICKER WuzAPI harus WEBP. MIME: ' + mime
      );
    }
  }
}


function checkMediaSize_(bytesLength) {
  const maxMb = Math.max(
    1,
    Number(
      PropertiesService
        .getScriptProperties()
        .getProperty('MEDIA_MAX_MB') || 15
    ) || 15
  );

  const currentMb =
    bytesLength /
    1024 /
    1024;

  if (currentMb > maxMb) {
    throw new Error(
      'Media terlalu besar: ' +
      currentMb.toFixed(2) +
      ' MB. Batas MEDIA_MAX_MB=' +
      maxMb +
      ' MB.'
    );
  }
}


function mimeDariNamaFile_(name) {
  const ext = extensionDariNama_(name);

  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    mp4: 'video/mp4',
    '3gp': 'video/3gpp',
    '3gpp': 'video/3gpp',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    pdf: 'application/pdf',
    txt: 'text/plain',
    csv: 'text/csv',
    zip: 'application/zip',
    doc: 'application/msword',
    docx:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };

  return map[ext] || '';
}


function namaFileDariUrl_(url) {
  try {
    const clean = String(url)
      .split('#')[0]
      .split('?')[0];

    const last =
      clean.substring(
        clean.lastIndexOf('/') + 1
      );

    return decodeURIComponent(
      last || ''
    );
  } catch (_) {
    return '';
  }
}


function extensionDariNama_(name) {
  const text = String(name || '')
    .toLowerCase()
    .trim();

  if (text.indexOf('.') === -1) {
    return '';
  }

  return text
    .split('.')
    .pop()
    .replace(/[^a-z0-9]/g, '');
}


function namaFileDefault_(type, mime) {
  const ts = Utilities.formatDate(
    new Date(),
    getTimezone_(),
    'yyyyMMdd_HHmmss'
  );

  if (type === 'IMAGE') {
    return (
      'gambar_' +
      ts +
      (mime === 'image/png'
        ? '.png'
        : '.jpg')
    );
  }

  if (type === 'VIDEO') {
    return 'video_' + ts + '.mp4';
  }

  if (type === 'AUDIO') {
    return 'audio_' + ts + '.ogg';
  }

  if (type === 'STICKER') {
    return 'sticker_' + ts + '.webp';
  }

  return 'file_' + ts;
}


/* =====================================================================
 * HARI LIBUR
 * ===================================================================== */

function sinkronLiburIndonesia() {
  const ss = getSpreadsheet_();

  if (!ss) {
    throw new Error('Spreadsheet tidak ditemukan.');
  }

  ensureHolidaySheet_(ss);

  const timezone = getTimezone_();
  const now = new Date();
  const year = Number(
    Utilities.formatDate(
      now,
      timezone,
      'yyyy'
    )
  );

  const month = Number(
    Utilities.formatDate(
      now,
      timezone,
      'M'
    )
  );

  const years = [year];

  // Menjelang akhir tahun, siapkan data tahun berikutnya.
  if (month >= 10) {
    years.push(year + 1);
  }

  let total = 0;
  let successfulYears = 0;
  const messages = [];

  years.forEach(function(y) {
    try {
      const count = syncHolidayYear_(ss, y);
      total += count;
      successfulYears++;
      messages.push(y + ': ' + count);
    } catch (err) {
      messages.push(
        y + ': GAGAL (' + ambilErrorSingkat_(err) + ')'
      );
    }
  });

  if (successfulYears === 0) {
    throw new Error(
      'Sinkron hari libur gagal dari seluruh sumber API. ' +
      messages.join(' | ')
    );
  }

  PropertiesService
    .getScriptProperties()
    .setProperty(
      'LAST_HOLIDAY_SYNC',
      new Date().toISOString()
    );

  CacheService
    .getScriptCache()
    .remove('HOLIDAY_MAP_V3');

  ss.toast(
    'Sinkron libur selesai. ' +
    messages.join(' | '),
    APP.NAME,
    10
  );

  return total;
}


function syncHolidayYear_(ss, year) {
  const props = PropertiesService.getScriptProperties();

  const urls = [
    String(
      props.getProperty('HOLIDAY_API_URL') || ''
    ),
    String(
      props.getProperty('HOLIDAY_API_FALLBACK_URL') || ''
    )
  ].filter(Boolean);

  let holidays = [];
  let sourceUsed = '';
  let lastError = null;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i].replace(
      /\{year\}/g,
      String(year)
    );

    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          Accept: 'application/json'
        }
      });

      const code = response.getResponseCode();

      if (code < 200 || code >= 300) {
        throw new Error(
          'HTTP ' + code
        );
      }

      const json = JSON.parse(
        response.getContentText() || '{}'
      );

      holidays = parseHolidayResponse_(json);

      if (!holidays.length) {
        throw new Error(
          'Data hari libur kosong.'
        );
      }

      sourceUsed =
        'AUTO:' + url.split('?')[0];

      break;

    } catch (err) {
      lastError = err;
      holidays = [];
    }
  }

  if (!holidays.length) {
    throw (
      lastError ||
      new Error(
        'Semua sumber API hari libur gagal.'
      )
    );
  }

  const sheet = ss.getSheetByName(APP.SHEET_HOLIDAY);

  const existing = sheet.getLastRow() >= 2
    ? sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          APP.HOLIDAY_HEADERS.length
        )
        .getValues()
    : [];

  // Pertahankan baris manual dan AUTO untuk tahun lain.
  const keep = existing.filter(function(row) {
    const dateIso = dateValueToIso_(
      row[1],
      getTimezone_()
    );

    const source = String(
      row[4] || ''
    ).trim();

    const isAuto =
      source.indexOf('AUTO:') === 0;

    return !(
      isAuto &&
      dateIso.indexOf(
        String(year) + '-'
      ) === 0
    );
  });

  const now = new Date();

  const imported = holidays
    .map(function(item) {
      const dateIso = String(
        item.date ||
        item.holiday_date ||
        ''
      ).trim();

      const name = String(
        item.description ||
        item.name ||
        item.holiday_name ||
        ''
      ).trim();

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dateIso) ||
        !name
      ) {
        return null;
      }

      let type = String(
        item.type ||
        item.holiday_type ||
        ''
      ).trim();

      if (!type) {
        type =
          /cuti bersama/i.test(name)
            ? 'cuti_bersama'
            : 'libur_nasional';
      }

      return [
        true,
        dateIso,
        name,
        type,
        sourceUsed,
        now
      ];
    })
    .filter(Boolean);

  const merged = dedupeHolidayRows_(
    keep.concat(imported)
  );

  if (sheet.getLastRow() >= 2) {
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        APP.HOLIDAY_HEADERS.length
      )
      .clearContent();
  }

  if (merged.length) {
    merged.sort(function(a, b) {
      return String(a[1]).localeCompare(
        String(b[1])
      );
    });

    sheet
      .getRange(
        2,
        1,
        merged.length,
        APP.HOLIDAY_HEADERS.length
      )
      .setValues(merged);
  }

  return imported.length;
}


function parseHolidayResponse_(json) {
  if (Array.isArray(json)) {
    return json;
  }

  if (
    json &&
    Array.isArray(json.data)
  ) {
    return json.data;
  }

  if (
    json &&
    json.data &&
    Array.isArray(json.data.holidays)
  ) {
    return json.data.holidays;
  }

  if (
    json &&
    Array.isArray(json.holidays)
  ) {
    return json.holidays;
  }

  return [];
}


function dedupeHolidayRows_(rows) {
  const seen = {};

  return rows.filter(function(row) {
    const dateIso = dateValueToIso_(
      row[1],
      getTimezone_()
    );

    const name = String(
      row[2] || ''
    ).trim();

    if (!dateIso || !name) {
      return false;
    }

    const key =
      dateIso +
      '|' +
      name.toLowerCase();

    if (seen[key]) {
      return false;
    }

    seen[key] = true;
    row[1] = dateIso;

    return true;
  });
}


function buildHolidayMap_(ss) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('HOLIDAY_MAP_V3');

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_) {}
  }

  const sheet = ss.getSheetByName(APP.SHEET_HOLIDAY);
  const map = {};

  if (sheet && sheet.getLastRow() >= 2) {
    const rows = sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        APP.HOLIDAY_HEADERS.length
      )
      .getValues();

    rows.forEach(function(row) {
      if (!isAktif_(row[0])) {
        return;
      }

      const dateIso = dateValueToIso_(
        row[1],
        getTimezone_()
      );

      if (!dateIso) {
        return;
      }

      const name = String(
        row[2] || 'Hari Libur'
      ).trim();

      if (!map[dateIso]) {
        map[dateIso] = {
          name: name,
          type: String(row[3] || ''),
          source: String(row[4] || '')
        };
      } else {
        map[dateIso].name += ' / ' + name;
      }
    });
  }

  try {
    cache.put(
      'HOLIDAY_MAP_V3',
      JSON.stringify(map),
      600
    );
  } catch (_) {}

  return map;
}


/* =====================================================================
 * MAINTENANCE HARIAN
 * ===================================================================== */

function maintenanceHarian() {
  // Watchdog ringan: jika dispatcher hilang, maintenance memulihkannya.
  try {
    pastikanTriggerAktif_();
  } catch (triggerErr) {
    console.error('Maintenance trigger watchdog:', triggerErr);
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(20000)) {
    return;
  }

  try {
    const ss = getSpreadsheet_();

    if (!ss) {
      return;
    }

    if (
      propertyBool_('RECIPIENT_AUTO_SYNC', true) &&
      isElapsedDays_(
        PropertiesService
          .getScriptProperties()
          .getProperty('LAST_RECIPIENT_SYNC'),
        propertyInt_('RECIPIENT_SYNC_DAYS', 1, 1)
      )
    ) {
      try {
        if (isWuzapiConfigured_()) {
          sinkronPenerimaWuzapi(false);
        }
      } catch (err) {
        console.error('Maintenance penerima:', err);
      }
    }

    if (
      propertyBool_('HOLIDAY_AUTO_SYNC', true) &&
      isElapsedDays_(
        PropertiesService
          .getScriptProperties()
          .getProperty('LAST_HOLIDAY_SYNC'),
        propertyInt_('HOLIDAY_SYNC_DAYS', 7, 1)
      )
    ) {
      try {
        sinkronLiburIndonesia();
      } catch (err) {
        console.error(
          'Maintenance holiday:',
          err
        );
      }
    }

    if (
      propertyBool_('BACKUP_AUTO', true) &&
      isElapsedDays_(
        PropertiesService
          .getScriptProperties()
          .getProperty('LAST_CONFIG_BACKUP'),
        propertyInt_('BACKUP_INTERVAL_DAYS', 7, 1)
      )
    ) {
      try {
        backupKonfigurasi_(
          'AUTO_MAINTENANCE',
          ss
        );
      } catch (err) {
        console.error(
          'Maintenance backup:',
          err
        );
      }
    }

    cleanupRetryQueue_(ss);

  } finally {
    lock.releaseLock();
  }
}


function cleanupRetryQueue_(ss) {
  const sheet = ss.getSheetByName(APP.SHEET_RETRY);

  if (!sheet || sheet.getLastRow() < 2) {
    return;
  }

  const keepDays = propertyInt_(
    'RETRY_QUEUE_KEEP_DAYS',
    30,
    1
  );

  const cutoff =
    Date.now() -
    keepDays * 24 * 60 * 60 * 1000;

  const rows = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      APP.RETRY_HEADERS.length
    )
    .getValues();

  const keep = rows.filter(function(row) {
    const status = String(
      row[9] || ''
    ).toUpperCase();

    if (
      status === 'MENUNGGU' ||
      status === 'RETRY'
    ) {
      return true;
    }

    const done = asDate_(row[11]);
    const created = asDate_(row[1]);
    const ref = done || created;

    return !ref || ref.getTime() >= cutoff;
  });

  sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      APP.RETRY_HEADERS.length
    )
    .clearContent();

  if (keep.length) {
    sheet
      .getRange(
        2,
        1,
        keep.length,
        APP.RETRY_HEADERS.length
      )
      .setValues(keep);
  }
}


/* =====================================================================
 * BACKUP & RESTORE
 * ===================================================================== */

function backupKonfigurasiManual() {
  const ss = getSpreadsheet_();

  if (!ss) {
    throw new Error('Spreadsheet tidak ditemukan.');
  }

  const backupId = backupKonfigurasi_(
    'MANUAL',
    ss
  );

  ss.toast(
    'Backup selesai: ' + backupId,
    APP.NAME,
    8
  );
}


function backupKonfigurasi_(reason, ss) {
  ss = ss || getSpreadsheet_();

  if (!ss) {
    throw new Error('Spreadsheet tidak ditemukan.');
  }

  ensureBackupSheet_(ss);

  const sheetNames = [
    APP.SHEET_NOTIF,
    APP.SHEET_CONTACT,
    APP.SHEET_GROUP,
    APP.SHEET_RECIPIENT,
    APP.SHEET_TEMPLATE,
    APP.SHEET_HOLIDAY
  ];

  const snapshot = {
    version: APP.VERSION,
    createdAt: new Date().toISOString(),
    reason: String(reason || 'MANUAL'),
    spreadsheetId: ss.getId(),
    sheets: {},
    properties: safePropertiesForBackup_()
  };

  sheetNames.forEach(function(name) {
    const sheet = ss.getSheetByName(name);

    if (!sheet) {
      return;
    }

    const values = sheet.getDataRange().getValues();

    snapshot.sheets[name] = values.map(function(row) {
      return row.map(function(value) {
        if (
          Object.prototype.toString.call(value) ===
          '[object Date]' &&
          !isNaN(value.getTime())
        ) {
          return {
            __type: 'date',
            value: value.toISOString()
          };
        }

        return value;
      });
    });
  });

  const json = JSON.stringify(snapshot);
  const gzBlob = Utilities.gzip(
    Utilities.newBlob(
      json,
      'application/json',
      'config.json'
    )
  );

  const base64 = Utilities.base64Encode(
    gzBlob.getBytes()
  );

  const chunkSize = 45000;
  const chunks = [];

  for (
    let i = 0;
    i < base64.length;
    i += chunkSize
  ) {
    chunks.push(
      base64.substring(
        i,
        i + chunkSize
      )
    );
  }

  const backupId =
    'BKP-' +
    Utilities.formatDate(
      new Date(),
      getTimezone_(),
      'yyyyMMdd-HHmmss'
    ) +
    '-' +
    shortHash_(Utilities.getUuid());

  const backupSheet = ss.getSheetByName(APP.SHEET_BACKUP);
  const rows = chunks.map(function(chunk, index) {
    return [
      backupId,
      new Date(),
      String(reason || 'MANUAL'),
      index + 1,
      chunks.length,
      chunk
    ];
  });

  backupSheet
    .getRange(
      backupSheet.getLastRow() + 1,
      1,
      rows.length,
      APP.BACKUP_HEADERS.length
    )
    .setValues(rows);

  PropertiesService
    .getScriptProperties()
    .setProperty(
      'LAST_CONFIG_BACKUP',
      new Date().toISOString()
    );

  cleanupOldBackups_(backupSheet);

  return backupId;
}


function restoreBackupTerakhir() {
  const ss = getSpreadsheet_();

  if (!ss) {
    throw new Error('Spreadsheet tidak ditemukan.');
  }

  const sheet = ss.getSheetByName(APP.SHEET_BACKUP);

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(
      'Belum ada backup konfigurasi.'
    );
  }

  /*
   * Kunci backup TARGET sebelum membuat PRE_RESTORE.
   * Kalau target dicari setelah PRE_RESTORE dibuat, yang terpilih
   * justru snapshot kondisi saat ini dan restore tidak menghasilkan apa-apa.
   */
  const dataBefore = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      APP.BACKUP_HEADERS.length
    )
    .getValues();

  const targetBackupId = String(
    dataBefore[dataBefore.length - 1][0] || ''
  );

  if (!targetBackupId) {
    throw new Error(
      'Backup ID terakhir tidak valid.'
    );
  }

  // Backup kondisi saat ini sebagai safety net sebelum restore.
  try {
    backupKonfigurasi_(
      'PRE_RESTORE',
      ss
    );
  } catch (err) {
    console.warn(
      'Pre-restore backup gagal:',
      err.message
    );
  }

  // Ambil kembali seluruh data agar chunk backup target tetap lengkap.
  const data = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      APP.BACKUP_HEADERS.length
    )
    .getValues();

  const parts = data
    .filter(function(row) {
      return String(row[0] || '') === targetBackupId;
    })
    .sort(function(a, b) {
      return Number(a[3]) - Number(b[3]);
    });

  if (!parts.length) {
    throw new Error(
      'Data backup target tidak ditemukan: ' + targetBackupId
    );
  }

  const expected = Number(parts[0][4]) || parts.length;

  if (parts.length !== expected) {
    throw new Error(
      'Backup tidak lengkap. Bagian ' +
      parts.length +
      '/' +
      expected
    );
  }

  const base64 = parts
    .map(function(row) {
      return String(row[5] || '');
    })
    .join('');

  const compressed = Utilities.newBlob(
    Utilities.base64Decode(base64)
  );

  const json = Utilities
    .ungzip(compressed)
    .getDataAsString('UTF-8');

  const snapshot = JSON.parse(json);

  if (!snapshot || !snapshot.sheets) {
    throw new Error(
      'Format backup tidak valid.'
    );
  }

  Object.keys(snapshot.sheets).forEach(function(name) {
    let target = ss.getSheetByName(name);

    if (!target) {
      target = ss.insertSheet(name);
    }

    const values = snapshot.sheets[name].map(function(row) {
      return row.map(function(value) {
        if (
          value &&
          typeof value === 'object' &&
          value.__type === 'date'
        ) {
          return new Date(value.value);
        }

        return value;
      });
    });

    target.clearContents();

    if (values.length && values[0].length) {
      ensureSheetSize_(
        target,
        values.length,
        values[0].length
      );

      target
        .getRange(
          1,
          1,
          values.length,
          values[0].length
        )
        .setValues(values);
    }
  });

  // Restore hanya property non-secret.
  if (snapshot.properties) {
    const props = PropertiesService.getScriptProperties();

    Object.keys(snapshot.properties).forEach(function(key) {
      props.setProperty(
        key,
        String(snapshot.properties[key])
      );
    });

    props.setProperty(
      'SPREADSHEET_ID',
      ss.getId()
    );
  }

  // Pasang kembali header, validasi, formula, ukuran kolom.
  ensureAllSheets_(ss);
  ensureAllScheduleRows_(
    ss.getSheetByName(APP.SHEET_NOTIF)
  );

  CacheService.getScriptCache().remove('CONTACT_MAP_V4');
  CacheService.getScriptCache().remove('HOLIDAY_MAP_V3');

  SpreadsheetApp.flush();

  ss.toast(
    'Restore selesai dari backup ' + targetBackupId,
    APP.NAME,
    10
  );
}

function safePropertiesForBackup_() {
  const all = PropertiesService
    .getScriptProperties()
    .getProperties();

  const secretKeys = {
    WUZAPI_TOKEN: true,
    HOLIDAY_API_KEY: true
  };

  const result = {};

  Object.keys(all).forEach(function(key) {
    // Marker runtime tidak perlu dibackup.
    if (
      key.indexOf('DONE_') === 0 ||
      key.indexOf('QUEUED_') === 0 ||
      key.indexOf('PART_') === 0
    ) {
      return;
    }

    if (secretKeys[key]) {
      return;
    }

    result[key] = all[key];
  });

  return result;
}


function cleanupOldBackups_(sheet) {
  const keepCount = propertyInt_(
    'BACKUP_KEEP',
    20,
    1
  );

  if (!sheet || sheet.getLastRow() < 2) {
    return;
  }

  const rows = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      APP.BACKUP_HEADERS.length
    )
    .getValues();

  const ids = [];

  rows.forEach(function(row) {
    const id = String(row[0] || '');

    if (
      id &&
      ids.indexOf(id) === -1
    ) {
      ids.push(id);
    }
  });

  if (ids.length <= keepCount) {
    return;
  }

  const keepIds = ids.slice(
    Math.max(0, ids.length - keepCount)
  );

  const keepRows = rows.filter(function(row) {
    return keepIds.indexOf(
      String(row[0] || '')
    ) !== -1;
  });

  sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      APP.BACKUP_HEADERS.length
    )
    .clearContent();

  if (keepRows.length) {
    sheet
      .getRange(
        2,
        1,
        keepRows.length,
        APP.BACKUP_HEADERS.length
      )
      .setValues(keepRows);
  }
}


/* =====================================================================
 * TEST & DIAGNOSTIK
 * ===================================================================== */

function tesKoneksiWuzapi() {
  const result = wuzapiRequest_(
    '/session/status',
    'get',
    null
  );

  const health = checkSessionHealth_();
  const ss = getSpreadsheet_();

  if (ss) {
    ss.toast(
      'WuzAPI HTTP ' +
      result.httpCode +
      ' | Session: ' +
      (health.ok ? 'SIAP' : 'TIDAK SIAP') +
      ' | ' +
      health.detail,
      APP.NAME,
      10
    );
  }

  return result.json || result.responseText;
}


function tesKirimBarisTerpilih() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'Spreadsheet aktif tidak ditemukan.'
    );
  }

  const sheet = ss.getActiveSheet();

  if (sheet.getName() !== APP.SHEET_NOTIF) {
    throw new Error(
      'Pilih salah satu baris pada sheet ' +
      APP.SHEET_NOTIF +
      '.'
    );
  }

  const rowNumber = sheet
    .getActiveRange()
    .getRow();

  if (rowNumber < 2) {
    throw new Error(
      'Pilih baris data, bukan header.'
    );
  }

  ensureScheduleDefaults_(
    sheet,
    rowNumber
  );

  const row = sheet
    .getRange(
      rowNumber,
      1,
      1,
      APP.NOTIF_HEADERS.length
    )
    .getValues()[0];

  const timezone = getTimezone_();
  const now = new Date();

  const snapshot = buildScheduleSnapshot_(
    row,
    rowNumber,
    getHariIndonesia_(now, timezone),
    Utilities.formatDate(now, timezone, 'HH:mm')
  );

  // Test tidak mengubah statistik Jadwal Berhasil/Gagal,
  // tetapi F tetap bertambah karena pesan benar-benar terkirim.
  executeScheduleSnapshot_(snapshot, {
    dedupKey:
      'TEST|' +
      Utilities.formatDate(
        now,
        timezone,
        'yyyyMMddHHmmss'
      ),
    attemptLabel: 'TEST',
    test: true,
    force: true
  });

  updateScheduleStatusByRow_(
    sheet,
    rowNumber,
    'TEST BERHASIL',
    new Date()
  );

  ss.toast(
    'Tes baris ' +
    rowNumber +
    ' berhasil dikirim.',
    APP.NAME,
    7
  );
}


function cekKonfigurasi() {
  const props = PropertiesService.getScriptProperties();
  const problems = [];

  const baseUrl = String(
    props.getProperty('WUZAPI_URL') || ''
  );

  const token = String(
    props.getProperty('WUZAPI_TOKEN') || ''
  );

  if (
    !baseUrl ||
    /domainanda/i.test(baseUrl)
  ) {
    problems.push('WUZAPI_URL');
  }

  if (
    !token ||
    /ISI_TOKEN/i.test(token)
  ) {
    problems.push('WUZAPI_TOKEN');
  }

  try {
    resolveTargets_('DEFAULT');
  } catch (_) {
    problems.push('PENERIMA_WA');
  }

  const ss = getSpreadsheet_();

  if (problems.length) {
    const text =
      'Belum valid: ' +
      problems.join(', ');

    if (ss) {
      ss.toast(
        text,
        APP.NAME,
        10
      );
    }

    throw new Error(text);
  }

  const health = propertyBool_(
    'SESSION_HEALTHCHECK',
    true
  )
    ? checkSessionHealth_()
    : {
        ok: true,
        detail: 'health check disabled'
      };

  const result = {
    WUZAPI_URL: baseUrl,
    TIMEZONE: getTimezone_(),
    DEFAULT_GROUP_CODE:
      props.getProperty('DEFAULT_GROUP_CODE'),
    SESSION: health,
    SESSION_HEALTHCHECK_MODE:
      String(props.getProperty('SESSION_HEALTHCHECK_MODE') || 'SOFT').toUpperCase(),
    SCHEDULE_CATCHUP_MINUTES:
      propertyInt_('SCHEDULE_CATCHUP_MINUTES', 120, 0),
    VERSION: APP.VERSION
  };

  if (ss) {
    ss.toast(
      'Konfigurasi utama valid. Session: ' +
      (health.ok ? 'SIAP' : 'TIDAK SIAP'),
      APP.NAME,
      8
    );
  }

  return result;
}


/* =====================================================================
 * LOG
 * ===================================================================== */

function logKirim_(data) {
  try {
    if (!propertyBool_('ENABLE_LOG', true)) {
      return;
    }

    const ss = getSpreadsheet_();

    if (!ss) {
      return;
    }

    let sheet = ss.getSheetByName(APP.SHEET_LOG);

    if (!sheet) {
      ensureLogSheet_(ss);
      sheet = ss.getSheetByName(APP.SHEET_LOG);
    }

    let response = String(
      data.response || ''
    );

    if (response.length > 3000) {
      response =
        response.substring(0, 3000);
    }

    sheet.appendRow([
      Utilities.formatDate(
        new Date(),
        getTimezone_(),
        'yyyy-MM-dd HH:mm:ss'
      ),
      data.scheduleId || '',
      data.row || '',
      data.hari || '',
      data.jam || '',
      data.group || '',
      data.tipe || '',
      data.bagian || '',
      data.percobaan || '',
      data.pesan || '',
      data.media || '',
      data.status || '',
      data.http || '',
      data.messageId || '',
      response
    ]);

  } catch (err) {
    console.error(
      'Gagal menulis LOG_KIRIM:',
      err
    );
  }
}


function extractMessageId_(json) {
  try {
    if (!json) {
      return '';
    }

    if (
      json.data &&
      json.data.Id
    ) {
      return String(json.data.Id);
    }

    if (
      json.data &&
      json.data.ID
    ) {
      return String(json.data.ID);
    }

    if (json.Id) {
      return String(json.Id);
    }

    return '';
  } catch (_) {
    return '';
  }
}


/* =====================================================================
 * DATE / PERIOD / DAY
 * ===================================================================== */

function isDateWithinPeriod_(
  currentIso,
  startValue,
  endValue,
  timezone
) {
  const start = dateValueToIso_(
    startValue,
    timezone
  );

  const end = dateValueToIso_(
    endValue,
    timezone
  );

  if (
    start &&
    currentIso < start
  ) {
    return false;
  }

  if (
    end &&
    currentIso > end
  ) {
    return false;
  }

  return true;
}


function dateValueToIso_(value, timezone) {
  timezone = timezone || getTimezone_();

  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return '';
  }

  if (
    Object.prototype.toString.call(value) ===
    '[object Date]'
  ) {
    if (isNaN(value.getTime())) {
      return '';
    }

    return Utilities.formatDate(
      value,
      timezone,
      'yyyy-MM-dd'
    );
  }

  const text = String(value).trim();

  if (!text) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  let m = text.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/
  );

  if (m) {
    return (
      m[3] +
      '-' +
      String(m[2]).padStart(2, '0') +
      '-' +
      String(m[1]).padStart(2, '0')
    );
  }

  const parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(
      parsed,
      timezone,
      'yyyy-MM-dd'
    );
  }

  return '';
}


function getHariIndonesia_(date, timezone) {
  const english = Utilities.formatDate(
    date,
    timezone,
    'EEE'
  );

  const map = {
    Sun: 'Minggu',
    Mon: 'Senin',
    Tue: 'Selasa',
    Wed: 'Rabu',
    Thu: 'Kamis',
    Fri: 'Jumat',
    Sat: 'Sabtu'
  };

  return map[english] || english;
}


function hariCocok_(value, currentDay) {
  let text = String(value || '')
    .trim()
    .toLowerCase();

  if (!text) {
    return false;
  }

  const day = String(currentDay || '')
    .toLowerCase();

  const compact = text.replace(/\s+/g, '');

  if (
    compact === 'senin-jumat' ||
    compact === 'senins/djumat' ||
    compact === 'weekday'
  ) {
    return [
      'senin',
      'selasa',
      'rabu',
      'kamis',
      'jumat'
    ].includes(day);
  }

  if (
    compact === 'senin-kamis' ||
    compact === 'senins/dkamis'
  ) {
    return [
      'senin',
      'selasa',
      'rabu',
      'kamis'
    ].includes(day);
  }

  if (
    compact === 'setiaphari' ||
    compact === 'semuahari' ||
    compact === 'everyday'
  ) {
    return true;
  }

  return text
    .split(/[,;|]+/)
    .map(function(item) {
      return item.trim();
    })
    .filter(Boolean)
    .includes(day);
}


function nilaiJamKeMenit_(value, timezone) {
  if (
    Object.prototype.toString.call(value) ===
    '[object Date]'
  ) {
    if (isNaN(value.getTime())) {
      return null;
    }

    return jamStringKeMenit_(
      Utilities.formatDate(
        value,
        timezone,
        'HH:mm'
      )
    );
  }

  if (
    typeof value === 'number' &&
    isFinite(value)
  ) {
    const fraction =
      ((value % 1) + 1) % 1;

    return Math.round(
      fraction * 24 * 60
    ) % 1440;
  }

  return jamStringKeMenit_(
    String(value || '')
  );
}


function jamStringKeMenit_(jam) {
  const text = String(
    jam || ''
  ).trim();

  const match = text.match(
    /^(\d{1,2})[:.](\d{1,2})$/
  );

  if (!match) {
    return null;
  }

  const hour = parseInt(
    match[1],
    10
  );

  const minute = parseInt(
    match[2],
    10
  );

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}


function menitKeJam_(totalMinutes) {
  const hour = Math.floor(
    totalMinutes / 60
  );

  const minute =
    totalMinutes % 60;

  return (
    String(hour).padStart(2, '0') +
    ':' +
    String(minute).padStart(2, '0')
  );
}


/* =====================================================================
 * UTILITIES
 * ===================================================================== */

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (_) {}
  }

  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (_) {
    return null;
  }
}


function getTimezone_() {
  return (
    PropertiesService
      .getScriptProperties()
      .getProperty('TIMEZONE') ||
    APP.TIMEZONE
  );
}


function ensureSheetSize_(sheet, minRows, minCols) {
  if (sheet.getMaxRows() < minRows) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      minRows - sheet.getMaxRows()
    );
  }

  if (sheet.getMaxColumns() < minCols) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      minCols - sheet.getMaxColumns()
    );
  }
}


function isAktif_(value) {
  if (value === true) {
    return true;
  }

  const text = String(value || '')
    .trim()
    .toLowerCase();

  return [
    'true',
    'ya',
    'yes',
    '1',
    'aktif'
  ].includes(text);
}


function boolCell_(value) {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  const text = String(value || '')
    .trim()
    .toLowerCase();

  return [
    'true',
    'ya',
    'yes',
    '1',
    'aktif',
    'y'
  ].includes(text);
}


function propertyBool_(key, defaultValue) {
  const raw = PropertiesService
    .getScriptProperties()
    .getProperty(key);

  if (
    raw === null ||
    raw === undefined ||
    raw === ''
  ) {
    return defaultValue === true;
  }

  return boolCell_(raw);
}


function propertyInt_(key, defaultValue, minValue) {
  const raw = PropertiesService
    .getScriptProperties()
    .getProperty(key);

  let value = parseInt(raw, 10);

  if (isNaN(value)) {
    value = Number(defaultValue) || 0;
  }

  if (
    minValue !== undefined &&
    value < minValue
  ) {
    value = minValue;
  }

  return value;
}


function safeNumber_(value, fallback) {
  const n = Number(value);

  return isFinite(n)
    ? n
    : Number(fallback || 0);
}


function newScheduleId_() {
  return (
    'SCH-' +
    Utilities
      .getUuid()
      .replace(/-/g, '')
      .substring(0, 20)
      .toUpperCase()
  );
}


function newQueueId_() {
  return (
    'Q-' +
    Utilities
      .getUuid()
      .replace(/-/g, '')
      .substring(0, 20)
      .toUpperCase()
  );
}


function compactKey_(text) {
  return String(text || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .substring(0, 48);
}


function shortHash_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    String(text || ''),
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(function(b) {
      const n =
        b < 0
          ? b + 256
          : b;

      return (
        '0' +
        n.toString(16)
      ).slice(-2);
    })
    .join('')
    .substring(0, 12)
    .toUpperCase();
}


function deterministicMessageId_(
  scheduleId,
  dedupKey,
  groupJid,
  part
) {
  const seed = [
    scheduleId,
    dedupKey,
    groupJid,
    part
  ].join('|');

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    seed,
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(function(b) {
      const n =
        b < 0
          ? b + 256
          : b;

      return (
        '0' +
        n.toString(16)
      ).slice(-2);
    })
    .join('')
    .substring(0, 32)
    .toUpperCase();
}


function unique_(arr) {
  const seen = {};

  return (arr || []).filter(function(v) {
    const key = String(v || '');

    if (!key || seen[key]) {
      return false;
    }

    seen[key] = true;
    return true;
  });
}


function replaceAllInsensitive_(text, find, replacement) {
  const escaped = String(find)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return String(text).replace(
    new RegExp(escaped, 'gi'),
    String(replacement)
  );
}


function asDate_(value) {
  if (
    Object.prototype.toString.call(value) ===
    '[object Date]'
  ) {
    return isNaN(value.getTime())
      ? null
      : value;
  }

  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const date = new Date(value);

  return isNaN(date.getTime())
    ? null
    : date;
}


function isElapsedDays_(isoString, days) {
  if (!isoString) {
    return true;
  }

  const date = new Date(isoString);

  if (isNaN(date.getTime())) {
    return true;
  }

  const elapsed =
    Date.now() -
    date.getTime();

  return elapsed >=
    Number(days || 1) *
    24 *
    60 *
    60 *
    1000;
}


function ambilErrorSingkat_(err) {
  const text = String(
    (err && err.message) ||
    err ||
    'Unknown error'
  );

  return text.length > 240
    ? text.substring(0, 240) + '...'
    : text;
}
