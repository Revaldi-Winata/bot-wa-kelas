# Project Requirements & Technical Specifications
## Bot WhatsApp Informasi Kelas & Web Admin Dashboard

Dokumentasi spesifikasi rekayasa perangkat lunak (Software Engineering Specifications) terbagi menjadi modul-modul terpisah berikut:

---

## 📑 Index Dokumentasi Spesifikasi

| Dokumen | Deskripsi & Cakupan |
| :--- | :--- |
| **[architecture.md](file:///e:/my-projects/products/bot-wa-kelas/requirements/architecture.md)** | Arsitektur sistem level tinggi, interaksi antar komponen, pemilihan tech stack, dan topologi zero-cost cloud runtime. |
| **[database.md](file:///e:/my-projects/products/bot-wa-kelas/requirements/database.md)** | Skema database relasional (ERD Mermaid), definisi tabel (DDL), kamus data, tipe data, indeks, dan strategi query. |
| **[whatsapp-bot.md](file:///e:/my-projects/products/bot-wa-kelas/requirements/whatsapp-bot.md)** | Spesifikasi engine WhatsApp, matriks peran channel (Grup/DM), sinkronisasi dinamis whitelist, state machine navigasi angka, dan template pesan. |
| **[dashboard.md](file:///e:/my-projects/products/bot-wa-kelas/requirements/dashboard.md)** | Spesifikasi lengkap antarmuka Web Admin Dashboard, modul manajemen (Jadwal, Dosen, Tugas), pairing Web QR Code, dan telemetri. |
| **[gdrive-validator.md](file:///e:/my-projects/products/bot-wa-kelas/requirements/gdrive-validator.md)** | Integrasi Google Drive API v3 via Service Account, traversal struktur folder kelas, engine validasi format nama file (`[NAMA]_[NIM]_[EXTRA].[EXT]`), dan format laporan. |
| **[scheduler-reminder.md](file:///e:/my-projects/products/bot-wa-kelas/requirements/scheduler-reminder.md)** | Engine cron pengingat otomatis, jadwal milestone (H-3, H-2, H-1, H-0), perutean broadcast grup, dan strategi deduplikasi. |
| **[security-and-resilience.md](file:///e:/my-projects/products/bot-wa-kelas/requirements/security-and-resilience.md)** | Threat model, strategi anti-ban WhatsApp (rate limiter & jitter), backup snapshot otomatis, target RTO/RPO, dan arsitektur fault tolerance. |
| **[decision-log.md](file:///e:/my-projects/products/bot-wa-kelas/requirements/decision-log.md)** | Architecture Decision Record (ADR D01 s.d. D11) yang mencatat seluruh keputusan arsitektural yang telah disetujui. |
| **[re-creating_need.md](file:///e:/my-projects/products/bot-wa-kelas/requirements/re-creating_need.md)** | Master Software Requirements Specification (SRS) terpadu. |
