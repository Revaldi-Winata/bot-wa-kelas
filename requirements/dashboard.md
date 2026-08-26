# Web Admin Dashboard Specification
## Single-Pane-of-Glass Management Interface

---

## 1. Overview & Security Architecture

Dashboard Web Admin adalah portal manajemen terpusat khusus untuk Ketua Kelas.

```
┌──────────────────────────────────────────────────────────────┐
│                    WEB ADMIN DASHBOARD                       │
│                                                              │
│  [Overview] [Jadwal] [Dosen & Matkul] [Tugas] [GDrive] [Log] │
└──────────────────────────────┬───────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────┐             ┌───────────────────────┐
│     REST API Core     │             │ WhatsApp State Bridge │
│ - JWT Session Guard   │             │ - Web QR Code Stream  │
│ - CRUD Endpoints      │             │ - Socket Reconnect    │
│ - Regex Generator     │             │ - Force Whitelist Sync│
└───────────────────────┘             └───────────────────────┘
```

* **Authentication**: Single fixed credential (Username & BCrypt Password di environment/DB).
* **Session**: HTTP-Only Secure Cookie berisi JWT bertanda tangan dengan masa berlaku 7 hari.
* **Brute-Force Shield**: IP diblokir selama 15 menit setelah 5x gagal login berturut-turut.
* **Responsive Design**: Wajib dapat dioperasikan secara optimal melalui browser smartphone.

---

## 2. Dashboard Modules & Specifications

### 2.1. Module 1: Dashboard Overview & WhatsApp Telemetry (Home)
* **Live Connection Widget**:
  * Status Badge: `CONNECTED` (Hijau), `CONNECTING` (Kuning), `DISCONNECTED` (Abu-abu), `QR_REQUIRED` (Merah/Biru).
* **Web-Based QR Pairing Panel**:
  * Jika socket dalam kondisi membutuhkan login/re-pairing, panel menampilkan QR code Baileys secara live di browser.
  * Auto-refresh QR code setiap 30 detik.
* **Telemetry Counters**:
  * Total Tugas Aktif & Tugas Mendekati Deadline (< 3 Hari).
  * Total Mata Kuliah & Total Sesi Jadwal Aktif.
  * Total Member Whitelist Terdaftar.
* **Quick Actions**:
  * Tombol *Restart WhatsApp Socket*.
  * Tombol *Force Sync Whitelist Members*.
  * Tombol *Logout Session*.

---

### 2.2. Module 2: Manajemen Jadwal Kuliah (Schedule Module)
* **Table View**: Tampilan jadwal per hari (Senin s.d. Sabtu) dengan quick search dan sorting jam mulai.
* **Form Dialog (Add / Edit)**:
  * Dropdown Mata Kuliah (Relasi ke tabel `subjects`).
  * Dropdown Dosen Pengampu (Relasi ke tabel `lecturers`).
  * Pilihan Hari: `Senin`, `Selasa`, `Rabu`, `Kamis`, `Jumat`, `Sabtu`.
  * Jam Mulai & Jam Selesai: Time input `HH:mm` (e.g. `07:30 - 10:00`).
  * Ruangan / Link Daring: Text input (e.g. `V.401` / link Zoom).
  * Status Perkuliahan: Radio/Toggle `NORMAL`, `LIBUR`, `PENGGANTI`.
  * Catatan Status: Textarea pengumuman (e.g. "Dosen dinas luar, diganti hari Kamis").

---

### 2.3. Module 3: Manajemen Dosen & Mata Kuliah (Subject & Lecturer Module)
* **Kelola Dosen**:
  * Nama Lengkap + Gelar Akademik.
  * Nomor WhatsApp: Input sanitasi otomatis (mengubah `0812...` menjadi `62812...`).
  * Email Resmi: Input text dengan validasi format email.
  * Ruang Kantor & Catatan Tambahan.
* **Kelola Mata Kuliah**:
  * Kode Mata Kuliah (e.g. `TPL0025`).
  * Nama Mata Kuliah (e.g. `Basis Data`).
  * Bobot SKS (Number input 1 - 6).
  * Dosen Pengampu Utama (Dropdown).
  * Pemetaan WhatsApp Group JID khusus mata kuliah tersebut.

---

### 2.4. Module 4: Manajemen Tugas & Milestone Reminder (Assignment Module)
* **Tabbed View**: `Tugas Aktif`, `Mendekati Deadline (< 48 Jam)`, `Arsip Selesai`.
* **Form Dialog (Add / Edit)**:
  * Mata Kuliah (Dropdown).
  * Nomor Pertemuan: Integer 1 s.d. 16 (digunakan untuk auto-traversal folder GDrive).
  * Judul Tugas: Text input.
  * Deskripsi Instruksi: Markdown / Rich text editor.
  * Datetime Deadline: Datetime picker `YYYY-MM-DD HH:mm` (WIB).
  * Link Folder Pengumpulan: URL Google Drive.
  * Toggle Pengingat Otomatis:
    * `[x] Broadcast H-3 (08:00 WIB)`
    * `[x] Broadcast H-2 (08:00 WIB)`
    * `[x] Broadcast H-1 (08:00 & 18:00 WIB)`
    * `[x] Broadcast Hari-H (07:00 & H-4 Jam)`
* **Instant Manual Broadcast**:
  * Tombol untuk mengirimkan notifikasi tugas langsung ke Grup Kelas / Grup Matkul saat itu juga.

---

### 2.5. Module 5: Google Drive Validator Studio (GDrive Module)
* **Root Folder Configuration**:
  * Input `Root Folder ID` Google Drive (e.g. `1AbCdEfGhIjKlMnOp...`).
  * Tombol *Test Service Account Access* (mengecek koneksi dan izin baca Service Account ke folder).
* **Visual Dynamic Regex Builder**:
  * Pola Penamaan Baku: `[NAMA]_[NIM]_[EXTRA].[EXT]` (ADR D10).
  * Checkbox Ekstensi yang Diizinkan:
    * `[x] .pdf` | `[x] .zip` | `[x] .rar` | `[x] .docx` | `[ ] .ipynb` | `[ ] .sql`
  * *Live Generated Regex Preview*: Menampilkan regex aktif (e.g. `^([A-Za-z\s]+)_([0-9]{8,12})(?:_.*)?\.(pdf|zip|rar|docx)$`).
  * *Interactive Pattern Tester*: Kotak uji coba di mana admin memasukkan sampel nama file dan menerima indikator visual instan:
    * Hijau: *Format Valid* (Menampilkan hasil parsing Nama: `Ahmad Fauzi`, NIM: `2021804001`).
    * Merah: *Format Invalid* (Menampilkan alasan kesalahan: format NIM tidak sesuai / ekstensi ditolak).

---

### 2.6. Module 6: Channel & Group Mapping Manager (WhatsApp Settings)
* **Detected WhatsApp Groups**: Menampilkan seluruh grup yang dimasuki oleh nomor bot.
* **Role Configuration**:
  * Radio button untuk memilih 1 grup sebagai **Grup Utama Kelas** (Sumber whitelist DM).
  * Dropdown untuk memetakan grup-grup lainnya ke **Mata Kuliah Spesifik** (Target silent reminder).
* **Whitelist Member Viewer**:
  * Tabel data seluruh anggota kelas ter-whitelist (Nomor HP, Display Name, Waktu sinkronisasi).

---

### 2.7. Module 7: System Audit & Real-Time Log Viewer
* **Filterable Log Viewer**:
  * Filter level: `ALL`, `INFO`, `WARN`, `ERROR`.
  * Filter kategori: `WHATSAPP`, `AUTH`, `SCHEDULER`, `GDRIVE`.
* **Live Feed**: Menampilkan aktivitas masuk pesan WhatsApp, broadcast scheduler, dan stack trace error.
