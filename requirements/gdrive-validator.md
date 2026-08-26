# Google Drive Validator & Hierarchy Traversal Specification
## Headless Assignment File Inspector via Google Service Account

---

## 1. Google Service Account Architecture

Sistem menggunakan **Google Cloud Service Account** untuk mengakses Google Drive tanpa intervensi login OAuth interaktif dari user/admin.

```
┌──────────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD CONSOLE                      │
│                                                              │
│  1. Create Project -> Enable Google Drive API v3             │
│  2. Create Service Account -> Download credentials.json      │
│  3. Service Email: bot-checker@project-id.iam.gserviceaccount│
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                      KETUA KELAS GDRIVE                      │
│                                                              │
│  Bagikan (Share) Folder Root Kelas (Viewer Access) ke:       │
│  `bot-checker@project-id.iam.gserviceaccount.com`            │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   BOT TRAVERSAL & VALIDATOR                  │
│                                                              │
│  - Traversal hierarki subfolder otomatis                     │
│  - Inspeksi metadata nama file (q parameter API v3)          │
│  - Regex matcher & laporan status ke WhatsApp                │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Folder Hierarchy Traversal Specification

Struktur folder terpusat diatur sebagai berikut:

```text
📁 [Root Folder Kelas: misal 07TPLP025] (Root ID disimpan di Dashboard)
   ├── 📁 Basis Data                         <-- Match nama Subject
   │     ├── 📁 Pertemuan 01                 <-- Match Pertemuan X
   │     │     └── 📁 Tugas 1                <-- Folder penampung file tugas
   │     │           ├── 📄 Ahmad Fauzi_2021804001_Tugas Mandiri.pdf
   │     │           └── 📄 Budi Santoso_2021804002.zip
   │     └── 📁 Pertemuan 02
   └── 📁 Pemrograman Web
```

### Algoritma Traversal Otomatis:
1. Ambil `Root Folder ID` dari konfigurasi database.
2. Cari Subfolder Mata Kuliah: Query GDrive `mimeType = 'application/vnd.google-apps.folder' and name contains '${subjectName}' and '${rootFolderId}' in parents`.
3. Cari Subfolder Pertemuan: Query GDrive `name contains 'Pertemuan ${meetingNumber}' and '${subjectFolderId}' in parents`.
4. Ambil seluruh file dalam folder tugas: Query GDrive `'${targetFolderId}' in parents and trashed = false`.

---

## 3. Standard File Naming Pattern & Regex Specification

### 3.1. Standard Pattern (ADR D10)
Format baku: `[NAMA]_[NIM]_[EXTRA].[EXT]`

* **`[NAMA]`**: Nama lengkap mahasiswa (Karakter alfabet dan spasi `[A-Za-z\s]+`).
* **`[NIM]`**: Nomor Induk Mahasiswa (8 s.d. 12 digit numerik `[0-9]{8,12}`).
* **`[EXTRA]`**: Suffix wildcard opsional (Bebas diisi judul tugas / catatan tambahan oleh mahasiswa, diabaikan oleh parser).
* **`[EXT]`**: Ekstensi file yang diizinkan (e.g. `pdf|zip|rar|docx`).

### 3.2. Compiled Regex Engine
```regex
^([A-Za-z\s]+)_([0-9]{8,12})(?:_.*)?\.(pdf|zip|rar|docx)$
```

### 3.3. Test Case Matrix
| Nama File Input | Status | Ekstraksi Nama | Ekstraksi NIM | Keterangan |
| :--- | :---: | :--- | :--- | :--- |
| `Ahmad Fauzi_2021804001_Tugas 1.pdf` | ✅ **VALID** | `Ahmad Fauzi` | `2021804001` | Pola lengkap dengan extra string |
| `Budi Santoso_2021804002.zip` | ✅ **VALID** | `Budi Santoso` | `2021804002` | Pola standar tanpa extra string |
| `Siti_Nurhaliza_2021804003_Final.docx`| ✅ **VALID** | `Siti_Nurhaliza` | `2021804003` | Valid (undescore nama ditoleransi) |
| `2021804001_Ahmad_Tugas.pdf` | ❌ **INVALID** | - | - | NIM terbalik di depan |
| `Tugas1_BasisData.pdf` | ❌ **INVALID** | - | - | Tidak mencantumkan nama & NIM |
| `Ahmad Fauzi_2021804001_Tugas1.exe` | ❌ **INVALID** | - | - | Ekstensi `.exe` dilarang |

---

## 4. WhatsApp Output Format (Validation Report)

Format pesan balasan bot ke WhatsApp saat mahasiswa menjalankan pengecekan pengumpulan file:

```text
🔍 *LAPORAN PENGUMPULAN TUGAS GDRIVE*
📚 Mata Kuliah: *Basis Data (Pertemuan 4)*
📁 Folder: *07TPLP025 > Basis Data > Pertemuan 04*

📊 *Ringkasan:*
* Total File Terkumpul: 28 File
* ✅ Format Sesuai (Valid): 26 Mahasiswa
* ❌ Format Salah (Invalid): 2 File

-----------------------------------------
✅ *DAFTAR MAHASISWA TERVERIFIKASI:*
1. Ahmad Fauzi (2021804001) - .pdf
2. Budi Santoso (2021804002) - .zip
3. Citra Lestari (2021804003) - .pdf
... [dst]

-----------------------------------------
❌ *FILE SALAH FORMAT (WAJIB UPLOAD ULANG):*
1. `tugas_basisdata_fix.pdf`
   ⚠️ Alasan: *Nama & NIM tidak terdeteksi*
2. `Doni Pratama_2021804005.exe`
   ⚠️ Alasan: *Format .exe dilarang (Wajib PDF/ZIP)*

_Ketik *0* untuk kembali ke Menu Utama._
```

---

## 5. Error & Edge Case Handling

1. **Folder Belum Dibuat / Not Found (`404`)**:
   * Output: *"⚠️ Folder pengumpulan untuk mata kuliah ini belum dibuat di Google Drive. Silakan hubungi Ketua Kelas."*
2. **Folder Kosong (0 File Terupload)**:
   * Output: *"📁 Belum ada file tugas yang terupload pada folder ini."*
3. **Izin Service Account Belum Diberikan (`403 Forbidden`)**:
   * Output: *"⚠️ Akses Google Drive ditolak. Pastikan Ketua Kelas telah membagikan akses folder ke email bot."*
