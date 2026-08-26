# System Architecture Specification
## Bot WhatsApp Kelas & Web Admin Dashboard

---

## 1. High-Level Architecture

Sistem dirancang dengan arsitektur **Modular Monolith** terdegradasi yang memisahkan layer presentasi (WhatsApp Socket & Web Frontend) dari layer domain dan penyimpanan data terpusat.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            PRESENTATION LAYER                            │
│                                                                          │
│   ┌───────────────────────────┐          ┌───────────────────────────┐   │
│   │   WhatsApp Multi-Device   │          │     Web Admin Browser     │   │
│   │   (Baileys Socket Worker) │          │     (React / Vite UI)     │   │
│   └─────────────┬─────────────┘          └─────────────┬─────────────┘   │
└─────────────────┼──────────────────────────────────────┼─────────────────┘
                  │                                      │                  
                  ▼                                      ▼                  
┌──────────────────────────────────────────────────────────────────────────┐
│                             APPLICATION CORE                             │
│                                                                          │
│   ┌───────────────────────────┐          ┌───────────────────────────┐   │
│   │     WhatsApp Engine       │          │      Admin REST / API     │   │
│   │  - State Machine Parser   │          │  - Auth & Session Guard   │   │
│   │  - Rate Limiter & Jitter  │          │  - CRUD Controllers       │   │
│   │  - Whitelist Dynamic Sync │          │  - Regex Token Compiler   │   │
│   │  - Composite Session LRU  │          │                           │   │
│   └─────────────┬─────────────┘          └─────────────┬─────────────┘   │
│                 │                                      │                 │
│                 ├──────────────────┬───────────────────┤                 │
│                 ▼                  ▼                   ▼                 │
│   ┌───────────────────────────┐  ┌───────────────────────────┐           │
│   │     Milestone Scheduler   │  │   GDrive Traversal Engine │           │
│   │  - Cron Cadence (H-3..H-0)│  │   - Service Account v3    │           │
│   │  - Multi-group Router     │  │   - Regex File Matcher    │           │
│   └─────────────┬─────────────┘  └─────────────┬─────────────┘           │
└─────────────────┼──────────────────────────────┼─────────────────────────┘
                  │                              │                          
                  ▼                              ▼                          
┌──────────────────────────────────────────────────────────────────────────┐
│                        DATA & INFRASTRUCTURE LAYER                       │
│                                                                          │
│   ┌───────────────────────────┐          ┌───────────────────────────┐   │
│   │   Unified Database        │          │   External Cloud Services │   │
│   │   (Turso SQLite/Supabase) │          │   - Google Drive API v3   │   │
│   │   - Persistent Schema     │          │   - Supabase Storage (CDN)│   │
│   └───────────────────────────┘          └───────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Descriptions

### A. WhatsApp Socket Worker (`@whiskeysockets/baileys`)
* Beroperasi sebagai long-running persistent daemon.
* Mempertahankan koneksi WebSocket ke server WhatsApp Meta.
* Menerima event pesan, mengarahkan ke State Machine Router, dan mengirim respon terformat.
* Menyinkronkan daftar anggota grup secara reaktif via event `group-participants.update`.

### B. Admin Dashboard Server (Fastify / Hono Monolith)
* Menyediakan REST API untuk pengelolaan data akademik (Jadwal, Dosen, Tugas).
* Menangani autentikasi admin berbasis JWT dalam HTTP-Only Secure Cookie.
* Menyajikan antarmuka visual (Single Page Application) untuk Ketua Kelas.
* Menjembatani live WhatsApp session status dan Web QR pairing ke browser.

### C. Google Drive Traversal Engine
* Menghubungkan bot ke Google Drive API v3 tanpa OAuth interaktif (menggunakan Google Cloud Service Account).
* Menelusuri pohon hierarki: `Root Kelas` -> `Mata Kuliah` -> `Pertemuan` -> `Tugas` -> `File Mahasiswa`.
* Memvalidasi nama file terhadap regex yang telah dikompilasi.

### D. Milestone Scheduler Engine (`node-cron`)
* Cron worker internal yang berjalan di dalam proses Node.js.
* Menjalankan evaluasi berkala terhadap tanggal & jam deadline tugas aktif.
* Menembakkan broadcast notifikasi terformat ke Grup Utama Kelas dan Grup Mata Kuliah sesuai jadwal H-3, H-2, H-1, dan H-0.

---

## 3. Concurrency & Multi-User State Isolation Architecture

Untuk mencegah *race condition* saat banyak pengguna berinteraksi di dalam grup kelas secara simultan:
1. **Composite Session Key**: Setiap sesi diindeks unik dengan key `${remoteJid}:${senderJid}` dalam In-Memory LRU Cache.
2. **Asynchronous Non-Blocking Pipeline**: Seluruh operasi I/O (Database read, GDrive metadata fetch) dijalankan secara asinkron via `async/await`.
3. **Session TTL & Eviction**:
   * Sesi di Grup: TTL 60 detik (auto-expire cepat untuk mereduksi noise grup).
   * Sesi di DM: TTL 180 detik.

---

## 4. Technology Stack Rationale

| Komponen | Pilihan Teknologi | Alasan / Rationale |
| :--- | :--- | :--- |
| **Runtime** | Node.js v20+ (TypeScript) | Ekosistem Baileys stabil, memory footprint rendah, type-safety tinggi. |
| **WhatsApp Library** | `@whiskeysockets/baileys` | Native WebSocket level, tidak butuh Chrome/Puppeteer, konsumsi RAM < 80MB. |
| **Database** | Turso (libSQL Cloud) / SQLite | Serverless, latency ultra-rendah (< 10ms), zero-cost free tier, backup portabel. |
| **Dashboard API** | Fastify / Hono | Startup time instan (< 100ms), throughput tinggi, memory overhead minimal. |
| **Dashboard UI** | React (Vite) + CSS | Ringan, reaktif, responsif pada perangkat mobile Ketua Kelas. |
| **Google Cloud** | `googleapis` (Drive v3) | Resmi, stabil, otentikasi headless via Service Account key. |
| **Scheduler** | `node-cron` | Lightweight in-memory scheduler, tidak membutuhkan Redis / external queue. |

---

## 5. Zero-Cost Infrastructure & Deployment Topology

```
┌─────────────────────────────────────────────────────────────────┐
│              FREE TIER CLOUD RUNTIME (Fly.io / VPS)             │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Docker Container                       │  │
│  │  - WhatsApp Socket Daemon (Baileys)                       │  │
│  │  - Fastify / Hono API & Dashboard Static Host             │  │
│  │  - Internal Cron Scheduler                                │  │
│  └─────────────────────────────┬─────────────────────────────┘  │
│                                │ Persistent Volume Mount        │
│                                ▼ (/data/auth_info_baileys)      │
└────────────────────────────────┼────────────────────────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
┌─────────────────────────────┐             ┌─────────────────────┐
│  Turso Cloud / Supabase DB  │             │  Google Drive API   │
│  - Zero Cost Free Tier      │             │  - Free 15GB Cloud  │
│  - 99.99% Cloud Managed     │             │  - Service Account  │
└─────────────────────────────┘             └─────────────────────┘
```

* **Zero Operational Cost**: Seluruh stack beroperasi 100% di bawah kuota gratis tanpa kartu kredit/tagihan bulanan.
* **Persistent Session**: Kredensial autentikasi WhatsApp disimpan di mount volume untuk mencegah QR scan ulang saat container di-restart.
