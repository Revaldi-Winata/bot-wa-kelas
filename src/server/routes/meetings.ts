import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { generateSemesterMeetingSessions } from '../../db/generator.js';
import { logAudit } from '../../db/audit.js';

export const meetingsRouter = new Hono();

// --- Semester Configuration & Generation ---
meetingsRouter.get('/semester', async (c) => {
  const res = await db.execute('SELECT * FROM semester_configs WHERE is_active = 1 LIMIT 1');
  return c.json(res.rows[0] || null);
});

meetingsRouter.post('/semester/generate', async (c) => {
  const body = await c.req.json();
  const { startDate, endDate, semesterName, totalWeeks } = body;

  const result = await generateSemesterMeetingSessions({
    startDate: startDate || '2026-08-31',
    endDate: endDate || undefined,
    semesterName: semesterName || 'Semester Ganjil 2026/2027',
    totalWeeks: totalWeeks || 16,
  });

  const totalGenerated = result.totalGenerated;
  await logAudit('SEMESTER_CONFIG', `Generate kalender semester: ${totalGenerated} sesi pertemuan berhasil dibuat`, 'SUCCESS', { totalGenerated, semesterName });
  return c.json({ status: 'generated', totalGenerated });
});

// --- Master Subjects & Schedules (Master Matkul) CRUD ---
meetingsRouter.get('/schedules', async (c) => {
  const res = await db.execute(`
    SELECT s.id as subject_id, s.name as subject_name, s.code as subject_code, s.sks as subject_sks,
           s.general_notes, s.wa_group_jid,
           sc.id as schedule_id, sc.day_of_week, sc.start_time, sc.end_time, sc.room,
           l.id as lecturer_id, l.name as lecturer_name, l.phone as lecturer_phone
    FROM subjects s
    LEFT JOIN schedules sc ON sc.subject_id = s.id
    LEFT JOIN lecturers l ON s.lecturer_id = l.id
    ORDER BY sc.day_of_week ASC, sc.start_time ASC, s.name ASC
  `);
  return c.json(res.rows);
});

meetingsRouter.post('/subjects/upsert', async (c) => {
  const body = await c.req.json();
  const {
    subject_id,
    schedule_id,
    name,
    code,
    sks,
    lecturer_id,
    general_notes,
    day_of_week,
    start_time,
    end_time,
    room,
  } = body;

  let targetSubjectId = subject_id;

  if (targetSubjectId) {
    // Update existing subject
    await db.execute({
      sql: `
        UPDATE subjects
        SET name = ?,
            code = ?,
            sks = ?,
            lecturer_id = ?,
            general_notes = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      args: [name, code || null, Number(sks) || 2, lecturer_id || null, general_notes || null, targetSubjectId],
    });
  } else {
    // Create new subject
    targetSubjectId = crypto.randomUUID();
    await db.execute({
      sql: `
        INSERT INTO subjects (id, name, code, sks, lecturer_id, general_notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [targetSubjectId, name, code || null, Number(sks) || 2, lecturer_id || null, general_notes || null],
    });
  }

  // Handle schedule
  if (day_of_week && start_time && end_time) {
    if (schedule_id) {
      await db.execute({
        sql: `
          UPDATE schedules
          SET subject_id = ?,
              day_of_week = ?,
              start_time = ?,
              end_time = ?,
              room = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [targetSubjectId, Number(day_of_week), start_time, end_time, room || 'Kelas', schedule_id],
      });
    } else {
      // Check if schedule already exists for this subject
      const existingSc = await db.execute({
        sql: 'SELECT id FROM schedules WHERE subject_id = ? LIMIT 1',
        args: [targetSubjectId],
      });
      if (existingSc.rows.length > 0) {
        await db.execute({
          sql: `
            UPDATE schedules
            SET day_of_week = ?, start_time = ?, end_time = ?, room = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          args: [Number(day_of_week), start_time, end_time, room || 'Kelas', existingSc.rows[0].id],
        });
      } else {
        await db.execute({
          sql: 'INSERT INTO schedules (id, subject_id, day_of_week, start_time, end_time, room) VALUES (?, ?, ?, ?, ?, ?)',
          args: [crypto.randomUUID(), targetSubjectId, Number(day_of_week), start_time, end_time, room || 'Kelas'],
        });
      }
    }
  }

  await logAudit('CRUD_MATKUL', `${subject_id ? 'Ubah' : 'Tambah'} mata kuliah: "${name}" (${sks || 2} SKS)`, 'SUCCESS', { name, sks, room, day_of_week });
  return c.json({ status: 'saved', subject_id: targetSubjectId });
});

meetingsRouter.delete('/subjects/full/:id', async (c) => {
  const subjectId = c.req.param('id');
  await db.execute({ sql: 'DELETE FROM schedules WHERE subject_id = ?', args: [subjectId] });
  await db.execute({ sql: 'DELETE FROM meeting_sessions WHERE subject_id = ?', args: [subjectId] });
  await db.execute({ sql: 'DELETE FROM assignments WHERE subject_id = ?', args: [subjectId] });
  await db.execute({ sql: 'DELETE FROM subjects WHERE id = ?', args: [subjectId] });
  await logAudit('CRUD_MATKUL', `Hapus mata kuliah & seluruh jadwal terkait (ID: ${subjectId})`, 'WARN', { subjectId });
  return c.json({ status: 'deleted' });
});

// --- Meeting Sessions (Calendar Drill-down) ---
meetingsRouter.get('/meetings', async (c) => {
  const subject_id = c.req.query('subject_id');
  const week_number = c.req.query('week_number');

  let sql = `
    SELECT ms.*, s.name as subject_name, s.sks as subject_sks, l.name as lecturer_name
    FROM meeting_sessions ms
    JOIN subjects s ON ms.subject_id = s.id
    LEFT JOIN lecturers l ON s.lecturer_id = l.id
  `;
  const args: any[] = [];
  const whereClauses: string[] = [];

  if (subject_id) {
    whereClauses.push('ms.subject_id = ?');
    args.push(subject_id);
  }
  if (week_number) {
    whereClauses.push('ms.week_number = ?');
    args.push(Number(week_number));
  }

  if (whereClauses.length > 0) {
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }
  sql += ` ORDER BY ms.week_number ASC,
           CASE WHEN ms.session_type = 'ELEARNING' THEN 2 ELSE 1 END ASC,
           ms.meeting_number ASC,
           ms.session_date ASC,
           ms.start_time ASC`;

  const res = await db.execute({ sql, args });
  return c.json(res.rows);
});

meetingsRouter.patch('/meetings/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { session_type, notes, mentari_url, is_completed } = body;

  await db.execute({
    sql: `
      UPDATE meeting_sessions
      SET session_type = COALESCE(?, session_type),
          notes = COALESCE(?, notes),
          mentari_url = COALESCE(?, mentari_url),
          is_completed = COALESCE(?, is_completed),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    args: [
      session_type || null,
      notes !== undefined ? notes : null,
      mentari_url !== undefined ? mentari_url : null,
      is_completed !== undefined ? (is_completed ? 1 : 0) : null,
      id,
    ],
  });

  await logAudit('CRUD_JADWAL', `Ubah sesi pertemuan (ID: ${id}) ke status ${session_type || 'Updated'}`, 'INFO', { id, session_type, notes });
  return c.json({ status: 'updated' });
});
