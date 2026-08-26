# Software Requirements Specification (SRS)
## Bot WhatsApp Informasi Kelas & Dashboard Manajemen

---

## 1. Executive Summary

Sistem Bot WhatsApp Kelas dirancang sebagai asisten informasi akademik terpusat untuk mahasiswa melalui WhatsApp (Grup Utama & DM) serta sistem notifikasi otomatis di grup mata kuliah. 

Sistem beroperasi dengan prinsip **Single Source of Truth** di mana seluruh data jadwal, kontak dosen, tugas, dan konfigurasi Google Drive dikelola secara eksklusif oleh Ketua Kelas melalui **Web Admin Dashboard**. Interaksi WhatsApp disederhanakan menggunakan **Numbered State Machine Menu** yang konsisten, deterministik, dan bebas ambiguitas.

---

## 2. Scope & Behavior Boundaries

### A. Channel Scope Matrix

| Channel | Interactive Menu (`/menu`) | Scheduler Reminder | Otorisasi Akses |
| :--- | :---: | :---: | :--- |
| **Grup Utama Kelas** | ✅ Aktif | ✅ Aktif (Semua Matkul) | Terbuka untuk seluruh member grup |
| **Direct Message (DM)** | ✅ Aktif | ❌ Tidak Aktif | **Strict Whitelist**: Hanya nomor yang terdaftar sebagai anggota Grup Utama Kelas |
| **Grup Mata Kuliah** | ❌ **Silent / Non-aktif** (Abaikan command) | ✅ Aktif (Khusus Matkul terkait) | Hanya menerima broadcast pengingat otomatis |
| **Grup / Nomor Asing** | ❌ Non-aktif | ❌ Non-aktif | Diabaikan sepenuhnya (Silent drop) |

### B. In-Scope Features
* **Core Academic Info**: Jadwal Kuliah, Kontak Dosen, List Tugas & Deadline.
* **Automated Milestone Reminder**: Pengingat deadline H-3, H-2, H-1, dan Hari-H (H-0).
* **GDrive Hierarchy Validator**: Inspeksi kesesuaian penamaan file tugas pada folder Google Drive kelas (`[NAMA]_[NIM]_[EXTRA].[EXT]`).
* **Dynamic Whitelist DM**: Sinkronisasi otomatis nomor anggota dari Grup Utama Kelas tanpa input manual.
* **Web Admin Dashboard**: Antarmuka lengkap pengelolaan entitas, pemantauan koneksi bot, QR code pairing, dan visual regex builder.
* **Enterprise-Grade Resilience**: Security rate limiting, persistent state backup, dan fault-tolerant error handling.

### C. Out-of-Scope Features (ADR D01 & D02)
* Scraping portal akademik kampus.
* Modul Pra-UAPS / UAPS / Skripsi, TOEFL, dan UJIKOM.
* Interactive Native WhatsApp Buttons & Inline Command Parameter.

---

## 3. Actor & Permissions

| Role | Interface | Hak Akses |
| :--- | :--- | :--- |
| **Mahasiswa Terdaftar** | WhatsApp (Grup Kelas / DM) | Akses menu navigasi bernomor, cek jadwal, kontak, tugas, dan status pengumpulan GDrive. |
| **Ketua Kelas (Admin)** | Web Dashboard | Full access (CRUD) seluruh data kelas, pairing WhatsApp QR, monitoring log, trigger backup, dan konfigurasi validator. |
| **User Luar / Non-Member** | WhatsApp DM / Luar Grup | Ditolak otomatis oleh sistem security filter. |

---

## 4. Functional Requirements (FR)

### FR-01: Navigasi Menu Tunggal (Strict Numbered Menu)
* **FR-01.1: Trigger**: Pengguna memicu bot hanya dengan mengetik `/menu` atau `menu`.
* **FR-01.2: State Machine**:
  * Pengguna memilih opsi hanya dengan mengirimkan angka (`1`, `2`, `3`, `4`).
  * Angka `0` digunakan untuk kembali ke Menu Utama / Batal.
  * Sistem tidak menyediakan inline command berparameter (menghilangkan kebingungan input ganda).
* **FR-01.3: Timeout Session**: Sesi state navigasi pengguna di-reset otomatis jika tidak ada input balasan dalam 3 menit.

### FR-02: Modul Informasi Akademik (WhatsApp)
* **FR-02.1: Jadwal Kuliah**:
  * Menu `1` -> Menampilkan pilihan hari (`1. Senin` s.d. `6. Sabtu`, `7. Semua Hari`).
  * Output: Mata Kuliah, Waktu (Mulai - Selesai), Ruangan/Link, Dosen Pengampu, Status (Aktif/Libur/Pengganti).
* **FR-02.2: Kontak Dosen**:
  * Menu `2` -> Menampilkan daftar mata kuliah bernomor.
  * Output: Nama Lengkap & Gelar Dosen, Nomor WhatsApp (tautan `wa.me`), Email, dan Catatan Ruangan.
* **FR-02.3: Daftar Tugas & Deadline**:
  * Menu `3` -> Menampilkan list tugas aktif yang diurutkan berdasarkan deadline terdekat.
  * Output: Judul Tugas, Mata Kuliah, Deskripsi, Batas Waktu, dan Tautan Folder Pengumpulan.

### FR-03: Automated Milestone Reminder (Scheduler Engine)
* **FR-03.1: Cadence**: Engine scheduler internal mengecek deadline tugas aktif secara periodik dan memicu broadcast otomatis pada:
  * **H-3**: Pukul 08:00 WIB (Pemberitahuan awal tugas).
  * **H-2**: Pukul 08:00 WIB (Pengingat pengerjaan).
  * **H-1**: Pukul 08:00 WIB & 18:00 WIB (Peringatan deadline besok).
  * **H-0 (Hari-H)**: Pukul 07:00 WIB & 4 jam sebelum jam deadline (Peringatan darurat pengumpulan).
* **FR-03.2: Routing Target**:
  * Broadcast umum dikirimkan ke **Grup Utama Kelas**.
  * Broadcast spesifik mata kuliah dikirimkan ke **Grup Mata Kuliah** terkait (jika dikonfigurasi).

### FR-04: Google Drive Task Submission Validator
* **FR-04.1: Hierarki Folder GDrive**:
  Sistem membaca struktur folder Google Drive terpusat yang dibuat oleh Ketua Kelas:
  ```
  📁 [Root Folder Kelas: misal 07TPLP025]  <-- Shared ke Service Account (Viewer)
     ├── 📁 Basis Data
     │     ├── 📁 Pertemuan 01
     │     │     └── 📁 Tugas 1
     │     │           ├── 📄 Ahmad Fauzi_2021804001_Tugas Mandiri.pdf (VALID)
     │     │           ├── 📄 Budi Santoso_2021804002.zip             (VALID)
     │     │           └── 📄 tugas_akhir_revisi.docx                  (INVALID)
     │     └── 📁 Pertemuan 02
     └── 📁 Pemrograman Web
  ```
* **FR-04.2: Standard File Naming Convention (ADR D10)**:
  * Pola penamaan baku: `[NAMA]_[NIM]_[EXTRA].[EXT]`
  * Segmen `[EXTRA]` bersifat **wildcard opsional** (diabaikan validator, bebas diisi judul/keterangan tambahan oleh mahasiswa).
  * Regex Kompilasi: `^([A-Za-z\s]+)_([0-9]{8,12})(?:_.*)?\.(pdf|zip|rar|docx)$` (case-insensitive).
* **FR-04.3: Dynamic Traversal**: Bot secara rekursif membaca folder tugas berdasarkan mata kuliah dan pertemuan yang dipilih pada Menu `4`.
* **FR-04.4: Laporan Validasi**: Menyajikan ringkasan:
  * Total file terupload.
  * Daftar mahasiswa terverifikasi (`[NAMA]` & `[NIM]` hasil ekstraksi).
  * Daftar file **INVALID** yang tidak sesuai format atau salah ekstensi untuk diminta upload ulang.

### FR-05: Dynamic DM Whitelist Synchronization (Security Filter)
* **FR-05.1**: Bot secara otomatis mengambil daftar nomor telepon (JID) seluruh peserta dari Grup Utama Kelas via `sock.groupMetadata()`.
* **FR-05.2**: Cache daftar anggota diperbarui setiap kali ada event member masuk/keluar grup (`group-participants.update`) atau saat bot startup.
* **FR-05.3**: Pesan DM dari nomor yang tidak terdaftar pada cache anggota grup kelas akan diabaikan (silent drop) tanpa memproses state bot.

---

### FR-06: Spesifikasi Web Admin Dashboard

#### FR-06.1: Authentication & Session Management
* **Credentials**: Login berbasis Single Fixed Credential (Username & Password terenkripsi bcrypt di environment).
* **Session**: JWT berekspirasi 7 hari disimpan dalam HTTP-only SameSite Secure Cookie.
* **Brute-Force Lockout**: IP diblokir otomatis setelah 5 kegagalan login berturut-turut selama 15 menit.

#### FR-06.2: System Overview & WhatsApp Telemetry (Dashboard Home)
* **Live Status**: Indikator real-time socket WhatsApp (`CONNECTED`, `CONNECTING`, `DISCONNECTED`, `QR_REQUIRED`).
* **Web-Based QR Pairing**: Render QR Code interaktif langsung di browser untuk initial login / re-auth tanpa akses terminal server.
* **Action Center**: Tombol *Restart Socket*, *Logout Session*, dan *Force Sync Whitelist*.
* **Quick Stats**: Total Mata Kuliah, Tugas Aktif, Hitung Mundur Deadline Terdekat, dan Jumlah Member Whitelist.

#### FR-06.3: Manajemen Jadwal Kuliah (Schedule Module)
* **CRUD Jadwal**: Form input Mata Kuliah, Dosen, Hari (`Senin` - `Sabtu`), Jam Mulai/Selesai, Ruang/Link Kelas Daring.
* **Status Perkuliahan**: Toggle status per sesi (`Normal`, `Ditiadakan/Libur`, `Kuliah Pengganti`) beserta input catatan pengumuman.

#### FR-06.4: Manajemen Kontak Dosen & Mata Kuliah (Subject & Lecturer Module)
* **Mata Kuliah**: Kode Matkul, Nama Matkul, SKS, dan WhatsApp Group JID (mapping grup khusus matkul).
* **Dosen**: Nama Lengkap & Gelar, Nomor WhatsApp (auto-formatter `62...`), Email, Ruang Kerja, dan Catatan.

#### FR-06.5: Manajemen Tugas & Milestone Reminder (Assignment Module)
* **CRUD Tugas**: Mata Kuliah, Nomor Pertemuan (1-16), Judul, Deskripsi Markdown, Datetime Deadline, dan Tautan GDrive.
* **Milestone Toggles**: Checkbox on/off pengingat otomatis `H-3`, `H-2`, `H-1`, dan `H-0`.
* **Manual Broadcast**: Tombol instan untuk mengirimkan pesan pengumuman tugas ke grup saat itu juga.

#### FR-06.6: Google Drive Validator Studio (GDrive Module)
* **Root Folder Config**: Input Root Folder ID + Tombol *Test Service Account Access*.
* **Naming Template Config**:
  * Pilihan Format: Standar `[NAMA]_[NIM]_[EXTRA].[EXT]` (Default) atau Kustom.
  * Checkbox Ekstensi: `.pdf`, `.zip`, `.rar`, `.docx`, `.ipynb`, `.sql`, `.xlsx`.
  * *Live Regex Preview*: Menampilkan regex aktif.
  * *Interactive Pattern Tester*: Input text visual untuk menguji contoh nama file dengan validasi instan (Hijau = Valid / Merah = Invalid).

#### FR-06.7: Channel & Group Mapping Manager (WhatsApp Settings)
* **Group Detector**: Deteksi otomatis seluruh grup WhatsApp yang diikuti bot.
* **Role Assignment**: Menetapkan 1 Grup Utama Kelas dan memetakan grup-grup mata kuliah.
* **Whitelist Viewer**: Tabel daftar nomor HP dan display name anggota kelas hasil sinkronisasi grup.

#### FR-06.8: System Audit & Activity Logs
* **Live Event Stream**: Log aktivitas real-time pesan masuk, eksekusi command, trigger broadcast reminder, dan error stack trace.

---

## 5. Security, Backup & Error Handling Specifications

### A. Security Architecture

1. **Anti-Spam & Anti-Ban Rate Limiting**:
   * Rate Limit WhatsApp per JID: Maksimal 5 permintaan / 30 detik per pengguna. Permintaan berlebih diabaikan (throttling).
   * Random Delay Jitter: Bot menyisipkan delay buatan (1.000ms – 2.500ms) sebelum mengirim balasan pesan untuk meniru pola manusia dan mencegah deteksi bot agresif oleh Meta.
2. **Credential & Secret Protection**:
   * Kredensial Google Service Account (`service_account.json`), secret key JWT, dan password admin disimpan strictly pada Environment Variables (`.env`).
   * Service Account Google Cloud hanya diberikan hak akses **Viewer** (Read-Only) pada folder Google Drive.
3. **Inbound Input Sanitization**:
   * Seluruh pesan teks masuk disanitasi dari karakter non-printable dan escape sequence untuk mencegah injection attack pada query DB atau regex engine (ReDoS protection).

---

### B. Backup & Disaster Recovery (DR)

1. **Persistent WhatsApp Session**:
   * Folder state autentikasi Baileys (`auth_info_baileys`) disimpan pada persistent storage volume / mount path.
   * Auto-snapshot credential session secara periodik ke file terenkripsi lokal untuk mencegah QR login berulang saat restart container.
2. **Database Backup Strategy**:
   * **Automated Daily Snapshot**: Sistem mengekspor snapshot database (SQLite/Turso dump) setiap pukul 02:00 WIB.
   * **Off-site Cloud Storage**: File snapshot di-upload otomatis ke folder khusus `_Backup_Database` di Google Drive menggunakan Service Account yang sama.
3. **Disaster Recovery Target**:
   * **RTO (Recovery Time Objective)**: < 5 menit untuk fresh deployment container baru.
   * **RPO (Recovery Point Objective)**: < 24 jam kehilangan data jika terjadi kegagalan infrastruktur total.

---

### C. Error Handling & Fault Tolerance

```text
┌───────────────────────────────┐
│     Incoming Error Event      │
└──────────────┬────────────────┘
               │
   ┌───────────┴───────────┬──────────────────────┬────────────────────┐
   ▼                       ▼                      ▼                    ▼
[Socket Drop]      [WhatsApp Ban/401]    [GDrive Quota/Down]    [Fatal Exception]
   │                       │                      │                    │
   ▼                       ▼                      ▼                    ▼
Auto-Reconnect      Emit QR_REQUIRED       Circuit Breaker      Uncaught Trap
Exponential         Update Dashboard UI    Stale Cache Fallback Log to DB
Backoff (2s..30s)   Alert Admin via SMS    Graceful WA Msg      Restart Worker
```

1. **Socket Connection Resilience**:
   * Deteksi pemutusan koneksi socket (`connection.update` status `close`).
   * Algoritma **Exponential Backoff**: Reconnect otomatis dengan interval 2 detik, 4 detik, 8 detik, hingga batas atas 30 detik.
2. **Session Invalidation (401 / Logout)**:
   * Jika socket mengembalikan status `loggedOut` / 401:
     * Sistem menghapus cache session korup.
     * Mengubah status dashboard menjadi `QR_REQUIRED`.
     * Mengirimkan notifikasi darurat ke nomor WhatsApp Ketua Kelas.
3. **Google Drive API Fault Tolerance**:
   * Error `429 (Rate Limit)` atau `500 (Internal Error)`: Menjalankan retry 3x dengan backoff.
   * Folder Tidak Ditemukan (`404`): Mengembalikan pesan ramah di WhatsApp: *"Folder pengumpulan belum dibuat atau izin akses belum diberikan. Hubungi Ketua Kelas."*
4. **Graceful User-Facing Failures**:
   * Seluruh kegagalan sistem internal ditangkap (try-catch) pada level router.
   * Pengguna WhatsApp menerima pesan sopan: *"⚠️ Maaf, terjadi gangguan sementara pada sistem. Silakan coba beberapa saat lagi."* alih-alih bot diam (silent hang).
5. **Process Safety**:
   * Handler global `process.on('uncaughtException')` dan `process.on('unhandledRejection')` mencatat error stack ke log DB/file dan mencegah Node.js crash seketika.

---

## 6. Non-Functional Requirements (NFR)

* **NFR-01: Low Memory Footprint**: Memory usage bot runtime < 90MB RAM.
* **NFR-02: Zero Manual Whitelist Overhead**: Dynamic group sync via `sock.groupMetadata()`.
* **NFR-03: Zero Cloud Cost**: Beroperasi penuh di atas free-tier hosting & database.
* **NFR-04: Resilience & Persistent Session**: Sesi WhatsApp tersimpan permanen; auto-recovery.
* **NFR-05: Mobile Dashboard**: Dashboard responsif dan mudah diakses via smartphone Ketua Kelas.

---

## 7. Flowchart Interaksi WhatsApp (State Machine)

```text
User kirim "/menu"
       │
       ▼
[Tampilkan Menu Utama]
 1. 📅 Jadwal Kuliah
 2. 👨‍🏫 Kontak Dosen
 3. 📝 Daftar Tugas Aktif
 4. 🔍 Cek Pengumpulan GDrive
       │
       ├── Input '1' ──► [Pilih Hari: 1.Senin, 2.Selasa ... 0.Kembali] ──► [Tampilkan Jadwal]
       ├── Input '2' ──► [Pilih Mata Kuliah: 1..N, 0.Kembali]          ──► [Tampilkan Kontak]
       ├── Input '3' ──► [Tampilkan List Tugas & Sisa Deadline]        ──► [Selesai]
       └── Input '4' ──► [Pilih Matkul -> Pilih Pertemuan]             ──► [Laporan GDrive]
```

---

## 8. Data Architecture & Schema Specification

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    Lecturer     │       │     Subject     │       │    Schedule     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │       │ id (PK)         │
│ name            │◄──────┤ lecturer_id(FK) │◄──────┤ subject_id(FK)  │
│ phone           │       │ code            │       │ day_of_week     │
│ email           │       │ name            │       │ start_time      │
│ notes           │       │ wa_group_jid    │       │ end_time        │
└─────────────────┘       └────────┬────────┘       │ room            │
                                   │                │ status          │
                                   │                │ status_note     │
                                   │                └─────────────────┘
                                   ▼
                          ┌─────────────────┐
                          │   Assignment    │
                          ├─────────────────┤
                          │ id (PK)         │
                          │ subject_id (FK) │
                          │ title           │
                          │ meeting_number  │
                          │ description     │
                          │ deadline        │
                          │ submission_url  │
                          │ allowed_exts    │
                          │ reminder_h3     │
                          │ reminder_h2     │
                          │ reminder_h1     │
                          │ reminder_h0     │
                          │ is_active       │
                          └─────────────────┘
```

---

## 9. Technology Stack Final

* **Runtime**: Node.js (v20+ LTS) / TypeScript.
* **WhatsApp Engine**: `@whiskeysockets/baileys` (Multi-Device socket).
* **Scheduler**: Internal in-memory lightweight cron (`node-cron`).
* **Google Integration**: `googleapis` (Drive API v3 via Service Account).
* **Database**: Turso (libSQL/SQLite Cloud) atau Supabase (PostgreSQL).
* **Dashboard Frontend & API**: Fastify / Hono Monolith + React (Vite) / Tailwind/Vanilla CSS.
* **Security & Utility**: `bcrypt`, `jsonwebtoken`, `zod` (runtime validator), `pino` (structured logger).
