import { db } from './index.js';

export async function seedDatabaseIfEmpty(): Promise<void> {
  // Production ready: Clean schema ready for admin input
  const subCheck = await db.execute('SELECT count(*) as total FROM subjects');
  const count = Number(subCheck.rows[0]?.total || 0);
  if (count === 0) {
    console.log('[Database] Database ready (clean state).');
  }
}
