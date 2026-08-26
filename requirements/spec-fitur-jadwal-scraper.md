# Rancangan Spesifikasi Sistem & Fitur Bot Kelas 07TPLP025

Dokumen ini merangkum seluruh arsitektur fitur baru, alur data, mekanisme bot WhatsApp, scraping real-time Mentari UNPAM, dan penyesuaian UI/UX Dashboard.

---

## 1. Fitur Jadwal Perkuliahan (Menu 1 Bot)

Alur interaksi pada **Menu 1 (Jadwal Kuliah)** dibagi menjadi dua mode respon:

### A. Opsi 7 — Lihat Seluruh Jadwal (Overview Statis)
* **Tujuan**: Memberikan gambaran umum master jadwal mata kuliah dalam 1 minggu tanpa terikat tanggal atau minggu tertentu.
* **Format Tampilan**:
  * Mengelompokkan per hari (Senin s.d. Sabtu).
  * Menampilkan: Nama Mata Kuliah, Beban SKS, Jam Kuliah (WIB), Ruangan, dan Dosen Pengampu.
  * **Aturan Khusus**: **TIDAK** menampilkan baris status (`NORMAL`, `ELEARNING`, `LIBUR`, dll) agar ringkas dan bersih.

### B. Opsi 1 s.d. 6 — Jadwal Harian Kontekstual Minggu Berjalan (Dinamis)
* **Tujuan**: Menampilkan informasi mendetail dan akurat berdasarkan **kapan user mengirim pesan (Minggu ke-$N$ semester berjalan)**.
* **Mekanisme Penentuan Waktu**:
  1. Bot membaca tanggal hari ini $\rightarrow$ mencocokkan dengan tanggal mulai di `semester_configs` untuk mengetahui nomor minggu aktif (`week_number`).
  2. Menghitung tanggal eksak hari yang dipilih pada minggu tersebut.
* **Format Tampilan**:
  * Header tanggal & hari spesifik (contoh: `Selasa, 15 September 2026`).
  * Detail Sesi: Pertemuan Ke-$N$, Jam WIB, Ruangan, Dosen Pengampu.
  * **Status Sesi Eksak**: `[OFFLINE]`, `[ELEARNING]`, `[ZOOM]`, `[UTS]`, `[UAS]`, atau `[LIBUR]`.
  * **Catatan Khusus Sesi / Mata Kuliah**: Menampilkan instruksi dari Ketua Kelas (contoh: *"Bawa modul praktikum bab 3 & laptop"*).
  * **Rangkuman E-Learning Minggu Ini**: Menampilkan daftar mata kuliah E-Learning **lainnya** yang terjadwal pada hari berbeda di minggu yang sama (jika ada), agar mahasiswa tidak terlewat.
  * **Fallback Handling**: Jika user memicu opsi ini namun kalender semester belum dibuat di sistem, bot secara otomatis menampilkan jadwal reguler master tanpa crash.

---

## 2. Fitur Scraping Real-Time E-Learning (Mentari UNPAM)

### A. Deteksi Ketersediaan Forum Diskusi
* **Target Portal**: `mentari.unpam.ac.id` (Modul Mata Kuliah & Sesi Pertemuan).
* **Mekanisme Selektor DOM**:
  * **Kondisi Belum Ada**: Elemen card memuat teks `Soal forum diskusi belum tersedia, silahkan menghubungi dosen pengampu mata kuliah` dan tombol `FORUM ›` **TIDAK ADA**.
    * $\rightarrow$ *Tindakan*: Bot diam (silent), tidak mengirim pesan ke grup.
  * **Kondisi Sudah Terbit**: Elemen tombol **`FORUM ›`** aktif muncul di kanan bawah card forum diskusi dan memuat deskripsi topik.
    * $\rightarrow$ *Tindakan*: Bot mendeteksi forum aktif, mengekstrak teks topik diskusi, memperbarui database, dan memicu broadcast ke WhatsApp.

### B. Alur Pemicu (Trigger) & Pengelolaan Link
1. **Pemberian Link Dinamis via Dashboard**:
   * URL modul/pertemuan Mentari diinput langsung oleh Ketua Kelas melalui Dashboard Web (bukan hardcode kode program) sehingga fleksibel saat kode kelas/matkul berganti.
2. **Otomatis Sesuai Jadwal Polling**:
   * Scraper berjalan berkala pada minggu yang memiliki jadwal E-Learning.
3. **Manual dari Dashboard Ketua Kelas**:
   * Ketua kelas dapat menekan tombol **"Cek Scrape Mentari"** untuk validasi instan.

### C. Alur Broadcast & Pengingat 00:00 WIB
1. **Saat Forum Pertama Kali Terdeteksi**:
   * Bot langsung mengirim pengumuman resmi ke **Grup WhatsApp Utama Kelas** dan **Grup WhatsApp Mata Kuliah**.
   * Format pesan mencakup: Nama Matkul, Pertemuan Ke-$N$, Topik Diskusi, Link Langsung ke Mentari, dan Deadline pengisian.
2. **Pengingat Harian 00:00 WIB**:
   * Data forum yang terdeteksi disimpan di database.
   * Selama minggu perkuliahan e-learning tersebut (Senin s.d. Jumat), bot otomatis mengirim pesan pengingat setiap pukul **00:00 WIB** agar seluruh mahasiswa menyelesaikan forum sebelum batas waktu.

### D. Pengingat Khusus H-1 (Hari Kamis) — Forum Belum Diposting Dosen
* **Jadwal Eksekusi**: Setiap hari **Kamis pukul 07:10 WIB** (H-1 sebelum batas akhir masa e-learning di hari Jumat).
* **Kondisi Trigger**: Jika ada mata kuliah e-learning pada minggu berjalan yang hingga hari Kamis pukul 07:10 WIB tombol forumnya **BELUM TERBIT** di portal Mentari.
* **Tindakan Bot**:
  * Mengirim pesan peringatan khusus ke **Grup Kelas** & **Grup Mata Kuliah**:
    ```
    ⚠️ *[PENGINGAT H-1: FORUM E-LEARNING BELUM DIBUKA]*

    Mata Kuliah : [Nama Mata Kuliah]
    Pertemuan   : Ke-[N] (Jadwal E-Learning Minggu Ini)
    Dosen       : [Nama Dosen Pengampu] ([Nomor WA Dosen])

    Hingga hari Kamis (H-1), forum diskusi belum tersedia di portal Mentari UNPAM.
    Dimohon Ketua Kelas / PIC Mata Kuliah untuk segera menghubungi dosen pengampu agar forum segera dibuka.
    ```

### E. Penanganan Kesalahan Posting Dosen (Salah Pertemuan & Revisi Forum Baru)
1. **Kasus 1: Dosen Salah Tempat (Post di Pertemuan Sebelum / Sesudahnya)**:
   * *Mekanisme*: Jika pada pertemuan target (misal Pertemuan 6) belum ada forum, bot melakukan *adjacent-check* memeriksa 1 pertemuan sebelum (Pertemuan 5) dan sesudah (Pertemuan 7).
   * *Aksi*: Jika terdeteksi forum baru terbit di pertemuan yang salah, bot menandai di Dashboard: `⚠️ Forum Terbit di Pertemuan 5 (Bukan Pertemuan 6)` dan memberi opsi Ketua Kelas untuk memverifikasi apakah ini forum resmi minggu ini.
2. **Kasus 2: Dosen Membuat Forum Baru / Revisi Topik**:
   * *Mekanisme*: Bot menyimpan hash deskripsi topik forum di database (`meeting_sessions.notes`).
   * *Aksi*: Jika pada polling berikutnya terdeteksi teks topik berubah atau link tombol baru muncul, bot mendeteksi sebagai **REVISI FORUM** dan mengirim broadcast pembaruan ke WA:
     ```
     📢 *[UPDATE REVISI: FORUM E-LEARNING DIPERBARUI]*

     Mata Kuliah : [Nama Mata Kuliah]
     Pertemuan   : Ke-[N]
     Topik Baru  : [Deskripsi Topik Baru]

     Dosen telah memperbarui / membuka forum diskusi baru. Harap seluruh mahasiswa beralih dan berdiskusi di forum terbaru!
     ```


---

## 3. Fitur Pengingat Jadwal Kuliah Pagi (04:00 WIB)

* **Jadwal Eksekusi**: Setiap hari pukul **04:00 WIB**.
* **Cara Kerja**:
  1. Bot memeriksa apakah hari ini ada jadwal perkuliahan.
  2. Jika ada jadwal:
     * Mengambil detail mata kuliah hari ini (Offline / Zoom / E-Learning).
     * Mengambil **Catatan Khusus**:
       * *Catatan Spesifik Pertemuan* (`meeting_sessions.notes` - hanya berlaku hari itu, misal instruksi tugas).
       * *Catatan Global Mata Kuliah* (`subjects.general_notes` - berlaku umum, misal aturan dosen).
     * Mengirim notifikasi pagi ke Grup WhatsApp Kelas.
  3. Jika hari libur / tidak ada jadwal perkuliahan $\rightarrow$ Bot tidak mengirim pesan (silent).

---

## 4. Penyesuaian UI & UX Dashboard

### A. Tab Jadwal (Drill-Down Pertemuan)
* **Field Catatan Pertemuan**: Form modal untuk input instruksi khusus pertemuan (`notes`).
* **Kolom Link Mentari & Status Forum**:
  * Input URL modul pertemuan Mentari (`mentari_url`).
  * Badge indikator status scraping: `[Forum Belum Rilis]`, `[Forum Aktif]`, atau `[⚠️ Mentari Down / Overload]`.
  * Tombol aksi **`Cek Scrape Mentari`** untuk validasi instan.
  * Tombol aksi **`Broadcast Manual E-Learning`** sebagai jalur pintas (*bypass*) jika Mentari sedang down namun topik sudah dikabari dosen via WA.

### B. Tab Kontak Dosen
* Menampilkan daftar dosen pengampu beserta mata kuliah yang diampu dari Master Jadwal.
* **Field Catatan Global Dosen/Matkul**: Form untuk mencatat ketentuan umum mata kuliah (`general_notes`).

### C. Tab Pengaturan (Konfigurasi Scraper)
* Form kredensial Mentari UNPAM (`Username NIM` / `Password`) disimpan aman untuk keperluan *Auto Re-Authentication*.
* Log riwayat pengecekan scraper Mentari.

---

## 5. Rencana Tahapan Implementasi (Step-by-Step)

```
[Tahap 1] Database & Schema Upgrade
   ├── Tambah kolom mentari_url pada tabel meeting_sessions (notes sudah ada)
   └── Tambah kolom general_notes pada tabel subjects

[Tahap 2] Update Bot Router (Menu 1)
   ├── Opsi 7: Tampilan statis tanpa status
   └── Opsi 1-6: Tampilan dinamis kontekstual minggu berjalan + catatan + info elearning

[Tahap 3] Modul Scraper Mentari UNPAM
   ├── Engine Puppeteer Stealth dengan Auto Re-Authentication
   └── Endpoint API /api/elearning/check & /api/elearning/sync

[Tahap 4] Scheduler Pengingat (node-cron)
   ├── Pengingat Harian 04:00 WIB (Jadwal Hari Ini + Catatan)
   ├── Pengingat E-Learning 00:00 WIB (Senin - Jumat)
   └── Pengingat H-1 Kamis 07:10 WIB (Forum Belum Terbit)

[Tahap 5] Dashboard UI/UX Polish
   ├── Integrasi input Catatan Sesi, Link Mentari, & Tombol Bypass Manual
   └── Visual badge status forum & indikator server down
```

---

## 6. Analisis Teknis Mendalam: Penanganan Single Page Application (SPA) & Siklus Pertemuan

### A. Mekanisme Scraping & Manajemen Autentikasi (Auto Re-Auth)
* **Penanganan Sesi / Cookie Expired**:
  1. Saat scraper mengakses URL Mentari, bot mengecek apakah halaman dialihkan (*redirect*) ke form login `/login`.
  2. Jika sesi expired, bot otomatis mengisi kredensial NIM & Password dari database/config, melakukan submit login, memperbarui *session cookies*, lalu melanjutkan scraping halaman pertemuan secara transparan.
* **Deteksi Tombol `FORUM ›`**:
  1. Scraper membuka URL course dengan parameter accordion pertemuan aktif (contoh: `?accord_pertemuan=PERTEMUAN_3` atau `PERTEMUAN_6`).
  2. Scraper mengevaluasi DOM:
     * Mencari keberadaan teks peringatan: `"Soal forum diskusi belum tersedia"`.
     * Mencari elemen button bertuliskan `"FORUM"`.
  3. Jika tombol `FORUM` terdeteksi dan tidak ada teks "belum tersedia", scraper mengekstrak teks deskripsi topik forum di card tersebut.

### B. Penanganan Siklus Pertemuan (Pertemuan 3 Selesai $\rightarrow$ Pertemuan 6 Aktif)
* **Solusi Berbasis Time-Anchor (Kalender Database)**:
  1. Database `meeting_sessions` telah mengikat setiap pertemuan ke tanggal dan nomor minggu eksak (`week_number`).
  2. Scraper hanya memantau sesi pertemuan yang `session_date`-nya berada dalam **rentang minggu berjalan (Senin s.d. Minggu)**.
  3. Saat minggu perkuliahan berpindah dari Minggu 2 ke Minggu 4:
     * Pertemuan 3 secara otomatis berstatus lampau (*passed*).
     * Pertemuan 6 otomatis menjadi target aktif baru yang dipantau scraper dan diingatkan pada pukul 00:00 WIB.
  4. Deduplikasi broadcast menggunakan key audit log `AUDIT_FORUM_DISCOVERED_${meeting_session_id}` sehingga setiap pertemuan hanya dibroadcast sekali saat pertama kali terbit.

---

## 7. Manajemen Waktu Polling Scraping & Matriks Error Handling

### A. Frekuensi & Jadwal Polling Scraping
Scraping berjalan otomatis **hanya pada minggu yang memiliki sesi E-Learning**, dimulai dari hari **Senin 00:00 WIB**:

| Rentang Waktu (WIB) | Frekuensi Polling | Alasan Teknis |
| :--- | :--- | :--- |
| **07:00 – 18:00 WIB** (Jam Kerja) | **Setiap 1 Jam 1x** | Jam aktif dosen memposting materi & forum diskusi. |
| **18:00 – 22:00 WIB** (Malam) | **Setiap 2 Jam 1x** | Memantau dosen yang memposting di malam hari. |
| **22:00 – 06:00 WIB** (Subuh) | **Hanya di 00:00 WIB** | Hemat resource, server Mentari minim aktivitas dosen. |

* **Kondisi Berhenti (Stop Condition)**:
  * Begitu tombol `FORUM ›` terdeteksi pada suatu mata kuliah $\rightarrow$ Status sesi di database diperbarui dan dicatat di `audit_logs`.
  * Bot **BERHENTI melakukan scraping** untuk mata kuliah tersebut pada minggu itu (menghemat resource & menghindari deteksi rate-limit Cloudflare).
  * Polling untuk matkul tersebut baru akan aktif kembali saat memasuki minggu perkuliahan e-learning berikutnya (misal: Pertemuan 6).

### B. Matriks Error Handling & Penanganan Kasus Mentari

| Skenario Kasus Mentari | Tindakan Bot / Sistem | Dampak ke User / Grup WA |
| :--- | :--- | :--- |
| **1. Server Mentari Sering Down / Overload (Error 500/502/503/Timeout)** | **Circuit Breaker**: Hentikan request berulang saat server macet, aktifkan masa jeda (*cooldown*) 30 menit. Tangkap error tanpa crash proses. | Dashboard menampilkan badge: `⚠️ Server Mentari Down/Overload`. Ketua Kelas dapat menekan tombol **`Broadcast Manual E-Learning`** untuk mem-bypass scraper. |
| **2. Session Cookie Cepat Kedaluwarsa** | **Auto Re-Authentication**: Deteksi redirect ke `/login` $\rightarrow$ bot otomatis mengisi kredensial NIM & Password dan mengambil session cookie baru di background. | Berjalan transparan, tidak memerlukan login manual berulang kali. |
| **3. Dosen Salah Post Pertemuan / Membuka Forum Revisi Baru** | **Adjacent Check & Hash Detection**: Cek pertemuan $\pm 1$. Jika topik berubah atau ada forum baru, bot mendeteksi revisi topik. | Bot mengirim pesan pembaruan resmi: `📢 [UPDATE REVISI: FORUM E-LEARNING DIPERBARUI]` agar mahasiswa pindah ke forum yang benar. |
| **4. Verifikasi Bot Cloudflare (Turnstile Challenge)** | Menjalankan Puppeteer dengan profil browser asli Windows (`--user-data-dir` + flags stealth). | Jika captcha blokir total, sistem beralih ke **Dual-Mode Fallback (Manual Broadcast via Dashboard)** tanpa error di grup WA. |
| **5. Dosen Tidak Pernah Post Forum Sepanjang Minggu** | Peringatan H-1 terkirim pada Kamis 07:10 WIB. Hingga Jumat 00:00 WIB forum tetap tidak ada. | Pengingat 00:00 WIB tetap jalan dengan catatan: *"⚠️ Forum diskusi belum dibuka oleh dosen. Silakan perwakilan kelas konfirmasi ke dosen pengampu."* |
| **6. Timezone Desynchronization** | Seluruh engine waktu dikunci ke **WIB (`Asia/Jakarta`, UTC+7)** menggunakan `Intl.DateTimeFormat`. | Menghindari selisih jam jika server di-host di VPS luar negeri (UTC). |

---

## 8. Hasil Evaluasi & Mitigasi Teknis (Prinsip Minimalis / Ponytail)

Berikut adalah evaluasi efisiensi arsitektur, potensi titik rawan, dan prinsip penyederhanaan yang diterapkan agar sistem berjalan tangguh tanpa *over-engineering*:

### A. Bot Jadwal Menu 1 (Opsi 7 Statis vs Opsi 1–6 Dinamis)
* **Tingkat Kompleksitas**: **Rendah (Sangat Efisien)**.
* **Evaluasi**:
  * Menggunakan stdlib `Date` & 1 query SQL sederhana per request.
  * Opsi 7 = `SELECT` master jadwal mingguan.
  * Opsi 1–6 = Hitung tanggal hari $N$ pada minggu berjalan $\rightarrow$ `SELECT` sesi pertemuan.
* **Mitigasi Risiko**:
  * *Risiko*: User memicu opsi 1–6 sebelum kalender semester di-generate di dashboard.
  * *Solusi*: Fallback otomatis: jika tabel `meeting_sessions` kosong, bot otomatis menampilkan jadwal reguler master agar tidak mengembalikan pesan kosong/error.

### B. Scraper Real-Time Mentari UNPAM (Deteksi Tombol `FORUM ›`)
* **Tingkat Kompleksitas**: **Sedang – Tinggi (Titik Paling Rawan)**.
* **Evaluasi & Realita Teknis**:
  * Menjalankan Chromium Headless di background memakan RAM (~200MB–300MB) dan berisiko tersangkut saat server Mentari overload/down.
* **Mitigasi Risiko**:
  * **Strict Timeout (Maksimal 20 Detik) & Circuit Breaker**: Wajib pasang `browser.close()` di blok `finally` agar tidak ada *zombie process Chrome* yang menumpuk di RAM. Jika server down, aktifkan cooldown 30 menit.
  * **Auto Re-Authentication**: Menangani sesi cookie expired secara transparan.
  * **Dual-Mode Fallback**: Jika scraper gagal/timeout/Mentari down seharian, sistem tidak macet. Tombol manual di Dashboard Ketua Kelas tetap bisa 1-klik memicu broadcast pengumuman secara instan.

### C. Jadwal Pengingat (Cron: 00:00 WIB, 04:00 WIB, & Kamis 07:10 WIB H-1)
* **Tingkat Kompleksitas**: **Sangat Rendah (Zero Dependency Baru)**.
* **Evaluasi**:
  * Memanfaatkan scheduler `node-cron` yang sudah ada di proyek.
  * Proteksi pesan ganda (*deduplication*) murni menggunakan tabel `audit_logs` SQLite.
  * Tidak ada antrian pesan kompleks (Redis / RabbitMQ tidak dibutuhkan $\rightarrow$ *YAGNI*).

### D. Fitur Catatan Khusus Ketua Kelas (2 Scope)
* **Tingkat Kompleksitas**: **Sangat Rendah (Elegan & Ringkas)**.
* **Evaluasi**:
  * Cukup 2 kolom string biasa di database:
    * `meeting_sessions.notes` (Scope per pertemuan spesifik).
    * `subjects.general_notes` (Scope global mata kuliah).
  * Tanpa perlu membuat tabel relasi baru yang berbelit-belit.

### E. Dampak ke UI/UX Dashboard
* **Tingkat Kompleksitas**: **Rendah**.
* **Evaluasi**:
  * Menambahkan field catatan, link scraper, dan tombol bypass broadcast ke modal dialog yang sudah ada (`dialogEditMeeting`).
  * Tidak perlu mengubah layout dasar atau menambah halaman baru.
