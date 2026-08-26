import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { db } from '../db/index.js';
import { sessionManager, SessionState } from './state.js';
import { rateLimiter } from './rate-limiter.js';
import { isSenderWhitelisted } from './whitelist.js';
import { handleTodaySchedule, handleThisWeekSchedule, handleScheduleDaySelection } from './handlers/schedule.js';
import { handleLecturerContactSelection } from './handlers/lecturers.js';
import { handleAssignmentList } from './handlers/assignments.js';
import { logAudit } from '../db/audit.js';
import pino from 'pino';

const logger = pino({ name: 'bot-router' });

export async function handleIncomingMessage(sock: WASocket, msg: WAMessage): Promise<void> {
  if (!msg.message || msg.key.fromMe) return;

  const remoteJid = msg.key.remoteJid;
  const isGroup = remoteJid?.endsWith('@g.us');
  const senderJid = isGroup ? msg.key.participant || '' : remoteJid || '';

  if (!remoteJid || !senderJid) return;

  // Extract Text Content
  const rawInput = (
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    ''
  ).trim();

  if (!rawInput) return;

  // Quoted Context Check
  const isQuotedReply = Boolean(msg.message.extendedTextMessage?.contextInfo?.quotedMessage);

  // Whitelist Protection (DM: friendly alert, Group: silent ignore)
  const isWhitelisted = await isSenderWhitelisted(senderJid);
  if (!isWhitelisted) {
    if (!isGroup && (rawInput.toLowerCase() === '/menu' || rawInput.toLowerCase() === 'menu' || rawInput.toLowerCase() === '/start')) {
      await rateLimiter.applyJitterDelay();
      await sock.sendMessage(remoteJid, {
        text: '⛔ *Akses Ditolak*\nNomor Anda belum terdaftar di whitelist anggota kelas 07TPLP025. Silakan hubungi Ketua Kelas untuk pendaftaran.',
      });
      await logAudit('BOT_MESSAGE', `Akses ditolak (Non-whitelist) dari ${senderJid.split('@')[0]}`, 'WARN', { senderJid, rawInput });
    }
    return;
  }

  // Group Protection: Bot can ONLY be used interactively in Main Class Group
  if (isGroup) {
    const { getMainClassGroupJid } = await import('./whitelist.js');
    const mainGroupJid = await getMainClassGroupJid();
    if (mainGroupJid && remoteJid !== mainGroupJid) {
      return;
    }
  }

  // Rate Limiting Protection (Anti-Spam & Concurrency limit)
  if (rateLimiter.isRateLimited(remoteJid, senderJid, Boolean(isGroup))) {
    return;
  }

  const cleanInput = rawInput.toLowerCase().replace(/^\//, '').trim();

  // --- PRIVATE DM ONLY DIRECT SHORTCUTS ---
  if (!isGroup) {
    // 1. Jadwal Shortcuts in DM
    if (cleanInput === 'jadwal' || cleanInput === 'jadwal hari ini' || cleanInput === 'jadwal now' || cleanInput === 'jadwalkuliah') {
      sessionManager.clearSession(remoteJid, senderJid);
      await rateLimiter.applyJitterDelay();
      await handleTodaySchedule(sock, remoteJid);
      await logAudit('BOT_MESSAGE', `Direct shortcut jadwal hari ini via DM (${senderJid.split('@')[0]})`, 'INFO', { remoteJid, senderJid });
      rateLimiter.recordResponse(remoteJid, senderJid);
      return;
    }

    const matchJadwalDay = /^jadwal\s+(senin|selasa|rabu|kamis|jumat|sabtu|minggu|[1-7]|semua|all)$/i.exec(cleanInput);
    if (matchJadwalDay) {
      sessionManager.clearSession(remoteJid, senderJid);
      const dayStr = matchJadwalDay[1].toLowerCase();
      const dayMap: Record<string, number> = {
        senin: 1, '1': 1,
        selasa: 2, '2': 2,
        rabu: 3, '3': 3,
        kamis: 4, '4': 4,
        jumat: 5, '5': 5,
        sabtu: 6, '6': 6,
        minggu: 7, '7': 7, semua: 7, all: 7,
      };
      const targetDay = dayMap[dayStr] || 1;
      await rateLimiter.applyJitterDelay();
      await handleScheduleDaySelection(sock, remoteJid, targetDay);
      await logAudit('BOT_MESSAGE', `Direct shortcut jadwal hari ${dayStr} via DM (${senderJid.split('@')[0]})`, 'INFO', { remoteJid, senderJid, targetDay });
      rateLimiter.recordResponse(remoteJid, senderJid);
      return;
    }

    // 2. Tugas & Deadline Shortcut in DM
    if (cleanInput === 'tugas' || cleanInput === 'tugas aktif' || cleanInput === 'deadline' || cleanInput === 'pr') {
      sessionManager.clearSession(remoteJid, senderJid);
      await rateLimiter.applyJitterDelay();
      await handleAssignmentList(sock, remoteJid);
      await logAudit('BOT_MESSAGE', `Direct shortcut tugas via DM (${senderJid.split('@')[0]})`, 'INFO', { remoteJid, senderJid });
      rateLimiter.recordResponse(remoteJid, senderJid);
      return;
    }

    // 3. Kontak Dosen Shortcut in DM
    if (cleanInput === 'dosen' || cleanInput === 'kontak dosen' || cleanInput === 'nomor dosen') {
      sessionManager.clearSession(remoteJid, senderJid);
      await rateLimiter.applyJitterDelay();
      await handleLecturerContactSelection(sock, remoteJid, 0);
      await logAudit('BOT_MESSAGE', `Direct shortcut kontak dosen via DM (${senderJid.split('@')[0]})`, 'INFO', { remoteJid, senderJid });
      rateLimiter.recordResponse(remoteJid, senderJid);
      return;
    }

  }

  // Trigger: /menu or /start or menu or help
  if (cleanInput === 'menu' || cleanInput === 'start' || cleanInput === 'help' || cleanInput === 'bantuan') {
    sessionManager.setSession(remoteJid, senderJid, {
      state: 'AWAIT_MAIN_MENU',
      availableOptions: [0, 1, 2, 3],
      retryCount: 0,
    });

    await rateLimiter.applyJitterDelay();

    const menuText = isGroup
      ? '👋 *BOT KELAS 07TPLP025*\n\n' +
        'Balas dengan *ANGKA* menu pilihan Anda:\n\n' +
        '1️⃣ *Jadwal Kuliah*\n' +
        '2️⃣ *Kontak Dosen*\n' +
        '3️⃣ *Tugas & Deadline*\n' +
        '0️⃣ *Batal / Keluar*\n\n' +
        '_Balas hanya dengan satu angka (contoh: 1)._'
      : '👋 *BOT KELAS 07TPLP025*\n\n' +
        'Balas dengan *ANGKA* menu pilihan Anda:\n\n' +
        '1️⃣ *Jadwal Kuliah*\n' +
        '2️⃣ *Kontak Dosen*\n' +
        '3️⃣ *Tugas & Deadline*\n' +
        '0️⃣ *Batal / Keluar*\n\n' +
        '💡 *Tips Cepat:* Anda juga bisa langsung mengetik:\n' +
        '• `jadwal`\n' +
        '• `jadwal senin` / `jadwal selasa`\n' +
        '• `tugas`\n' +
        '• `dosen`';

    await sock.sendMessage(remoteJid, { text: menuText });
    await logAudit('BOT_MESSAGE', `Kirim menu utama ke ${isGroup ? 'Grup' : 'DM'} (${senderJid.split('@')[0]})`, 'INFO', { remoteJid, senderJid, trigger: rawInput });
    rateLimiter.recordResponse(remoteJid, senderJid);
    return;
  }

  // Check active session for state machine
  const session = sessionManager.getSession(remoteJid, senderJid);
  if (!session || session.state === 'IDLE') {
    return;
  }

  // Strict Single-Token Parser
  const isStrictDigit = /^[0-9]$/.test(rawInput);
  const selectedNumber = isStrictDigit ? Number(rawInput) : -1;
  const isOptionValid = isStrictDigit && session.availableOptions.includes(selectedNumber);

  if (!isOptionValid) {
    const { isTerminated } = sessionManager.recordInvalidAttempt(remoteJid, senderJid);

    if (isTerminated) {
      if (!isGroup || isQuotedReply) {
        await rateLimiter.applyJitterDelay();
        await sock.sendMessage(remoteJid, {
          text: '⚠️ *Sesi dibatalkan* karena pilihan tidak valid. Ketik `/menu` untuk memulai kembali.',
        });
      }
      return;
    }

    await rateLimiter.applyJitterDelay();
    await sock.sendMessage(remoteJid, {
      text: '⚠️ *Pilihan tidak valid!*\nMohon balas *hanya dengan angka* yang tertera pada menu, atau ketik *0* untuk membatalkan.',
    });
    rateLimiter.recordResponse(remoteJid, senderJid);
    return;
  }

  // Handle Option 0: Cancel Session
  if (selectedNumber === 0) {
    sessionManager.clearSession(remoteJid, senderJid);
    await rateLimiter.applyJitterDelay();
    await sock.sendMessage(remoteJid, {
      text: '✅ *Sesi menu ditutup.* Ketik `/menu` kapan saja jika membutuhkan informasi.',
    });
    await logAudit('BOT_MESSAGE', `Sesi ditutup (${senderJid.split('@')[0]})`, 'INFO', { remoteJid, senderJid });
    rateLimiter.recordResponse(remoteJid, senderJid);
    return;
  }

  // State: AWAIT_MAIN_MENU
  if (session.state === 'AWAIT_MAIN_MENU') {
    if (selectedNumber === 1) {
      if (isGroup) {
        sessionManager.setSession(remoteJid, senderJid, { state: 'AWAIT_SCHEDULE_DAY', availableOptions: [0, 1, 2, 7], retryCount: 0 });
        await rateLimiter.applyJitterDelay();
        await sock.sendMessage(remoteJid, {
          text: '📅 *JADWAL KULIAH KELAS*\n\n1️⃣ *Jadwal Minggu Ini*\n2️⃣ *Lihat Semua Hari*\n0️⃣ *Batal*\n\n_Balas dengan angka 1, 2, atau 0._',
        });
      } else {
        sessionManager.setSession(remoteJid, senderJid, { state: 'AWAIT_SCHEDULE_DAY', availableOptions: [0, 1, 2, 3, 4, 5, 6, 7], retryCount: 0 });
        await rateLimiter.applyJitterDelay();
        await sock.sendMessage(remoteJid, {
          text: '📅 *PILIH HARI JADWAL KULIAH*\n\n1️⃣ *Senin*\n2️⃣ *Selasa*\n3️⃣ *Rabu*\n4️⃣ *Kamis*\n5️⃣ *Jumat*\n6️⃣ *Sabtu*\n7️⃣ *Lihat Semua Hari*\n\n_Balas dengan angka (1-7) atau 0 untuk kembali._',
        });
      }
      rateLimiter.recordResponse(remoteJid, senderJid);
      return;
    }

    if (selectedNumber === 2) {
      sessionManager.clearSession(remoteJid, senderJid);
      await rateLimiter.applyJitterDelay();
      await handleLecturerContactSelection(sock, remoteJid, 0);
      rateLimiter.recordResponse(remoteJid, senderJid);
      return;
    }

    if (selectedNumber === 3) {
      sessionManager.clearSession(remoteJid, senderJid);
      await rateLimiter.applyJitterDelay();
      await handleAssignmentList(sock, remoteJid);
      rateLimiter.recordResponse(remoteJid, senderJid);
      return;
    }
  }

  // State: AWAIT_SCHEDULE_DAY
  if (session.state === 'AWAIT_SCHEDULE_DAY') {
    sessionManager.clearSession(remoteJid, senderJid);
    await rateLimiter.applyJitterDelay();

    if (isGroup && selectedNumber === 1) {
      await handleThisWeekSchedule(sock, remoteJid);
    } else if (isGroup && (selectedNumber === 2 || selectedNumber === 7)) {
      await handleScheduleDaySelection(sock, remoteJid, 7);
    } else {
      await handleScheduleDaySelection(sock, remoteJid, selectedNumber);
    }

    rateLimiter.recordResponse(remoteJid, senderJid);
    return;
  }
}
