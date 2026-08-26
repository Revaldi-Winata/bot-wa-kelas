# WhatsApp Bot Engine Specification
## Interaction Paradigm, Concurrency, State Machine & Input Validation

---

## 1. Channel Scope Matrix & Authorization

Sistem menerapkan isolasi peran yang ketat berdasarkan asal pesan (Remote JID):

```
                       [Pesan WhatsApp Masuk]
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
          [Pesan dari Grup]               [Pesan dari DM]
                 │                               │
       ┌─────────┴─────────┐                     │
       ▼                   ▼                     ▼
[Grup Utama Kelas]  [Grup Mata Kuliah]    [Cek Cache Whitelist]
       │                   │                     │
       ▼                   ▼            ┌────────┴────────┐
[Full Menu +         [Silent Mode:      ▼                 ▼
 Scheduler]          Abaikan Chat,    [Terdaftar]    [Tidak Terdaftar]
                     Scheduler Only]    │                 │
                                        ▼                 ▼
                                  [Full Menu]       [Silent Drop /
                                                    Abaikan Pesan]
```

### Authorization Rules:
1. **Grup Utama Kelas**: Mengizinkan seluruh member memicu `/menu` dan menerima notifikasi scheduler semua mata kuliah.
2. **Direct Message (DM)**: Hanya melayani nomor yang terdaftar di tabel `whitelist_members` (hasil auto-sync dari Grup Utama). Nomor luar akan diabaikan (silent drop).
3. **Grup Mata Kuliah**: Bot berada dalam status **Silent Mode**. Seluruh command `/menu` atau teks chat diabaikan sepenuhnya agar tidak mengotori grup. Hanya menerima broadcast scheduler pengingat tugas untuk mata kuliah tersebut.
4. **Grup / Kontak Asing**: Diabaikan sepenuhnya (Silent Drop).

---

## 2. Dynamic Whitelist Synchronization Lifecycle

1. **Startup Synchronization**: Saat bot pertama kali terkoneksi, bot memanggil `sock.groupMetadata(mainGroupJid)` untuk mengekstrak seluruh nomor peserta dan menyimpannya ke tabel `whitelist_members`.
2. **Event-Driven Update**: Bot mendengarkan event socket `group-participants.update`:
   * Action `add`: Otomatis menambahkan nomor baru ke `whitelist_members`.
   * Action `remove`: Otomatis menghapus nomor yang keluar dari `whitelist_members`.
3. **Manual Trigger**: Tombol *Force Sync Whitelist* di Web Dashboard memicu fetch ulang peserta kapan saja.

---

## 3. Concurrency Architecture & State Machine

### 3.1. Composite Session Key (Penyelesaian Tabrakan Multi-User di Grup)
Untuk mencegah *race condition* dan *state collision* saat banyak mahasiswa berinteraksi di dalam grup kelas secara bersamaan:

$$\text{SessionKey} = \text{remoteJid} : \text{senderJid}$$

* **Di Grup Kelas**: `12036302@g.us:62812345678@s.whatsapp.net` (Setiap anggota memiliki state terisolasi 100%).
* **Di DM**: `62812345678@s.whatsapp.net:62812345678@s.whatsapp.net`.

Sesi disimpan dalam in-memory LRU Map dengan auto-eviction:
* **TTL Sesi di Grup**: **60 Detik** (Cepat hangus untuk mereduksi noise grup).
* **TTL Sesi di DM**: **180 Detik** (Lebih leluasa).

```text
[User A ketik "/menu" di Grup] ──► State Key (Grup:UserA) = AWAIT_MAIN_MENU
[User B ketik "/menu" di Grup] ──► State Key (Grup:UserB) = AWAIT_MAIN_MENU

[User A balas "1" (Jadwal)]    ──► Router cek State Key (Grup:UserA) ──► Tampilkan Sub-menu Hari User A
[User B balas "2" (Kontak)]    ──► Router cek State Key (Grup:UserB) ──► Tampilkan Kontak Dosen User B
[User C balas "1" (Random)]    ──► State Key (Grup:UserC) = NULL       ──► Abaikan (Silent Drop)
```

---

### 3.2. UX Best Practice: Hybrid Quote & Reply Detection

| Parameter | Di Direct Message (DM) | Di Grup Kelas |
| :--- | :--- | :--- |
| **Kebutuhan Quote/Swipe Reply** | **TIDAK PERLU** (Cukup ketik angka langsung `1`, `2`, dll). | **HYBRID (Fleksibel & Aman)** |
| **Mekanisme di Grup** | Langsung diproses per sender. | 1. **Metode A (Swipe/Quote)**: User me-reply pesan menu bot -> Bot validasi state dan proses angka.<br>2. **Metode B (Ketik Langsung)**: User ketik angka tanpa quote -> Bot cek apakah `SessionKey(Grup:User)` aktif. Jika aktif, proses. Jika tidak aktif -> **Silent Drop** (mencegah salah trigger obrolan umum grup). |

---

## 4. Strict Single-Token Input Validation Engine (ADR D14)

Untuk menjaga integritas state machine dan mencegah kesalahan eksekusi:

### 4.1. Sanitasi & Parsing Engine
```typescript
// Tahap 1: Trim leading & trailing whitespace
const sanitized = rawMessage.trim();

// Tahap 2: Validasi exact match token angka tunggal
const isStrictSingleDigit = /^[0-9]$/.test(sanitized);

// Tahap 3: Validasi ketersediaan opsi di state aktif
const isValidOption = isStrictSingleDigit && currentAvailableOptions.includes(Number(sanitized));
```

### 4.2. Input Test Matrix
| Input Mentah Pengguna | Status Sanitasi | Status Validasi | Tindakan Bot |
| :--- | :---: | :---: | :--- |
| `'1'` | `'1'` | ✅ **VALID** | Eksekusi Opsi 1 |
| `'  1  '` | `'1'` | ✅ **VALID** | Eksekusi Opsi 1 (Toleransi spasi ujung) |
| `'1 halo'` | `'1 halo'` | ❌ **INVALID** | Tolak (Mengandung karakter asing) |
| `'adwadawd 1'` | `'adwadawd 1'` | ❌ **INVALID** | Tolak (Mengandung karakter asing) |
| `'1adwada'` | `'1adwada'` | ❌ **INVALID** | Tolak (Karakter tidak terpisah) |
| `'adawdaw1'` | `'adawdaw1'` | ❌ **INVALID** | Tolak (Karakter di depan) |
| `'9'` (di menu opsi 1-4) | `'9'` | ❌ **INVALID** | Tolak (Di luar range opsi aktif) |

---

### 4.3. Error Handling Matrix (Berdasarkan Konteks Chat)

```
                       [Input User Dinyatakan INVALID]
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
              [Konteks: DM]                   [Konteks: GRUP]
                     │                               │
                     ▼                       ┌───────┴───────┐
            [Kirim Pesan Error]              ▼               ▼
          (State Dipertahankan)      [Pesan Me-Reply]  [Pesan Obrolan
                                     [  Pesan Bot  ]   [  Biasa Grup ]
                                             │               │
                                             ▼               ▼
                                    [Kirim Pesan Error  [SILENT DROP]
                                       1 Baris Singkat] (Bot Diam)
```

1. **Di Direct Message (DM)**:
   * Mengirimkan pesan instruksi eksplisit:
     ```text
     ⚠️ *Pilihan tidak valid!*

     Mohon balas *hanya dengan angka* yang tertera pada menu (contoh: *1*, *2*, *3*, atau *0* untuk batal).
     ```
   * Sesi state **dipertahankan**.
2. **Di Grup Kelas**:
   * **Jika User Me-Reply/Quote Pesan Bot**: Kirim peringatan 1 baris:
     `_⚠️ Pilihan salah. Balas hanya dengan angka menu (misal: 1) atau 0 untuk batal._`
   * **Jika User Mengetik di Grup Tanpa Quote (Obrolan Biasa)**: **SILENT DROP (Bot Diam)**. Bot dilarang menyela percakapan mahasiswa.
3. **Max Retry Circuit Breaker (Anti-Looping)**:
   * Jika user melakukan kesalahan input **3 kali berturut-turut**:
     * Sesi state otomatis di-reset (`Session = NULL`).
     * Bot mengirimkan pesan penutup: *"⚠️ Sesi dibatalkan karena 3 kali kesalahan berturut-turut. Ketik `/menu` untuk memulai kembali."*

---

## 5. Tiered Rate Limiting Hierarchy (RPM & RPD)

```
┌──────────────────────────────────────────────────────────────┐
│                    RATE LIMIT HIERARCHY                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 1. GLOBAL GROUP COOLDOWN (Anti-Group Noise)            │  │
│  │    Max 12 respon bot / menit per grup kelas            │  │
│  │    (Jika overload -> alihkan mahasiswa ke DM)          │  │
│  └───────────────────────────┬────────────────────────────┘  │
│                              │                               │
│  ┌───────────────────────────┴────────────────────────────┐  │
│  │ 2. PER-USER RPM & RPD (Anti-Spam User)                 │  │
│  │    Di Grup : Max 4 RPM  | Max 40 RPD per user          │  │
│  │    Di DM   : Max 10 RPM | Max 100 RPD per user         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Rate Limiting Policies:
1. **Per-User Group Limit**: Maksimal **4 Requests Per Minute (RPM)** & **40 Requests Per Day (RPD)** per mahasiswa di dalam grup.
2. **Per-User DM Limit**: Maksimal **10 Requests Per Minute (RPM)** & **100 Requests Per Day (RPD)** per mahasiswa di private chat DM.
3. **Global Group Cooldown**: Maksimal **12 total respon bot per menit per grup kelas**. Jika trafik grup melebihi kapasitas:
   * Bot mengirim 1 pesan peringatan: *"⚠️ Lalu lintas bot di grup sedang padat. Silakan gunakan DM bot (wa.me/nomor-bot) untuk navigasi mandiri tanpa jeda."*
   * Cooldown aktif selama 30 detik untuk menenangkan grup chat.
4. **Artificial Delay (Jitter)**: Bot menyisipkan jeda acak **1.000ms – 2.500ms** sebelum mengirim balasan untuk meniru pola manusia dan menghindari deteksi automated abuse oleh Meta.

---

## 6. Message Formatting Standards & Templates

### 6.1. Template Menu Utama
```text
🤖 *BOT INFORMASI KELAS*
Semester Ganjil 2026/2027

Silakan pilih menu dengan membalas *angka*:
1️⃣ *Jadwal Kuliah*
2️⃣ *Kontak Dosen*
3️⃣ *Daftar Tugas & Deadline*
4️⃣ *Cek Pengumpulan File GDrive*

_Ketik *0* untuk membatalkan._
_💡 Tips: Gunakan DM bot untuk navigasi lebih nyaman tanpa notifikasi ramai di grup._
```

### 6.2. Template Jadwal Kuliah
```text
📅 *JADWAL KULIAH - SENIN*

1. *Basis Data*
   ⏰ 07:30 - 10:00 WIB
   📍 Ruang V.401
   👨‍🏫 Dr. Eng. Budi Santoso, M.Kom
   📌 Status: *Normal*

2. *Algoritma & Pemrograman*
   ⏰ 10:30 - 13:00 WIB
   📍 Ruang Lab Komputer 2
   👨‍🏫 Siti Aminah, M.T
   📌 Status: *Kuliah Pengganti (Zoom)*

_Ketik *0* untuk kembali ke Menu Utama._
```

### 6.3. Template Kontak Dosen
```text
👨‍🏫 *KONTAK DOSEN - BASIS DATA*

*Dr. Eng. Budi Santoso, M.Kom*
📱 WhatsApp: https://wa.me/6281234567890
📧 Email: budi.santoso@univ.ac.id
🏢 Ruang: Dekanat Lt. 3 / Ruang Dosen TI
📝 Catatan: Konsultasi tatap muka hanya hari Senin & Rabu.

_Ketik *0* untuk kembali ke Menu Utama._
```

### 6.4. Template Daftar Tugas Aktif
```text
📝 *DAFTAR TUGAS KULIAH AKTIF*

1. *Tugas ERD Database Toko*
   📚 Basis Data (Pertemuan 4)
   ⏳ Deadline: *Jumat, 28 Agu 2026 - 23:59 WIB*
   ⚠️ Sisa Waktu: *2 Hari lagi*
   📁 Pengumpulan: https://drive.google.com/drive/folders/...

2. *Slicing UI Dashboard*
   📚 Pemrograman Web (Pertemuan 5)
   ⏳ Deadline: *Minggu, 30 Agu 2026 - 18:00 WIB*
   ⚠️ Sisa Waktu: *4 Hari lagi*

_Ketik *0* untuk kembali ke Menu Utama._
```
