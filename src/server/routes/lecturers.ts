import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { logAudit } from '../../db/audit.js';

export const lecturersRouter = new Hono();

// --- Lecturers CRUD ---
lecturersRouter.get('/lecturers', async (c) => {
  const res = await db.execute(`
    SELECT l.*, s.id as subject_id, s.name as subject_name
    FROM lecturers l
    LEFT JOIN subjects s ON s.lecturer_id = l.id
    ORDER BY l.name ASC
  `);
  return c.json(res.rows);
});

lecturersRouter.post('/lecturers', async (c) => {
  const body = await c.req.json();
  const { name, phone, email, notes, subject_id } = body;

  const id = crypto.randomUUID();
  await db.execute({
    sql: 'INSERT INTO lecturers (id, name, phone, email, notes) VALUES (?, ?, ?, ?, ?)',
    args: [id, name, phone, email || null, notes || null],
  });

  if (subject_id) {
    await db.execute({
      sql: 'UPDATE subjects SET lecturer_id = ? WHERE id = ?',
      args: [id, subject_id],
    });
  }

  await logAudit('CRUD_DOSEN', `Tambah dosen: "${name}" (${phone || 'Tanpa No'})`, 'SUCCESS', { name, phone, subject_id });
  return c.json({ status: 'created', id });
});

lecturersRouter.put('/lecturers/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { name, phone, email, notes, subject_id } = body;

  await db.execute({
    sql: `
      UPDATE lecturers
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          notes = COALESCE(?, notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    args: [name, phone, email, notes, id],
  });

  await db.execute({
    sql: 'UPDATE subjects SET lecturer_id = NULL WHERE lecturer_id = ?',
    args: [id],
  });

  if (subject_id) {
    await db.execute({
      sql: 'UPDATE subjects SET lecturer_id = ? WHERE id = ?',
      args: [id, subject_id],
    });
  }

  await logAudit('CRUD_DOSEN', `Ubah data dosen (ID: ${id}) "${name}"`, 'INFO', { id, name, phone });
  return c.json({ status: 'updated' });
});

lecturersRouter.delete('/lecturers/:id', async (c) => {
  const id = c.req.param('id');
  await db.execute({ sql: 'UPDATE subjects SET lecturer_id = NULL WHERE lecturer_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM lecturers WHERE id = ?', args: [id] });
  await logAudit('CRUD_DOSEN', `Hapus dosen (ID: ${id})`, 'WARN', { id });
  return c.json({ status: 'deleted' });
});

// --- Subjects CRUD ---
lecturersRouter.get('/subjects', async (c) => {
  const res = await db.execute(`
    SELECT s.*, l.name as lecturer_name, l.phone as lecturer_phone
    FROM subjects s
    LEFT JOIN lecturers l ON s.lecturer_id = l.id
    ORDER BY s.name ASC
  `);
  return c.json(res.rows);
});

lecturersRouter.post('/subjects', async (c) => {
  const body = await c.req.json();
  const { name, code, sks, lecturer_id, wa_group_jid, general_notes } = body;

  const id = crypto.randomUUID();
  await db.execute({
    sql: 'INSERT INTO subjects (id, name, code, sks, lecturer_id, wa_group_jid, general_notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [id, name, code || null, Number(sks) || 2, lecturer_id || null, wa_group_jid || null, general_notes || null],
  });

  await logAudit('CRUD_MATKUL', `Tambah mata kuliah: "${name}" (${sks || 2} SKS)`, 'SUCCESS', { name, sks, code });
  return c.json({ status: 'created', id });
});

lecturersRouter.put('/subjects/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { name, code, sks, lecturer_id, wa_group_jid, general_notes } = body;

  await db.execute({
    sql: `
      UPDATE subjects
      SET name = COALESCE(?, name),
          code = COALESCE(?, code),
          sks = COALESCE(?, sks),
          lecturer_id = COALESCE(?, lecturer_id),
          wa_group_jid = ?,
          general_notes = COALESCE(?, general_notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    args: [
      name || null,
      code || null,
      sks ? Number(sks) : null,
      lecturer_id !== undefined ? lecturer_id : null,
      wa_group_jid !== undefined ? wa_group_jid : null,
      general_notes !== undefined ? general_notes : null,
      id,
    ],
  });

  await logAudit('CRUD_MATKUL', `Update mata kuliah (ID: ${id})${wa_group_jid ? ' - mapping grup matkul diperbarui' : ''}`, 'INFO', { id, wa_group_jid });
  return c.json({ status: 'updated' });
});

lecturersRouter.delete('/subjects/:id', async (c) => {
  const id = c.req.param('id');
  await db.execute({ sql: 'DELETE FROM subjects WHERE id = ?', args: [id] });
  await logAudit('CRUD_MATKUL', `Hapus subjek (ID: ${id})`, 'WARN', { id });
  return c.json({ status: 'deleted' });
});
