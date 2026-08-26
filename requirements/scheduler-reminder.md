# Milestone Reminder & Scheduler Engine Specification
## Automated Cadence Task Broadcast System

---

## 1. Scheduler Architecture & Engine

Pengingat otomatis menggunakan engine in-memory lightweight **`node-cron`** yang terintegrasi di dalam runtime proses bot Node.js tanpa dependensi database eksternal seperti Redis.

```
┌──────────────────────────────────────────────────────────────┐
│                    NODE-CRON TICK WORKER                     │
│               (Evaluasi setiap 15 Menit)                     │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  QUERY ASSIGNMENTS FROM DB                   │
│          Ambil seluruh tugas dengan is_active = 1            │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  CALCULATE TIME DELTA (NOW)                  │
│                                                              │
│  - H-3 (72 jam s.d. 48 jam) -> Cek flag reminder_h3          │
│  - H-2 (48 jam s.d. 24 jam) -> Cek flag reminder_h2          │
│  - H-1 (24 jam s.d. 12 jam) -> Cek flag reminder_h1          │
│  - H-0 (Hari-H & < 4 jam)   -> Cek flag reminder_h0          │
└──────────────────────────────┬───────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────────────┐   ┌───────────────────────────┐
│     GRUP UTAMA KELAS          │   │    GRUP MATA KULIAH       │
│  Broadcast ringkasan tugas    │   │  Broadcast spesifik tugas │
│  seluruh mata kuliah          │   │  mata kuliah terkait      │
└───────────────────────────────┘   └───────────────────────────┘
```

---

## 2. Milestone Trigger Cadence & Schedule Matrix

| Milestone | Waktu Pengiriman | Target Broadcast | Pesan Fokus |
| :--- | :--- | :--- | :--- |
| **H-3** | 08:00 WIB | Grup Kelas & Grup Matkul | Pemberitahuan awal pengerjaan tugas & link pengumpulan. |
| **H-2** | 08:00 WIB | Grup Kelas & Grup Matkul | Pengingat progres tugas dan pengecekan format file. |
| **H-1** | 08:00 WIB & 18:00 WIB | Grup Kelas & Grup Matkul | Peringatan deadline besok, ajakan cek status pengumpulan GDrive. |
| **H-0 (Hari-H)** | 07:00 WIB & 4 Jam sebelum Deadline | Grup Kelas & Grup Matkul | **Peringatan Kritis / Darurat** batas akhir pengumpulan tugas. |

---

## 3. Deduplication & Idempotency Strategy

Untuk mencegah pengiriman pesan ganda (spam) saat container restart atau tick berulang:
1. **Broadcast Log State**: Sebelum mengirimkan pesan, scheduler mengecek tabel `audit_logs` dengan format event: `BROADCAST_${ASSIGNMENT_ID}_${MILESTONE}_${DATE}`.
2. Jika record sudah ada untuk hari/milestone tersebut, scheduler mengabaikan pengiriman (skip).
3. Jika belum, bot mengirimkan pesan ke WhatsApp dan langsung menyimpan log ke database dalam satu transaksi.

---

## 4. Reminder Message Templates

### 4.1. Template Broadcast H-3 & H-2 (Pemberitahuan & Progres)
```text
📢 *PENGINGAT TUGAS KULIAH [H-3]*

📚 Mata Kuliah: *Basis Data*
📝 Tugas: *Tugas ERD Database Toko (Pertemuan 4)*
⏳ Batas Waktu: *Jumat, 28 Agu 2026 - 23:59 WIB*
⚠️ Sisa Waktu: *3 Hari lagi*

📖 *Instruksi Singkat:*
Buat diagram ERD lengkap dengan relasi kardinalitas dan upload file PDF/ZIP ke Google Drive.

📁 *Link Pengumpulan:*
https://drive.google.com/drive/folders/...

_Gunakan format penamaan: [NAMA]_[NIM]_[EXTRA].[EXT]_
```

### 4.2. Template Broadcast H-1 (Peringatan Deadline Besok)
```text
⚠️ *PERINGATAN DEADLINE TUGAS BESOK [H-1]*

📚 Mata Kuliah: *Basis Data*
📝 Tugas: *Tugas ERD Database Toko*
⏳ Batas Waktu: *BESOK, 28 Agu 2026 pukul 23:59 WIB*

Bagi yang belum mengumpulkan, silakan segera selesaikan dan upload ke GDrive. Cek validitas format file Anda via bot ketik `/menu` -> pilih menu *4*.

📁 *Folder GDrive:* https://drive.google.com/drive/folders/...
```

### 4.3. Template Broadcast Hari-H (Peringatan Kritis)
```text
🚨 *HARI TERAKHIR PENGUMPULAN TUGAS [HARI-H]* 🚨

📚 Mata Kuliah: *Basis Data*
📝 Tugas: *Tugas ERD Database Toko*
⏰ DEADLINE: *HARI INI pukul 23:59 WIB* (Sisa waktu < 4 Jam!)

Pastikan file Anda sudah terupload dengan format yang benar. Folder akan ditutup sesuai waktu yang ditentukan dosen.
```
