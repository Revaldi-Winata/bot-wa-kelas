import { db } from '../db/index.js';
import { getActiveSocket } from '../bot/socket.js';
import { env } from '../config/env.js';
import pino from 'pino';

const logger = pino({ name: 'assignment-reminder' });

/**
 * 15-Minute Evaluator for Assignment Deadline Milestones (H3, H2, H1, H0)
 */
export async function evaluateAssignmentDeadlines(): Promise<void> {
  const sock = getActiveSocket();
  if (!sock) return;

  const now = new Date();
  const assignmentsRes = await db.execute(`
    SELECT a.id, a.title, a.meeting_number, a.description, a.deadline, a.submission_url,
           a.reminder_h3, a.reminder_h2, a.reminder_h1, a.reminder_h0,
           s.name as subject_name, s.wa_group_jid as subject_group_jid
    FROM assignments a
    JOIN subjects s ON a.subject_id = s.id
    WHERE a.is_active = 1
  `);

  for (const a of assignmentsRes.rows) {
    const deadline = new Date(a.deadline as string);
    const timeDiffMs = deadline.getTime() - now.getTime();
    const hoursRemaining = timeDiffMs / (1000 * 60 * 60);

    if (hoursRemaining < 0) continue;

    let milestone: string | null = null;
    let templateType: 'H3' | 'H2' | 'H1' | 'H0' | null = null;

    if (hoursRemaining <= 4 && a.reminder_h0) {
      milestone = 'H0_URGENT';
      templateType = 'H0';
    } else if (hoursRemaining <= 24 && hoursRemaining > 12 && a.reminder_h1) {
      milestone = 'H1';
      templateType = 'H1';
    } else if (hoursRemaining <= 48 && hoursRemaining > 24 && a.reminder_h2) {
      milestone = 'H2';
      templateType = 'H2';
    } else if (hoursRemaining <= 72 && hoursRemaining > 48 && a.reminder_h3) {
      milestone = 'H3';
      templateType = 'H3';
    }

    if (!milestone || !templateType) continue;

    const todayDateStr = now.toISOString().split('T')[0];
    const deduplicationKey = `BROADCAST_${a.id}_${milestone}_${todayDateStr}`;

    const auditCheck = await db.execute({
      sql: 'SELECT id FROM audit_logs WHERE message = ? LIMIT 1',
      args: [deduplicationKey],
    });

    if (auditCheck.rows.length > 0) continue;

    const deadlineFormatted = deadline.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' });
    let broadcastMessage = '';

    if (templateType === 'H3' || templateType === 'H2') {
      broadcastMessage =
        `*PENGINGAT TUGAS KULIAH [${templateType}]*\n\n` +
        `Mata Kuliah: *${a.subject_name}*\n` +
        `Tugas: *${a.title} (Pertemuan ${a.meeting_number})*\n` +
        `Batas Waktu: *${deadlineFormatted} WIB*\n` +
        `Sisa Waktu: *${Math.ceil(hoursRemaining / 24)} Hari lagi*\n\n` +
        `Instruksi:\n${a.description}\n\n` +
        (a.submission_url ? `Link Pengumpulan:\n${a.submission_url}\n\n` : '') +
        `Format penamaan: [NAMA]_[NIM]_[EXTRA].[EXT]\n` +
        `Cek validitas file: ketik /menu -> pilih 4.`;
    } else if (templateType === 'H1') {
      broadcastMessage =
        `*PERINGATAN DEADLINE TUGAS BESOK [H-1]*\n\n` +
        `Mata Kuliah: *${a.subject_name}*\n` +
        `Tugas: *${a.title}*\n` +
        `Batas Waktu: *${deadlineFormatted} WIB*\n\n` +
        `Bagi yang belum mengumpulkan, silakan segera selesaikan dan upload ke GDrive.\n` +
        (a.submission_url ? `Link Pengumpulan:\n${a.submission_url}\n\n` : '');
    } else if (templateType === 'H0') {
      broadcastMessage =
        `*URGENT: DEADLINE HARI INI [H-0]*\n\n` +
        `Mata Kuliah: *${a.subject_name}*\n` +
        `Tugas: *${a.title}*\n` +
        `Batas Waktu: *${deadlineFormatted} WIB* (Kurang dari 4 Jam!)\n\n` +
        `Segera unggah tugas sebelum batas waktu ditutup!`;
    }

    const { getMainClassGroupJid } = await import('../bot/whitelist.js');
    let targetGroupJid = (a.subject_group_jid as string) || (await getMainClassGroupJid());

    if (targetGroupJid) {
      await sock.sendMessage(targetGroupJid, { text: broadcastMessage });
      logger.info({ targetGroupJid, milestone, assignment: a.title }, 'Task broadcast sent successfully.');
    }

    await db.execute({
      sql: 'INSERT INTO audit_logs (id, level, category, message, metadata_json) VALUES (?, ?, ?, ?, ?)',
      args: [crypto.randomUUID(), 'INFO', 'TASK_REMINDER', deduplicationKey, JSON.stringify({ hoursRemaining, targetGroupJid })],
    });
  }
}
