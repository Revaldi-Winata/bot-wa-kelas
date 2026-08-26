import { WASocket } from '@whiskeysockets/baileys';
import { db } from '../../db/index.js';

export async function handleLecturerContactSelection(
  sock: WASocket,
  remoteJid: string,
  choice = 0
): Promise<void> {
  const lecturersRes = await db.execute(`
    SELECT l.name, l.phone, l.email, l.notes, s.name as subject_name
    FROM subjects s
    JOIN lecturers l ON s.lecturer_id = l.id
    ORDER BY s.name ASC
  `);

  if (lecturersRes.rows.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: '👨‍🏫 *KONTAK DOSEN PENGAMPU*\n\n_Belum ada data kontak dosen yang terdaftar._',
    });
    return;
  }

  let text = '👨‍🏫 *DAFTAR KONTAK DOSEN PENGAMPU*\n_Kelas 07TPLP025_\n\n';
  lecturersRes.rows.forEach((lec: any, idx: number) => {
    const cleanPhone = (lec.phone as string).replace(/[^0-9]/g, '');
    const waLink = `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone}`;
    text += `*${idx + 1}. ${lec.subject_name}*\n`;
    text += `   • Dosen: *${lec.name}*\n`;
    text += `   • WhatsApp: ${lec.phone}\n`;
    text += `   • Link: ${waLink}\n`;
    if (lec.email) text += `   • Email: ${lec.email}\n`;
    text += `\n`;
  });
  text += '_Harap hubungi dosen dengan sopan dan pada jam kerja yang wajar._';

  await sock.sendMessage(remoteJid, { text });
}
