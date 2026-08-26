import { WASocket } from '@whiskeysockets/baileys';
import { db } from '../../db/index.js';

const DAY_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

function formatSessionTypeName(type: string): string {
  if (type === 'OFFLINE') return 'Tatap Muka (OFFLINE)';
  if (type === 'ELEARNING') return 'E-Learning (LMS Mentari)';
  if (type === 'ZOOM') return 'Online (Zoom / Kuliah Virtual)';
  if (type === 'LIBUR') return 'LIBUR / Ditiadakan';
  if (type === 'UTS') return 'Ujian Tengah Semester (UTS)';
  if (type === 'UAS') return 'Ujian Akhir Semester (UAS)';
  return type || 'OFFLINE';
}

/**
 * Direct Shortcut: Today's and Tomorrow's Schedule (Instant 0-Click Value)
 */
export async function handleTodaySchedule(sock: WASocket, remoteJid: string): Promise<void> {
  const nowUtc = new Date();
  const wibDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(nowUtc);

  const todayWib = new Date(wibDateStr + 'T00:00:00Z');
  const todayDayNum = todayWib.getUTCDay() === 0 ? 7 : todayWib.getUTCDay();

  // Tomorrow Date
  const tomorrowWib = new Date(todayWib);
  tomorrowWib.setUTCDate(todayWib.getUTCDate() + 1);
  const tomorrowDateStr = tomorrowWib.toISOString().split('T')[0];
  const tomorrowDayNum = tomorrowWib.getUTCDay() === 0 ? 7 : tomorrowWib.getUTCDay();

  // Fetch Today's Meetings
  const todayRes = await db.execute({
    sql: `
      SELECT ms.*, s.name as subject_name, s.sks as subject_sks, s.general_notes,
             l.name as lecturer_name, l.phone as lecturer_phone
      FROM meeting_sessions ms
      JOIN subjects s ON ms.subject_id = s.id
      LEFT JOIN lecturers l ON s.lecturer_id = l.id
      WHERE ms.session_date = ?
      ORDER BY ms.start_time ASC
    `,
    args: [wibDateStr],
  });

  // Fetch Tomorrow's Meetings
  const tomorrowRes = await db.execute({
    sql: `
      SELECT ms.*, s.name as subject_name, s.sks as subject_sks, s.general_notes,
             l.name as lecturer_name, l.phone as lecturer_phone
      FROM meeting_sessions ms
      JOIN subjects s ON ms.subject_id = s.id
      LEFT JOIN lecturers l ON s.lecturer_id = l.id
      WHERE ms.session_date = ?
      ORDER BY ms.start_time ASC
    `,
    args: [tomorrowDateStr],
  });

  let msg = `📅 *JADWAL KULIAH HARI INI*\n`;
  msg += `🗓 Tanggal: ${wibDateStr} (${DAY_NAMES[todayDayNum].toUpperCase()})\n\n`;

  if (todayRes.rows.length === 0) {
    const nextUpcomingRes = await db.execute({
      sql: `
        SELECT ms.*, s.name as subject_name, s.sks as subject_sks, s.general_notes, l.name as lecturer_name
        FROM meeting_sessions ms
        JOIN subjects s ON ms.subject_id = s.id
        LEFT JOIN lecturers l ON s.lecturer_id = l.id
        WHERE ms.session_date >= ?
        ORDER BY ms.session_date ASC, ms.start_time ASC
        LIMIT 2
      `,
      args: [wibDateStr],
    });

    msg += `_Tidak ada perkuliahan hari ini (Libur / Bebas Kelas)._\n\n`;

    if (nextUpcomingRes.rows.length > 0) {
      msg += `📌 *JADWAL PERKULIAHAN TERDEKAT:*\n`;
      nextUpcomingRes.rows.forEach((m: any, idx) => {
        msg +=
          `${idx + 1}. *${m.subject_name}* (${m.subject_sks} SKS)\n` +
          `   🗓 Tanggal: *${m.session_date}* (P${m.meeting_number} • Minggu ${m.week_number})\n` +
          `   ⏰ Waktu: ${m.start_time || '08:00'} - ${m.end_time || '10:30'} WIB\n` +
          `   📍 Ruang: ${m.room || 'Kelas'}\n` +
          `   📌 Status: *${formatSessionTypeName(m.session_type)}*\n` +
          `   👨‍🏫 Dosen: ${m.lecturer_name || 'Belum diatur'}\n` +
          (m.notes ? `   📝 Catatan: ${m.notes}\n` : '') +
          '\n';
      });
    }
  } else {
    todayRes.rows.forEach((m: any, idx) => {
      msg +=
        `${idx + 1}. *${m.subject_name}* (${m.subject_sks} SKS)\n` +
        `   📖 Pertemuan: Ke-${m.meeting_number} (Minggu Ke-${m.week_number})\n` +
        `   ⏰ Waktu: ${m.start_time || '08:00'} - ${m.end_time || '10:30'} WIB\n` +
        `   📍 Ruang: ${m.room || 'Kelas'}\n` +
        `   📌 Status: *${formatSessionTypeName(m.session_type)}*\n` +
        `   👨‍🏫 Dosen: ${m.lecturer_name || 'Belum diatur'}\n` +
        (m.notes ? `   📝 Catatan Sesi: ${m.notes}\n` : '') +
        (m.general_notes ? `   📌 Info Matkul: ${m.general_notes}\n` : '') +
        '\n';
    });
  }

  // Tomorrow Preview
  if (tomorrowRes.rows.length > 0) {
    msg += `🔮 *BESOK (${DAY_NAMES[tomorrowDayNum].toUpperCase()}, ${tomorrowDateStr}):*\n`;
    tomorrowRes.rows.forEach((m: any) => {
      msg += `• *${m.subject_name}* (P${m.meeting_number} - ${formatSessionTypeName(m.session_type)}) → ${m.start_time || '08:00'} WIB (${m.room || 'Kelas'})\n`;
    });
    msg += '\n';
  }

  msg += '_Ketik `/menu` untuk membuka menu lainnya._';
  await sock.sendMessage(remoteJid, { text: msg });
}

/**
 * Group Shortcut: All active sessions for this current week
 */
export async function handleThisWeekSchedule(sock: WASocket, remoteJid: string): Promise<void> {
  const nowUtc = new Date();
  const wibDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(nowUtc);

  // Find nearest active week number
  const weekQuery = await db.execute({
    sql: `
      SELECT week_number FROM meeting_sessions
      WHERE session_date >= ?
      ORDER BY session_date ASC LIMIT 1
    `,
    args: [wibDateStr],
  });

  const targetWeek = (weekQuery.rows[0] as any)?.week_number || 1;

  const weekSessions = await db.execute({
    sql: `
      SELECT ms.*, s.name as subject_name, s.sks as subject_sks, s.general_notes,
             l.name as lecturer_name, l.phone as lecturer_phone
      FROM meeting_sessions ms
      JOIN subjects s ON ms.subject_id = s.id
      LEFT JOIN lecturers l ON s.lecturer_id = l.id
      WHERE ms.week_number = ?
      ORDER BY ms.session_date ASC, ms.start_time ASC
    `,
    args: [targetWeek],
  });

  if (weekSessions.rows.length === 0) {
    await handleScheduleDaySelection(sock, remoteJid, 7);
    return;
  }

  let text = `📅 *JADWAL KULIAH MINGGU INI (MINGGU KE-${targetWeek})*\n\n`;
  let curDate = '';

  weekSessions.rows.forEach((m: any, idx) => {
    if (m.session_date !== curDate) {
      curDate = m.session_date;
      const d = new Date(curDate + 'T00:00:00Z');
      const dayName = DAY_NAMES[d.getUTCDay() === 0 ? 7 : d.getUTCDay()];
      text += `📌 *=== ${dayName.toUpperCase()}, ${curDate} ===*\n`;
    }

    text +=
      `${idx + 1}. *${m.subject_name}* (${m.subject_sks} SKS)\n` +
      `   📖 Pertemuan: Ke-${m.meeting_number}\n` +
      `   ⏰ Waktu: ${m.start_time || '08:00'} - ${m.end_time || '10:30'} WIB\n` +
      `   📍 Ruang: ${m.room || 'Kelas'}\n` +
      `   📌 Status: *${formatSessionTypeName(m.session_type)}*\n` +
      `   👨‍🏫 Dosen: ${m.lecturer_name || 'Belum diatur'}\n` +
      (m.notes ? `   📝 Catatan: ${m.notes}\n` : '') +
      '\n';
  });

  text += '_Ketik `/menu` untuk membuka menu lainnya._';
  await sock.sendMessage(remoteJid, { text });
}

/**
 * Handles Specific Day Schedule with Guaranteed Date, Status, Room & Notes
 */
export async function handleScheduleDaySelection(
  sock: WASocket,
  remoteJid: string,
  choice: number
): Promise<void> {
  if (choice === 7) {
    // All Days Overview
    const scheduleRes = await db.execute(`
      SELECT sc.day_of_week, sc.start_time, sc.end_time, sc.room,
             s.name as subject_name, s.sks as subject_sks, l.name as lecturer_name
      FROM schedules sc
      JOIN subjects s ON sc.subject_id = s.id
      LEFT JOIN lecturers l ON s.lecturer_id = l.id
      ORDER BY sc.day_of_week ASC, sc.start_time ASC
    `);

    if (scheduleRes.rows.length === 0) {
      await sock.sendMessage(remoteJid, {
        text: '📅 *JADWAL KULIAH KELAS*\n\n_Belum ada master jadwal perkuliahan terdaftar._',
      });
      return;
    }

    let schedText = '📅 *JADWAL KULIAH LENGKAP*\n\n';
    let currentDay = -1;

    scheduleRes.rows.forEach((s: any, idx) => {
      const dayNum = s.day_of_week as number;
      if (dayNum !== currentDay) {
        currentDay = dayNum;
        schedText += `📌 *=== ${DAY_NAMES[dayNum].toUpperCase()} ===*\n`;
      }

      schedText +=
        `${idx + 1}. *${s.subject_name}* (${s.subject_sks} SKS)\n` +
        `   ⏰ ${s.start_time} - ${s.end_time} WIB\n` +
        `   📍 Ruang: ${s.room}\n` +
        `   👨‍🏫 ${s.lecturer_name || 'Belum ada informasi...'}\n\n`;
    });

    schedText += '_Ketik `/menu` untuk membuka menu lainnya._';
    await sock.sendMessage(remoteJid, { text: schedText });
    return;
  }

  const chosenDayName = DAY_NAMES[choice] || 'Hari';

  const nowUtc = new Date();
  const wibDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(nowUtc);

  // 1. Search for upcoming or current meeting session for this specific day_of_week
  const meetingsRes = await db.execute({
    sql: `
      SELECT ms.*, s.name as subject_name, s.sks as subject_sks, s.general_notes,
             l.name as lecturer_name, l.phone as lecturer_phone, sc.day_of_week
      FROM meeting_sessions ms
      JOIN subjects s ON ms.subject_id = s.id
      JOIN schedules sc ON ms.schedule_id = sc.id
      LEFT JOIN lecturers l ON s.lecturer_id = l.id
      WHERE sc.day_of_week = ? AND ms.session_date >= ?
      ORDER BY ms.session_date ASC, ms.start_time ASC
      LIMIT 6
    `,
    args: [choice, wibDateStr],
  });

  if (meetingsRes.rows.length > 0) {
    const nearestDate = (meetingsRes.rows[0] as any).session_date;
    const sameDateSessions = meetingsRes.rows.filter((m: any) => m.session_date === nearestDate);
    const activeWeek = (meetingsRes.rows[0] as any).week_number || 1;

    let outText = `📅 *JADWAL KULIAH HARI ${chosenDayName.toUpperCase()}*\n`;
    outText += `🗓 Tanggal: *${nearestDate}* (Minggu Ke-${activeWeek})\n\n`;

    sameDateSessions.forEach((m: any, idx) => {
      outText +=
        `${idx + 1}. *${m.subject_name}* (${m.subject_sks} SKS)\n` +
        `   📖 Pertemuan: Ke-${m.meeting_number} (Minggu ${m.week_number})\n` +
        `   ⏰ Waktu: ${m.start_time || '08:00'} - ${m.end_time || '10:30'} WIB\n` +
        `   📍 Ruang: ${m.room || 'Kelas'}\n` +
        `   📌 Status: *${formatSessionTypeName(m.session_type)}*\n` +
        `   👨‍🏫 Dosen: ${m.lecturer_name || 'Belum diatur'}\n` +
        (m.notes ? `   📝 Catatan Sesi: ${m.notes}\n` : '') +
        (m.general_notes ? `   📌 Info Matkul: ${m.general_notes}\n` : '') +
        '\n';
    });

    outText += '_Ketik `/menu` untuk membuka menu lainnya._';
    await sock.sendMessage(remoteJid, { text: outText });
    return;
  }

  // Fallback
  const masterRes = await db.execute({
    sql: `
      SELECT sc.*, s.name as subject_name, s.sks as subject_sks, s.general_notes, l.name as lecturer_name
      FROM schedules sc
      JOIN subjects s ON sc.subject_id = s.id
      LEFT JOIN lecturers l ON s.lecturer_id = l.id
      WHERE sc.day_of_week = ?
      ORDER BY sc.start_time ASC
    `,
    args: [choice],
  });

  if (masterRes.rows.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: `📅 *JADWAL KULIAH HARI ${chosenDayName.toUpperCase()}*\n\n_Tidak ada jadwal perkuliahan pada hari ini._\n\n_Ketik \`/menu\` untuk kembali._`,
    });
    return;
  }

  let fallbackText = `📅 *JADWAL KULIAH HARI ${chosenDayName.toUpperCase()}*\n\n`;
  masterRes.rows.forEach((s: any, idx) => {
    fallbackText +=
      `${idx + 1}. *${s.subject_name}* (${s.subject_sks} SKS)\n` +
      `   ⏰ Waktu: ${s.start_time} - ${s.end_time} WIB\n` +
      `   📍 Ruang: ${s.room}\n` +
      `   📌 Status: *Tatap Muka (OFFLINE)*\n` +
      `   👨‍🏫 Dosen: ${s.lecturer_name || 'Belum ada informasi...'}\n` +
      (s.general_notes ? `   📝 Catatan: ${s.general_notes}\n` : '') +
      '\n';
  });
  fallbackText += '_Ketik `/menu` untuk membuka menu lainnya._';
  await sock.sendMessage(remoteJid, { text: fallbackText });
}
