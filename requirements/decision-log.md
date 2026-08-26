# Decision Log (ADR)

!Write in this section for finalized and agreed-upon decisions. Format: Dxx - Title - Summary

---

### D01 - Core Scope Trimming (Academic Course Entities Only)
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Initial requirements included broad academic scopes (Pra-UAPS/UAPS, TOEFL, UJIKOM) which increase domain complexity and maintenance overhead.
* **Decision**: Limit the system scope strictly to 3 core course-related entities: **Jadwal Kuliah**, **Kontak Dosen**, and **Tugas / Project Kuliah**. Drop UAPS, TOEFL, and UJIKOM.
* **Consequences**: Streamlined data schema, faster MVP delivery, focused UX for daily student needs.

---

### D02 - Elimination of Web Scraping in Favor of Single Admin Dashboard
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Academic portals are frequently down during peak traffic, have unstable DOM structures, and introduce cron/scraping fragility.
* **Decision**: Cancel all automated web scraping and background cron jobs. All operational data is managed manually via a dedicated Web Admin Dashboard by the Class Representative (Ketua Kelas).
* **Consequences**: Zero latency dependency on external campus servers, zero scraper breakage, 100% data predictability.

---

### D03 - Strict Single-Paradigm Text Interaction (Numbered State Machine)
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Providing multiple interaction models (buttons, slash commands with parameters, and numbered menus) creates user cognitive overload and parsing ambiguity.
* **Decision**: Standardize on a single, strict numbered menu navigation flow triggered by `menu` / `/menu`. Users progress through stateful numbered replies (`1`, `2`, `3`, etc.) with `0` for back/exit. Eliminate inline command parameters.
* **Consequences**: Zero user confusion, predictable state machine parser, 100% cross-device consistency across all WhatsApp clients.

---

### D04 - Decoupled External Storage Strategy for Media & Binary Assets
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Free-tier cloud runtimes use ephemeral filesystems and strictly constrained disk quotas (< 512MB).
* **Decision**: The bot runtime remains strictly stateless. Images are hosted on free cloud storage (Supabase Storage / ImgBB) and streamed as WhatsApp media buffers. File templates and lecture materials use direct Google Drive links.
* **Consequences**: Prevents server out-of-disk crashes, supports seamless zero-downtime redeployments.

---

### D05 - Root-Level Google Drive Hierarchy Inspection via Service Account
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Creating task-by-task share permissions creates high operational friction for the class representative.
* **Decision**:
  1. The class representative creates a single Root Class Folder (e.g., `07TPLP025`) and shares it once to the Google Service Account email.
  2. The system dynamically traverses the internal hierarchy: `Root` -> `Mata Kuliah` -> `Pertemuan` -> `Tugas` -> `Files`.
* **Consequences**: Zero repetitive folder sharing, automated recursive file metadata inspection.

---

### D06 - Unified Database Architecture (Single Source of Truth)
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: The Web Dashboard and WhatsApp Bot must synchronize data updates instantly without requiring bot process restarts.
* **Decision**: Both the Web Dashboard (Next.js/Hono/Fastify) and the WhatsApp Bot (Baileys) connect to a shared database (Cloud SQLite/Turso or Supabase PostgreSQL).
* **Consequences**: Real-time read consistency (< 10ms), decoupled deployments between dashboard frontend and bot worker.

---

### D07 - Dynamic Group Whitelist for Zero-Maintenance DM Authorization
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Allowing public DM invites spam/abuse, while manually whitelisting student phone numbers is error-prone and burdensome.
* **Decision**: Dynamically fetch and cache member phone numbers from the Main Class WhatsApp Group via `sock.groupMetadata()`. DM queries are only processed if the sender's JID exists in the cached participant list. Unlisted senders are silently ignored or rejected.
* **Consequences**: Zero manual phone number entry, automatic revocation when a student leaves the class group.

---

### D08 - Role-Based Scope & Multi-Group Behavior Architecture
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Adding the bot to subject-specific groups (Grup Mata Kuliah) risks spamming group chats with command replies.
* **Decision**:
  * **Main Class Group**: Full Interactive Menu (`/menu`) + Automated Reminders.
  * **Direct Message (DM)**: Full Interactive Menu (`/menu`) for whitelisted members.
  * **Subject-Specific Groups (Grup Matkul)**: **Silent Mode / Scheduler Only**. Interactive commands are ignored; only automated assignment reminders relevant to that subject are broadcasted.
* **Consequences**: Zero group chat noise, clear separation of operational contexts.

---

### D09 - Automated Milestone Task Reminders (H-3, H-2, H-1, H-0)
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Students frequently miss deadlines without timely cadence reminders.
* **Decision**: Implement an internal lightweight cron scheduler checking upcoming assignment deadlines every morning/evening, firing automated notification broadcasts at H-3, H-2, H-1, and H-0 (Day of Deadline) to designated groups.
* **Consequences**: Proactive notifications with minimal compute overhead (< 1 check/hour).

---

### D10 - Standardized File Naming Convention with Wildcard Suffix
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Student file naming conventions must enforce student identity (`NAMA`, `NIM`) while allowing flexibility for assignment title/description suffixes.
* **Decision**: Standardize default pattern to `[NAMA]_[NIM]_[EXTRA].[EXT]` where `[EXTRA]` is treated as an optional/ignored wildcard string. Regex engine validates: `^([A-Za-z\s]+)_([0-9]+)(?:_.*)?\.(ext1|ext2)$`.
* **Consequences**: Deterministic extraction of Student Name and NIM while tolerating student descriptive additions.

---

### D11 - Defense-in-Depth Security, Backup & Error Handling Standard
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Low-resource/free-tier hosting introduces risks of network drops, session loss, rate limit bans, and unauthorized dashboard access.
* **Decision**:
  * **Security**: Per-user WhatsApp rate limiting (anti-spam ban), JWT HttpOnly auth, brute-force IP lockout.
  * **Backup**: Automated daily SQLite snapshot / Cloud DB replication, persistent auth credentials storage.
  * **Error Handling**: Exponential reconnect backoff for Baileys socket, Google Drive API 429/403 circuit breaker, graceful fallback WhatsApp messages.
* **Consequences**: 99.9% uptime on $0 infrastructure, zero session desync, protected from abuse.

---

### D12 - Composite Session Concurrency & Hybrid Quote Reply UX
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Multiple users interacting in the same class group simultaneously cause session state collisions and race conditions, while forcing quote-replies in DM degrades UX.
* **Decision**:
  1. Isolate user sessions using a Composite Session Key: `${remoteJid}:${senderJid}` in an In-Memory LRU Cache with TTL (60s for Groups, 180s for DM).
  2. Implement **Hybrid Reply UX**:
     * **DM**: Direct number reply (no quote needed).
     * **Group**: Hybrid detection (accepts quoted replies OR direct numbers if sender has an active session; silently drops random number inputs from users without active sessions).
* **Consequences**: Zero session crosstalk across concurrent group users, frictionless DM experience, zero accidental group chat triggers.

---

### D13 - Tiered Rate Limiting Hierarchy (Global Group vs Per-User RPM/RPD)
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Free-for-all bot usage in groups risks spam bans from Meta and floods group chats with noise.
* **Decision**:
  * **Group Global Cooldown**: Max 12 bot responses / minute per group (throttles and prompts users to move to DM when exceeded).
  * **Group Per-User**: Max 4 RPM / 40 RPD per student.
  * **DM Per-User**: Max 10 RPM / 100 RPD per student.
* **Consequences**: Protects bot account from Meta anti-spam heuristics, prevents group flood noise, gives generous individual quotas in DM.

---

### D14 - Strict Single-Token Input Validation & Context-Aware Error Handling
* **Date**: 2026-08-25
* **Status**: Accepted
* **Context**: Permissive input matching causes accidental bot triggers when users type conversational messages, while messy string noise (e.g. `'1 adwada'`) breaks state machine integrity.
* **Decision**:
  1. Enforce strict single-token validation (`/^[0-9]$/` post-`trim()`). Reject any input containing extra characters, words, or out-of-range digits.
  2. **Error Handling**:
     * **DM**: Send informative guidance message; maintain state.
     * **Group (Quoted)**: Send concise 1-line error message; maintain state.
     * **Group (Unquoted Chat)**: Silently drop input to avoid interrupting human conversations.
  3. **Circuit Breaker**: Terminate session after 3 consecutive invalid inputs.
* **Consequences**: Zero misinterpretation of normal group conversation, deterministic parsing, robust against spam loops.