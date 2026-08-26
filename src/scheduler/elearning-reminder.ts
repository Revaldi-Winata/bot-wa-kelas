import { db } from '../db/index.js';
import { getActiveSocket } from '../bot/socket.js';
import { env } from '../config/env.js';
import { getWibDateTime } from './wib-time.js';
import pino from 'pino';

const logger = pino({ name: 'elearning-reminder' });

/**
 * 00:00 WIB Daily E-Learning Reminder (Mon-Fri)
 */
export async function evaluateDailyELearningReminder(): Promise<void> {
  const sock = getActiveSocket();
  if (!sock) return;

  const { datePart, dayOfWeek, wibDate } = getWibDateTime();
  if (dayOfWeek < 1 || dayOfWeek > 5) return;

  const mondayOffset = dayOfWeek - 1;
  const currentMondayDate = new Date(wibDate);
  currentMondayDate.setUTCDate(wibDate.getUTCDate() - mondayOffset);
  const currentMondayStr = currentMondayDate.toISOString().split('T')[0];

  const sundayDate = new Date(currentMondayDate);
  sundayDate.setUTCDate(currentMondayDate.getUTCDate() + 6);
  const sundayStr = sundayDate.toISOString().split('T')[0];

  const deduplicationKey = `ELEARNING_DAILY_${datePart}`;
  const auditCheck = await db.execute({
    sql: 'SELECT id FROM audit_logs WHERE message = ? LIMIT 1',
    args: [deduplicationKey],
  });
  if (auditCheck.rows.length > 0) return;

  const sessionsRes = await db.execute({
    sql: `
      SELECT ms.*, s.name as subject_name, s.sks as subject_sks, l.name as lecturer_name
      FROM meeting_sessions ms
      JOIN subjects s ON ms.subject_id = s.id
      LEFT JOIN lecturers l ON s.lecturer_id = l.id
      WHERE ms.session_date >= ? AND ms.session_date <= ?
        AND (ms.session_type = 'ELEARNING' OR ms.session_type = 'ZOOM')
      ORDER BY ms.session_date ASC, s.name ASC
    `,
    args: [currentMondayStr, sundayStr],
  });

  if (sessionsRes.rows.length === 0) return;

  const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const todayDayName = dayNames[dayOfWeek] || 'Hari Ini';

  let message = `📚 *PENGINGAT E-LEARNING MINGGU INI*\n`;
  message += `Hari: ${todayDayName}, ${datePart} (00:00 WIB)\n`;
  message += `Periode Perkuliahan: ${currentMondayStr} s.d. ${sundayStr}\n\n`;
  message += `Daftar Mata Kuliah E-Learning / Online:\n`;

  let idx = 1;
  for (const s of sessionsRes.rows) {
    const typeLabel = s.session_type === 'ZOOM' ? 'Zoom / Tatap Muka Virtual' : 'E-Learning Asinkron (LMS)';
    message += `${idx}. *${s.subject_name}* (${s.subject_sks} SKS)\n`;
    message += `   - Pertemuan: Ke-${s.meeting_number} (${typeLabel})\n`;
    if (s.lecturer_name) message += `   - Dosen: ${s.lecturer_name}\n`;
    if (s.notes) message += `   - Topik / Catatan: ${s.notes}\n`;
    message += `\n`;
    idx++;
  }

  message += `Silakan login ke portal Mentari UNPAM untuk menyelesaikan modul minggu ini.`;

  const { getMainClassGroupJid } = await import('../bot/whitelist.js');
  const targetGroupJid = await getMainClassGroupJid();
  if (targetGroupJid) {
    await sock.sendMessage(targetGroupJid, { text: message });
    logger.info({ targetGroupJid }, 'E-Learning daily 00:00 reminder sent.');
  }

  await db.execute({
    sql: 'INSERT INTO audit_logs (id, level, category, message, metadata_json) VALUES (?, ?, ?, ?, ?)',
    args: [crypto.randomUUID(), 'INFO', 'ELEARNING_REMINDER', deduplicationKey, JSON.stringify({ total: sessionsRes.rows.length })],
  });
}
