import { db } from '../db/index.js';
import { getActiveSocket } from '../bot/socket.js';
import { env } from '../config/env.js';
import { getWibDateTime } from './wib-time.js';
import pino from 'pino';

const logger = pino({ name: 'class-reminder' });

/**
 * 04:00 WIB Daily Class Reminder with meeting-specific notes and global subject notes
 */
export async function evaluateDailyClassReminder(): Promise<void> {
  const sock = getActiveSocket();
  if (!sock) return;

  const { datePart, dayOfWeek } = getWibDateTime();
  if (dayOfWeek === 0) return; // Sunday: No regular classes

  const deduplicationKey = `DAILY_CLASS_REMINDER_${datePart}`;
  const auditCheck = await db.execute({
    sql: 'SELECT id FROM audit_logs WHERE message = ? LIMIT 1',
    args: [deduplicationKey],
  });
  if (auditCheck.rows.length > 0) return;

  const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const todayDayName = dayNames[dayOfWeek] || 'Hari Ini';

  // 1. Try to fetch from meeting_sessions for today's exact date
  const meetingsRes = await db.execute({
    sql: `
      SELECT ms.*, s.name as subject_name, s.sks as subject_sks, s.general_notes, l.name as lecturer_name, l.phone as lecturer_phone
      FROM meeting_sessions ms
      JOIN subjects s ON ms.subject_id = s.id
      LEFT JOIN lecturers l ON s.lecturer_id = l.id
      WHERE ms.session_date = ?
      ORDER BY ms.start_time ASC
    `,
    args: [datePart],
  });

  let message = `🌅 *PENGINGAT JADWAL KULIAH HARI INI*\n`;
  message += `Hari: *${todayDayName}, ${datePart}*\n\n`;

  if (meetingsRes.rows.length > 0) {
    meetingsRes.rows.forEach((m, idx) => {
      let typeLabel = 'Tatap Muka (Offline)';
      if (m.session_type === 'ELEARNING') typeLabel = 'E-Learning (LMS Mentari)';
      else if (m.session_type === 'ZOOM') typeLabel = 'Kuliah Online (Zoom)';
      else if (m.session_type === 'LIBUR') typeLabel = 'LIBUR / Ditiadakan';

      message += `${idx + 1}. *${m.subject_name}* (${m.subject_sks} SKS)\n`;
      message += `   📖 Pertemuan: Ke-${m.meeting_number}\n`;
      message += `   ⏰ ${m.start_time || '08:00'} - ${m.end_time || '10:30'} WIB\n`;
      message += `   📍 Ruang: ${m.room || 'Kelas'}\n`;
      message += `   👨‍🏫 ${m.lecturer_name || 'Dosen Pengampu'}\n`;
      message += `   📌 Status: *${typeLabel}*\n`;

      if (m.notes) message += `   📝 *Catatan Pertemuan*: ${m.notes}\n`;
      if (m.general_notes) message += `   📌 *Catatan Matkul*: ${m.general_notes}\n`;
      message += `\n`;
    });
  } else {
    // Fallback to master schedules
    const masterRes = await db.execute({
      sql: `
        SELECT sc.*, s.name as subject_name, s.sks as subject_sks, s.general_notes, l.name as lecturer_name
        FROM schedules sc
        JOIN subjects s ON sc.subject_id = s.id
        LEFT JOIN lecturers l ON s.lecturer_id = l.id
        WHERE sc.day_of_week = ?
        ORDER BY sc.start_time ASC
      `,
      args: [dayOfWeek],
    });

    if (masterRes.rows.length === 0) return;

    masterRes.rows.forEach((s, idx) => {
      message += `${idx + 1}. *${s.subject_name}* (${s.subject_sks} SKS)\n`;
      message += `   ⏰ ${s.start_time} - ${s.end_time} WIB\n`;
      message += `   📍 Ruang: ${s.room}\n`;
      message += `   👨‍🏫 ${s.lecturer_name || 'Dosen Pengampu'}\n`;
      if (s.general_notes) message += `   📌 *Catatan Matkul*: ${s.general_notes}\n`;
      message += `\n`;
    });
  }

  message += `_Semangat mengikuti perkuliahan hari ini!_`;

  const { getMainClassGroupJid } = await import('../bot/whitelist.js');
  const targetGroupJid = await getMainClassGroupJid();
  if (targetGroupJid) {
    await sock.sendMessage(targetGroupJid, { text: message });
    logger.info({ targetGroupJid }, 'Daily 04:00 WIB class schedule reminder sent.');
  }

  await db.execute({
    sql: 'INSERT INTO audit_logs (id, level, category, message, metadata_json) VALUES (?, ?, ?, ?, ?)',
    args: [crypto.randomUUID(), 'INFO', 'DAILY_SCHEDULE', deduplicationKey, JSON.stringify({ datePart, targetGroupJid })],
  });
}
