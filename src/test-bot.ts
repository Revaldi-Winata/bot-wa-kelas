import { compileNamingRegex } from './gdrive/index.js';
import { generateSemesterMeetingSessions } from './db/generator.js';
import { db } from './db/index.js';
import { sessionManager } from './bot/state.js';
import { rateLimiter } from './bot/rate-limiter.js';

async function testAll(): Promise<void> {
  console.log('--- STARTING BOT SELF-CHECK TESTS ---');

  // 1. Test Naming Regex
  console.log('1. Testing GDrive naming regex...');
  const regex = compileNamingRegex('pdf,zip');
  const validName1 = 'Budi Santoso_202043501234_Tugas1.pdf';
  const validName2 = 'Ahmad Fulan_12345678.zip';
  const invalidName1 = 'tugas_saya.pdf';
  const invalidName2 = 'Budi_202043501234.exe';

  if (!regex.test(validName1)) throw new Error(`Failed on validName1: ${validName1}`);
  if (!regex.test(validName2)) throw new Error(`Failed on validName2: ${validName2}`);
  if (regex.test(invalidName1)) throw new Error(`Allowed invalidName1: ${invalidName1}`);
  if (regex.test(invalidName2)) throw new Error(`Allowed invalidName2: ${invalidName2}`);
  console.log('   Regex test PASSED.');

  // 2. Test State Machine
  console.log('2. Testing State Machine Session Manager...');
  const testRemote = '12345@s.whatsapp.net';
  const testSender = '12345@s.whatsapp.net';
  sessionManager.setSession(testRemote, testSender, {
    state: 'AWAIT_MAIN_MENU',
    availableOptions: [0, 1, 2, 3, 4],
    retryCount: 0,
  });

  const session = sessionManager.getSession(testRemote, testSender);
  if (!session || session.state !== 'AWAIT_MAIN_MENU') throw new Error('Session state mismatch');
  const inv1 = sessionManager.recordInvalidAttempt(testRemote, testSender);
  if (inv1.isTerminated) throw new Error('Should not terminate on 1st invalid attempt');
  sessionManager.recordInvalidAttempt(testRemote, testSender);
  const inv3 = sessionManager.recordInvalidAttempt(testRemote, testSender);
  if (!inv3.isTerminated) throw new Error('Should terminate after 3 invalid attempts');
  console.log('   State Machine test PASSED.');

  // 3. Test Rate Limiter
  console.log('3. Testing Rate Limiter...');
  const isLimitedInitial = rateLimiter.isRateLimited(testRemote, testSender, false);
  if (isLimitedInitial) throw new Error('Should not be rate limited on first request');
  console.log('   Rate Limiter test PASSED.');

  // 4. Test Semester Projection & Database
  console.log('4. Testing Semester Meeting Generator in DB...');
  const res = await generateSemesterMeetingSessions({
    startDate: '2026-09-07',
    semesterName: 'Test Semester 2026',
    totalWeeks: 16,
  });
  console.log(`   Generated ${res.totalGenerated} projected meeting sessions.`);
  if (res.totalGenerated === 0) throw new Error('Failed to generate semester sessions');

  // Verify meeting types
  const meetings = await db.execute('SELECT session_type, count(*) as count FROM meeting_sessions GROUP BY session_type');
  console.log('   Meeting Session Type Breakdown:');
  for (const row of meetings.rows) {
    console.log(`   - ${row.session_type}: ${row.count} sessions`);
  }

  console.log('--- ALL BOT UNIT TESTS PASSED SUCCESSFULLY ---');
}

testAll().catch((err) => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
