# Security, Backup & Resilience Specification
## Enterprise-Grade Reliability & Fault Tolerance Standards

---

## 1. Threat Model & Security Controls

| Vektor Ancaman | Dampak | Kontrol Mitigasi |
| :--- | :--- | :--- |
| **WhatsApp Spam / Aggressive Bot Detection** | Nomor bot diblokir/suspend oleh Meta | 1. **Tiered Rate Limiter**:<br>&nbsp;&nbsp;• Group Global: Max 12 response/min.<br>&nbsp;&nbsp;• Group Per-User: 4 RPM / 40 RPD.<br>&nbsp;&nbsp;• DM Per-User: 10 RPM / 100 RPD.<br>2. **Human Jitter Delay**: 1.000ms – 2.500ms.<br>3. Tidak melakukan cold/unsolicited outbound DM. |
| **Unsolicited DM Inbound Flood** | Server overload / database spike | Whitelist filter dinamis (`sock.groupMetadata`). Pesan dari non-member langsung di-drop (silent drop). |
| **Multi-User State Collisions in Group** | Sesi tertukar / race condition | Composite Session Key `${remoteJid}:${senderJid}` dalam in-memory LRU Cache dengan TTL 60s (Grup) dan 180s (DM). |
| **Malformed / Accidental Group Text Trigger** | Bot menyela obrolan manusia | **Strict Single-Token Parser** (`/^[0-9]$/` post-`trim()`). Teks obrolan grup tanpa quote diabaikan (*silent drop*). Max 3 retries. |
| **Brute-Force Login Dashboard** | Pengambilalihan akun Ketua Kelas | Rate limiter IP (5x gagal = ban 15 menit), bcrypt hashing (cost factor 12), JWT HttpOnly SameSite secure cookie. |
| **Google Service Account Abuse** | File GDrive terhapus/berubah | Service Account diatur strictly sebagai **Viewer (Read-Only)** pada Google Drive folder. |
| **ReDoS & Injection via Text Input** | Bot hang / SQL corruption | Parameterized SQL queries (prepared statements) & input length sanitization (< 500 chars). |

---

## 2. Backup & Disaster Recovery (DR) Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                    DAILY BACKUP ENGINE                       │
│                   (Setiap Hari 02:00 WIB)                    │
└──────────────────────────────┬───────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────────────┐   ┌───────────────────────────┐
│     DATABASE SNAPSHOT         │   │   WHATSAPP AUTH STATE     │
│  - Export SQLite dump / file  │   │  - Compress multi-file    │
│  - Encrypt with AES-256       │   │    session auth data      │
└──────────────┬────────────────┘   └─────────────┬─────────────┘
               │                                  │
               └──────────────────┬───────────────┘
                                  ▼
┌──────────────────────────────────────────────────────────────┐
│                  GOOGLE DRIVE BACKUP UPLOAD                  │
│       Upload ke folder `_Backup_Database` via Service Account│
└──────────────────────────────────────────────────────────────┘
```

### Disaster Recovery Metrics:
* **RTO (Recovery Time Objective)**: **< 5 Menit**. Deploy ulang image container baru, mount volume atau pull snapshot backup terbaru.
* **RPO (Recovery Point Objective)**: **< 24 Jam**. Kehilangan data maksimal 1 hari jika terjadi bencana fatal pada database hosting.
* **Cold Recovery Runbook**:
  1. Jalankan `docker run` dengan image build terbaru.
  2. Set `.env` (Service Account JSON & DB credentials).
  3. Buka Dashboard Web -> Scan ulang WhatsApp QR jika volume auth state hilang.

---

## 3. Fault Tolerance & Error Handling Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                     SYSTEM FAULT HANDLERS                     │
└──────────────┬────────────────────────────────────────────────┘
               │
   ┌───────────┴───────────┬──────────────────────┬────────────────────┐
   ▼                       ▼                      ▼                    ▼
[Socket Drop]      [Session Logged Out]  [GDrive Quota/Down]    [Fatal Exception]
   │                       │                      │                    │
   ▼                       ▼                      ▼                    ▼
Auto-Reconnect      Emit QR_REQUIRED       Circuit Breaker      Uncaught Trap
Exponential         Update Dashboard UI    Stale Cache Fallback Log to DB
Backoff (2s..30s)   Alert Admin via WA     Graceful WA Msg      Auto-Restart
```

### 3.1. Socket Connection Resilience (Baileys)
* Saat terjadi network glitch atau pemutusan WebSocket dari server WhatsApp:
  * Sistem mengeksekusi algoritma **Exponential Backoff**:
    `Delay = Min(InitialDelay * 2^(attempt), MaxDelay)`
    (2s -> 4s -> 8s -> 16s -> max 30s).
  * Menghindari reconnection-storm yang dapat memicu ban Meta.

### 3.2. WhatsApp Session Logged-Out Handling (401)
* Jika Meta mencabut sesi linked device:
  1. Sistem menghentikan loop reconnect untuk mencegah memory leak.
  2. Status dashboard diubah menjadi `QR_REQUIRED`.
  3. Sistem mencatat level `ERROR` pada `audit_logs` dan menampilkan QR code segar di dashboard.

### 3.3. Google Drive API Fault Tolerance
* Error `429 (Rate Limit)` atau `503 (Backend Unavailable)`: Retry maksimal 3x dengan jitter delay 1 detik.
* Kegagalan permanen: Mengembalikan pesan ramah di WhatsApp: *"⚠️ Layanan Google Drive sedang mengalami gangguan sementara. Silakan coba kembali beberapa saat lagi."*

### 3.4. Process Safety & Crash Prevention
* Global Handlers di level proses Node.js:
  ```typescript
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'FATAL: Uncaught Exception caught in root handler');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'FATAL: Unhandled Rejection caught in root handler');
  });
  ```
* Container dijalankan dengan restart policy `restart: unless-stopped`.
