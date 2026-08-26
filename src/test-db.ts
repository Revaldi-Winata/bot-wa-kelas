import { initDatabase, db } from './db/index.js';

async function test() {
  console.log('Testing Turso connection...');
  await initDatabase();
  console.log('Database schema created/verified.');
  const res = await db.execute('SELECT sqlite_version() as version');
  console.log('Turso SQLite Version:', res.rows[0]);
  console.log('TURSO_CONNECTION_SUCCESS');
}

test().catch(err => {
  console.error('TURSO_CONNECTION_FAILED:', err);
  process.exit(1);
});
