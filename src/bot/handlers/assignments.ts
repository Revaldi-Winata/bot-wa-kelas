import { WASocket } from '@whiskeysockets/baileys';
import { db } from '../../db/index.js';

export async function handleAssignmentList(
  sock: WASocket,
  remoteJid: string
): Promise<void> {
  const tasksRes = await db.execute(`
    SELECT a.title, a.meeting_number, a.description, a.deadline, a.submission_url, s.name as subject_name
    FROM assignments a
    JOIN subjects s ON a.subject_id = s.id
    WHERE a.is_active = 1
    ORDER BY a.deadline ASC
  `);

  if (tasksRes.rows.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: '🎉 *Tidak ada tugas aktif saat ini!* Semua tugas selesai atau belum ada tugas baru.',
    });
    return;
  }

  let taskText = '📝 *DAFTAR TUGAS KULIAH AKTIF*\n\n';
  tasksRes.rows.forEach((t, idx) => {
    const deadlineDate = new Date(t.deadline as string).toLocaleString('id-ID', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    taskText +=
      `*${idx + 1}. ${t.title}* (${t.subject_name})\n` +
      `   • Pertemuan: Ke-${t.meeting_number}\n` +
      `   • Batas Waktu: *${deadlineDate} WIB*\n` +
      `   • Instruksi: ${t.description}\n` +
      (t.submission_url ? `   • GDrive: ${t.submission_url}\n` : '') +
      `\n`;
  });
  taskText += '_Gunakan opsi menu 4 untuk memvalidasi file Anda di Google Drive._';

  await sock.sendMessage(remoteJid, { text: taskText });
}
