import { db } from './index.js';

export interface GenerateSemesterOptions {
  startDate: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  semesterName?: string;
  totalWeeks?: number; // default 16
}

function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  d.setUTCDate(diff);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function generateSemesterMeetingSessions(options: GenerateSemesterOptions): Promise<{ totalGenerated: number }> {
  const { startDate, endDate, semesterName = 'Semester Aktif', totalWeeks = 16 } = options;

  const baseMonday = getMonday(startDate);
  // Default end date = Saturday of week 16 (or totalWeeks)
  const defaultSaturday = new Date(baseMonday);
  defaultSaturday.setUTCDate(baseMonday.getUTCDate() + (totalWeeks - 1) * 7 + 5);
  const calculatedEndDate = endDate || formatDate(defaultSaturday);

  // 1. Save or update semester config
  const semesterId = crypto.randomUUID();
  await db.execute('DELETE FROM semester_configs WHERE is_active = 1');
  await db.execute({
    sql: 'INSERT INTO semester_configs (id, name, start_date, end_date, total_weeks, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    args: [semesterId, semesterName, startDate, calculatedEndDate, totalWeeks],
  });

  // 2. Fetch all schedules and subjects
  const schedulesRes = await db.execute(`
    SELECT sc.*, s.name as subject_name, s.sks as subject_sks
    FROM schedules sc
    JOIN subjects s ON sc.subject_id = s.id
  `);

  const schedules = schedulesRes.rows;
  if (schedules.length === 0) {
    return { totalGenerated: 0 };
  }

  // Clear existing projected meeting sessions
  await db.execute('DELETE FROM meeting_sessions');

  const insertStatements: { sql: string; args: any[] }[] = [];
  let totalSessions = 0;

  for (const sc of schedules) {
    const scheduleId = sc.id as string;
    const subjectId = sc.subject_id as string;
    const sks = Number(sc.subject_sks || 2);
    const dayOfWeek = Number(sc.day_of_week); // 1 = Senin, 2 = Selasa, ..., 6 = Sabtu
    const startTime = sc.start_time as string;
    const endTime = sc.end_time as string;
    const room = sc.room as string;

    let meetingCounter = 1;
    let teachingWeekCounter = 1;

    for (let w = 1; w <= totalWeeks; w++) {
      const currentMonday = new Date(baseMonday);
      currentMonday.setUTCDate(baseMonday.getUTCDate() + (w - 1) * 7);

      // Class day in this week
      const classDate = new Date(currentMonday);
      classDate.setUTCDate(currentMonday.getUTCDate() + (dayOfWeek - 1));
      const classDateStr = formatDate(classDate);

      // Week 8 is UTS, Week 16 is UAS
      if (w === 8) {
        insertStatements.push({
          sql: `
            INSERT INTO meeting_sessions (
              id, schedule_id, subject_id, meeting_number, week_number,
              session_date, start_time, end_time, room, session_type, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UTS', 'Ujian Tengah Semester')
          `,
          args: [crypto.randomUUID(), scheduleId, subjectId, 0, w, classDateStr, startTime, endTime, room],
        });
        continue;
      }

      if (w === 16) {
        insertStatements.push({
          sql: `
            INSERT INTO meeting_sessions (
              id, schedule_id, subject_id, meeting_number, week_number,
              session_date, start_time, end_time, room, session_type, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UAS', 'Ujian Akhir Semester')
          `,
          args: [crypto.randomUUID(), scheduleId, subjectId, 0, w, classDateStr, startTime, endTime, room],
        });
        continue;
      }

      // Teaching Weeks
      if (sks === 2) {
        // 2 SKS: 1 Offline meeting per teaching week
        insertStatements.push({
          sql: `
            INSERT INTO meeting_sessions (
              id, schedule_id, subject_id, meeting_number, week_number,
              session_date, start_time, end_time, room, session_type, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OFFLINE', ?)
          `,
          args: [
            crypto.randomUUID(),
            scheduleId,
            subjectId,
            meetingCounter,
            w,
            classDateStr,
            startTime,
            endTime,
            room,
            `Pertemuan ${meetingCounter} (Tatap Muka)`,
          ],
        });
        meetingCounter++;
        totalSessions++;
      } else {
        // 3 SKS: 21 meetings pattern across 14 teaching weeks
        // If even teaching week: 2 meetings (Offline + E-Learning)
        const isEvenTeachingWeek = teachingWeekCounter % 2 === 0;

        // 1st meeting of week: Regular Offline
        insertStatements.push({
          sql: `
            INSERT INTO meeting_sessions (
              id, schedule_id, subject_id, meeting_number, week_number,
              session_date, start_time, end_time, room, session_type, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OFFLINE', ?)
          `,
          args: [
            crypto.randomUUID(),
            scheduleId,
            subjectId,
            meetingCounter,
            w,
            classDateStr,
            startTime,
            endTime,
            room,
            `Pertemuan ${meetingCounter} (Tatap Muka)`,
          ],
        });
        meetingCounter++;
        totalSessions++;

        // 2nd meeting of week (E-Learning on even teaching weeks)
        if (isEvenTeachingWeek) {
          insertStatements.push({
            sql: `
              INSERT INTO meeting_sessions (
                id, schedule_id, subject_id, meeting_number, week_number,
                session_date, start_time, end_time, room, session_type, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ELEARNING', ?)
            `,
            args: [
              crypto.randomUUID(),
              scheduleId,
              subjectId,
              meetingCounter,
              w,
              formatDate(currentMonday), // Active starting Monday of this week
              '00:00',
              '23:59',
              'LMS / Online',
              `Pertemuan ${meetingCounter} (E-Learning Asinkron)`,
            ],
          });
          meetingCounter++;
          totalSessions++;
        }
      }

      teachingWeekCounter++;
    }
  }

  // Execute in batches of 50 for speed and transaction safety
  const BATCH_SIZE = 50;
  for (let i = 0; i < insertStatements.length; i += BATCH_SIZE) {
    const chunk = insertStatements.slice(i, i + BATCH_SIZE);
    await db.batch(chunk, 'write');
  }

  return { totalGenerated: totalSessions };
}
