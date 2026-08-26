import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { logAudit } from '../../db/audit.js';

export const assignmentsRouter = new Hono();

// --- Assignments CRUD ---
assignmentsRouter.get('/assignments', async (c) => {
  const res = await db.execute(`
    SELECT a.*, s.name as subject_name
    FROM assignments a
    JOIN subjects s ON a.subject_id = s.id
    ORDER BY a.deadline ASC
  `);
  return c.json(res.rows);
});

assignmentsRouter.post('/assignments', async (c) => {
  const body = await c.req.json();
  const { subject_id, title, meeting_number, description, deadline, submission_url, reminder_h3, reminder_h2, reminder_h1, reminder_h0 } = body;

  const id = crypto.randomUUID();
  await db.execute({
    sql: `
      INSERT INTO assignments (id, subject_id, title, meeting_number, description, deadline, submission_url, reminder_h3, reminder_h2, reminder_h1, reminder_h0)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      subject_id,
      title,
      Number(meeting_number) || 1,
      description,
      deadline,
      submission_url || null,
      reminder_h3 !== undefined ? (reminder_h3 ? 1 : 0) : 1,
      reminder_h2 !== undefined ? (reminder_h2 ? 1 : 0) : 1,
      reminder_h1 !== undefined ? (reminder_h1 ? 1 : 0) : 1,
      reminder_h0 !== undefined ? (reminder_h0 ? 1 : 0) : 1,
    ],
  });

  await logAudit('CRUD_TUGAS', `Tambah tugas: "${title}" (Deadline: ${deadline})`, 'SUCCESS', { title, deadline, meeting_number });

  // Instant WhatsApp Broadcast to Main Class Group & Subject Group
  try {
    const subRes = await db.execute({
      sql: 'SELECT name, wa_group_jid FROM subjects WHERE id = ? LIMIT 1',
      args: [subject_id],
    });
    const subject = subRes.rows[0] as any;
    const subjectName = subject?.name || 'Mata Kuliah';
    const subjectGroupJid = subject?.wa_group_jid;

    const { getActiveSocket } = await import('../../bot/socket.js');
    const { getMainClassGroupJid } = await import('../../bot/whitelist.js');

    const sock = getActiveSocket();
    const mainGroupJid = await getMainClassGroupJid();

    if (sock && (mainGroupJid || subjectGroupJid)) {
      let text = `📢 *PENGUMUMAN TUGAS BARU*\n\n`;
      text += `📚 *Mata Kuliah*: ${subjectName}\n`;
      text += `📝 *Judul Tugas*: ${title} (Pertemuan Ke-${Number(meeting_number) || 1})\n`;
      text += `⏰ *Deadline*: ${deadline} WIB\n\n`;

      if (description) {
        text += `📋 *Deskripsi & Petunjuk*:\n${description}\n\n`;
      }

      if (submission_url) {
        text += `🔗 *Link Pengumpulan*:\n${submission_url}\n\n`;
      }

      text += `_Pemberitahuan resmi Bot Kelas 07TPLP025_`;

      const targetJids = new Set<string>();
      if (mainGroupJid) targetJids.add(mainGroupJid);
      if (subjectGroupJid) targetJids.add(subjectGroupJid);

      for (const jid of targetJids) {
        try {
          await sock.sendMessage(jid, { text });
        } catch (err: any) {
          console.error(`Failed to send new assignment announcement to ${jid}:`, err.message);
        }
      }

      await logAudit(
        'BROADCAST_TUGAS',
        `Auto-broadcast tugas baru "${title}" ke ${targetJids.size} grup WhatsApp`,
        'SUCCESS',
        { title, subjectName, targets: Array.from(targetJids) }
      );
    }
  } catch (err: any) {
    console.error('Error during auto-broadcast new assignment:', err.message);
  }

  return c.json({ status: 'created', id });
});

assignmentsRouter.put('/assignments/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const {
    subject_id,
    title,
    meeting_number,
    description,
    deadline,
    submission_url,
    reminder_h3,
    reminder_h2,
    reminder_h1,
    reminder_h0,
    is_active,
  } = body;

  await db.execute({
    sql: `
      UPDATE assignments
      SET subject_id = COALESCE(?, subject_id),
          title = COALESCE(?, title),
          meeting_number = COALESCE(?, meeting_number),
          description = COALESCE(?, description),
          deadline = COALESCE(?, deadline),
          submission_url = ?,
          reminder_h3 = COALESCE(?, reminder_h3),
          reminder_h2 = COALESCE(?, reminder_h2),
          reminder_h1 = COALESCE(?, reminder_h1),
          reminder_h0 = COALESCE(?, reminder_h0),
          is_active = COALESCE(?, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    args: [
      subject_id || null,
      title || null,
      meeting_number !== undefined ? Number(meeting_number) : null,
      description !== undefined ? description : null,
      deadline || null,
      submission_url !== undefined ? submission_url : null,
      reminder_h3 !== undefined ? (reminder_h3 ? 1 : 0) : null,
      reminder_h2 !== undefined ? (reminder_h2 ? 1 : 0) : null,
      reminder_h1 !== undefined ? (reminder_h1 ? 1 : 0) : null,
      reminder_h0 !== undefined ? (reminder_h0 ? 1 : 0) : null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      id,
    ],
  });

  await logAudit('CRUD_TUGAS', `Ubah tugas (ID: ${id}) "${title || ''}"`, 'INFO', { id, title, deadline });
  return c.json({ status: 'updated' });
});

assignmentsRouter.delete('/assignments/:id', async (c) => {
  const id = c.req.param('id');
  await db.execute({ sql: 'DELETE FROM assignments WHERE id = ?', args: [id] });
  await logAudit('CRUD_TUGAS', `Hapus tugas (ID: ${id})`, 'WARN', { id });
  return c.json({ status: 'deleted' });
});

// --- Re-broadcast Single Assignment ---
assignmentsRouter.post('/assignments/:id/broadcast', async (c) => {
  const id = c.req.param('id');
  const asRes = await db.execute({
    sql: `
      SELECT a.*, s.name as subject_name, s.wa_group_jid
      FROM assignments a
      JOIN subjects s ON a.subject_id = s.id
      WHERE a.id = ?
      LIMIT 1
    `,
    args: [id],
  });

  if (asRes.rows.length === 0) {
    return c.json({ status: 'error', message: 'Tugas tidak ditemukan.' }, 404);
  }

  const a: any = asRes.rows[0];

  const { getActiveSocket } = await import('../../bot/socket.js');
  const { getMainClassGroupJid } = await import('../../bot/whitelist.js');

  const sock = getActiveSocket();
  if (!sock) {
    return c.json({ status: 'error', message: 'Bot WhatsApp belum terhubung.' }, 503);
  }

  const mainGroupJid = await getMainClassGroupJid();
  const subjectGroupJid = a.wa_group_jid;

  if (!mainGroupJid && !subjectGroupJid) {
    return c.json({ status: 'error', message: 'Grup WhatsApp Kelas belum diatur di menu Anggota Kelas.' }, 400);
  }

  let text = `📢 *PENGUMUMAN TUGAS KULIAH*\n\n`;
  text += `📚 *Mata Kuliah*: ${a.subject_name}\n`;
  text += `📝 *Judul Tugas*: ${a.title} (Pertemuan Ke-${a.meeting_number || 1})\n`;
  text += `⏰ *Deadline*: ${a.deadline} WIB\n\n`;

  if (a.description) {
    text += `📋 *Deskripsi & Petunjuk*:\n${a.description}\n\n`;
  }

  if (a.submission_url) {
    text += `🔗 *Link Pengumpulan*:\n${a.submission_url}\n\n`;
  }

  text += `_Pemberitahuan resmi Bot Kelas 07TPLP025_`;

  const targetJids = new Set<string>();
  if (mainGroupJid) targetJids.add(mainGroupJid);
  if (subjectGroupJid) targetJids.add(subjectGroupJid);

  for (const jid of targetJids) {
    try {
      await sock.sendMessage(jid, { text });
    } catch (err: any) {
      console.error(`Failed to send broadcast to ${jid}:`, err.message);
    }
  }

  await logAudit(
    'BROADCAST_TUGAS',
    `Manual re-broadcast tugas "${a.title}" ke ${targetJids.size} grup WhatsApp`,
    'SUCCESS',
    { id, title: a.title, targets: Array.from(targetJids) }
  );

  return c.json({ status: 'ok', message: `Tugas "${a.title}" berhasil di-broadcast ke grup WhatsApp!` });
});

// --- Re-broadcast All Active Assignments ---
assignmentsRouter.post('/assignments/broadcast-all', async (c) => {
  const asRes = await db.execute(`
    SELECT a.*, s.id as subject_id, s.name as subject_name, s.wa_group_jid
    FROM assignments a
    JOIN subjects s ON a.subject_id = s.id
    WHERE datetime(a.deadline) > datetime('now', 'localtime') AND a.is_active = 1
    ORDER BY a.deadline ASC
  `);

  if (asRes.rows.length === 0) {
    return c.json({ status: 'error', message: 'Tidak ada tugas aktif yang sedang berjalan saat ini.' }, 400);
  }

  const activeTasks: any[] = asRes.rows as any[];

  const { getActiveSocket } = await import('../../bot/socket.js');
  const { getMainClassGroupJid } = await import('../../bot/whitelist.js');

  const sock = getActiveSocket();
  if (!sock) {
    return c.json({ status: 'error', message: 'Bot WhatsApp belum terhubung.' }, 503);
  }

  const mainGroupJid = await getMainClassGroupJid();

  // 1. Send Single Aggregated Message to Main Class Group
  if (mainGroupJid) {
    let mainText = `📢 *REKAP SELURUH TUGAS AKTIF KELAS 07TPLP025*\n`;
    mainText += `Total: *${activeTasks.length} Tugas Berjalan*\n\n`;

    activeTasks.forEach((a, idx) => {
      mainText += `${idx + 1}️⃣ *${a.subject_name}* (Pertemuan ${a.meeting_number})\n`;
      mainText += `📝 *Tugas*: ${a.title}\n`;
      mainText += `⏰ *Deadline*: ${a.deadline} WIB\n`;
      if (a.description) mainText += `📋 *Petunjuk*: ${a.description}\n`;
      if (a.submission_url) mainText += `🔗 *Link*: ${a.submission_url}\n`;
      mainText += '\n';
    });

    mainText += `_Pemberitahuan resmi Bot Kelas 07TPLP025_`;

    try {
      await sock.sendMessage(mainGroupJid, { text: mainText });
    } catch (err: any) {
      console.error('Failed to send aggregated task broadcast to main group:', err.message);
    }
  }

  // 2. Send Isolated Messages to Each Subject's WhatsApp Group
  const subjectGroupsMap = new Map<string, { name: string; groupJid: string; tasks: any[] }>();
  for (const t of activeTasks) {
    if (t.wa_group_jid) {
      if (!subjectGroupsMap.has(t.subject_id)) {
        subjectGroupsMap.set(t.subject_id, {
          name: t.subject_name,
          groupJid: t.wa_group_jid,
          tasks: [],
        });
      }
      subjectGroupsMap.get(t.subject_id)!.tasks.push(t);
    }
  }

  for (const [_, subInfo] of subjectGroupsMap.entries()) {
    let subText = `📢 *REKAP TUGAS AKTIF: ${subInfo.name.toUpperCase()}*\n`;
    subText += `Total: *${subInfo.tasks.length} Tugas*\n\n`;

    subInfo.tasks.forEach((t, idx) => {
      subText += `${idx + 1}. *${t.title}* (Pertemuan ${t.meeting_number})\n`;
      subText += `⏰ *Deadline*: ${t.deadline} WIB\n`;
      if (t.description) subText += `📋 *Petunjuk*: ${t.description}\n`;
      if (t.submission_url) subText += `🔗 *Link*: ${t.submission_url}\n`;
      subText += '\n';
    });

    subText += `_Pemberitahuan resmi Bot Kelas 07TPLP025_`;

    try {
      await sock.sendMessage(subInfo.groupJid, { text: subText });
    } catch (err: any) {
      console.error(`Failed to send subject tasks to ${subInfo.groupJid}:`, err.message);
    }
  }

  await logAudit(
    'BROADCAST_TUGAS',
    `Manual re-broadcast semua ${activeTasks.length} tugas aktif (1 rekap ke Grup Kelas, ${subjectGroupsMap.size} ke Grup Matkul)`,
    'SUCCESS',
    { totalTasks: activeTasks.length, subjectGroupsCount: subjectGroupsMap.size }
  );

  return c.json({
    status: 'ok',
    message: `Berhasil re-broadcast ${activeTasks.length} tugas aktif ke grup WhatsApp!`,
  });
});
