import { createClient } from '@libsql/client';
import { env } from '../config/env.js';

export const db = createClient({
  url: env.DATABASE_URL,
  authToken: env.DATABASE_AUTH_TOKEN,
});

export async function initDatabase(): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lecturers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      lecturer_id TEXT,
      code TEXT,
      name TEXT NOT NULL,
      sks INTEGER DEFAULT 2,
      wa_group_jid TEXT,
      general_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lecturer_id) REFERENCES lecturers(id)
    );

    CREATE TABLE IF NOT EXISTS semester_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      total_weeks INTEGER DEFAULT 16,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room TEXT NOT NULL,
      status TEXT DEFAULT 'NORMAL',
      status_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meeting_sessions (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      meeting_number INTEGER NOT NULL,
      week_number INTEGER NOT NULL,
      session_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      room TEXT,
      session_type TEXT DEFAULT 'OFFLINE',
      notes TEXT,
      mentari_url TEXT,
      is_completed BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      meeting_number INTEGER DEFAULT 1,
      description TEXT NOT NULL,
      deadline DATETIME NOT NULL,
      submission_url TEXT,
      allowed_exts TEXT DEFAULT 'pdf,zip',
      reminder_h3 BOOLEAN DEFAULT 1,
      reminder_h2 BOOLEAN DEFAULT 1,
      reminder_h1 BOOLEAN DEFAULT 1,
      reminder_h0 BOOLEAN DEFAULT 1,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channel_mappings (
      id TEXT PRIMARY KEY,
      group_jid TEXT UNIQUE NOT NULL,
      group_name TEXT NOT NULL,
      role TEXT NOT NULL,
      subject_id TEXT,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );

    CREATE TABLE IF NOT EXISTS whitelist_members (
      id TEXT PRIMARY KEY,
      jid UNIQUE NOT NULL,
      phone_number TEXT NOT NULL,
      display_name TEXT,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reminder_logs (
      id TEXT PRIMARY KEY,
      assignment_id TEXT,
      reminder_type TEXT NOT NULL,
      target_jid TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_configs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe migrations for existing SQLite tables
  try {
    await db.execute('ALTER TABLE meeting_sessions ADD COLUMN mentari_url TEXT');
  } catch (_) {}
  try {
    await db.execute('ALTER TABLE subjects ADD COLUMN general_notes TEXT');
  } catch (_) {}
  try {
    await db.execute('ALTER TABLE semester_configs ADD COLUMN end_date TEXT');
  } catch (_) {}

  // Optimize query performance with essential indexes
  await db.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_meeting_sessions_date ON meeting_sessions(session_date);
    CREATE INDEX IF NOT EXISTS idx_meeting_sessions_subject ON meeting_sessions(subject_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_deadline ON assignments(deadline, is_active);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_reminder_logs_dedup ON reminder_logs(assignment_id, reminder_type, target_jid);
  `);
}
