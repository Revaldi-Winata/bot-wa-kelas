import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { getActiveSocket } from '../../bot/socket.js';
import { env } from '../../config/env.js';
import { logAudit } from '../../db/audit.js';

export const elearningRouter = new Hono();

// --- Manual Broadcast Announcement Endpoint ---
elearningRouter.post('/elearning/broadcast-manual', async (c) => {
  const body = await c.req.json();
  const { sessionId, customTopic } = body;

  const meetingRes = await db.execute({
    sql: `
      SELECT ms.*, s.name as subject_name
      FROM meeting_sessions ms
      JOIN subjects s ON ms.subject_id = s.id
      WHERE ms.id = ?
    `,
    args: [sessionId],
  });

  if (meetingRes.rows.length === 0) {
    return c.json({ status: 'error', message: 'Sesi pertemuan tidak ditemukan' }, 404);
  }

  const meeting = meetingRes.rows[0];
  const topicToSend = customTopic || meeting.notes || 'Sesi E-Learning & Forum Diskusi telah dibuka';

  const sock = getActiveSocket();
  if (sock) {
    let message = `📚 *[PENGUMUMAN FORUM E-LEARNING]*\n\n`;
    message += `Mata Kuliah : *${meeting.subject_name}*\n`;
    message += `Pertemuan   : *Ke-${meeting.meeting_number}* (Sesi E-Learning)\n`;
    message += `Topik Diskusi: *${topicToSend}*\n\n`;
    if (meeting.mentari_url) {
      message += `🔗 *Link Mentari LMS*:\n${meeting.mentari_url}\n\n`;
    }
    message += `_Silakan login ke Mentari UNPAM untuk memberikan respon dan berdiskusi sebelum batas waktu sesi ditutup._`;

    const { getMainClassGroupJid } = await import('../../bot/whitelist.js');
    const targetGroupJid = await getMainClassGroupJid();
    if (targetGroupJid) {
      await sock.sendMessage(targetGroupJid, { text: message });
    }
  }

  await logAudit('ELEARNING', `Broadcast manual forum E-Learning: ${meeting.subject_name} (Pertemuan ${meeting.meeting_number})`, 'INFO', { sessionId });
  return c.json({ status: 'ok', message: 'Pengumuman forum berhasil dibroadcast ke WhatsApp!' });
});
