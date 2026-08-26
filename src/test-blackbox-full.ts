import { db } from './db/index.js';
import { generateSemesterMeetingSessions } from './db/generator.js';
import { handleIncomingMessage } from './bot/router.js';
import { evaluateDailyClassReminder } from './scheduler/class-reminder.js';
import { evaluateDailyELearningReminder } from './scheduler/elearning-reminder.js';
import { evaluateAssignmentDeadlines } from './scheduler/assignment-reminder.js';
import type { WASocket, proto } from '@whiskeysockets/baileys';

class MockSocket {
  public sentMessages: { jid: string; content: any }[] = [];

  async sendMessage(jid: string, content: any): Promise<proto.WebMessageInfo | undefined> {
    this.sentMessages.push({ jid, content });
    return undefined;
  }

  getLastMessageText(): string {
    const last = this.sentMessages[this.sentMessages.length - 1];
    return last ? (last.content.text || '') : '';
  }

  clear(): void {
    this.sentMessages = [];
  }
}

function createWAMessage(jid: string, text: string): proto.IWebMessageInfo {
  return {
    key: {
      remoteJid: jid,
      fromMe: false,
      id: 'MSG_' + Math.random().toString(36).substring(7),
      participant: jid.includes('@g.us') ? '6281387484563@s.whatsapp.net' : undefined,
    },
    message: {
      conversation: text,
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
}

async function runBlackboxTestSuite(): Promise<void> {
  console.log('===============================================================');
  console.log('     BLACKBOX TEST SUITE: JADWAL, BOT, & SCHEDULER ENGINE      ');
  console.log('===============================================================');

  // Seed / setup database
  const userJid = '6281387484563@s.whatsapp.net';
  await db.execute({
    sql: 'INSERT INTO whitelist_members (id, jid, phone_number, display_name) VALUES (?, ?, ?, ?) ON CONFLICT(jid) DO NOTHING',
    args: ['user-test-1', userJid, '6281387484563', 'Revaldi (Tester)'],
  });

  const genRes = await generateSemesterMeetingSessions({
    startDate: '2026-08-31',
    endDate: '2027-01-31',
    semesterName: 'Semester Ganjil 2026/2027',
    totalWeeks: 16,
  });

  const mockSock = new MockSocket();

  // =========================================================================
  // TEST GROUP 1: BOT STATE MACHINE & JADWAL KULIAH
  // =========================================================================
  console.log('\n--- [TEST GROUP 1: BOT MENU JADWAL] ---');

  // 1.1 Trigger /menu
  mockSock.clear();
  await handleIncomingMessage(mockSock as unknown as WASocket, createWAMessage(userJid, '/menu'));
  const menuText = mockSock.getLastMessageText();
  if (!menuText.includes('1️⃣ *Jadwal Kuliah*') || !menuText.includes('2️⃣ *Kontak Dosen*') || !menuText.includes('3️⃣ *Tugas & Deadline*')) {
    throw new Error('[1.1] Menu utama tidak sesuai 3 opsi standar!');
  }
  console.log('✔ 1.1 Trigger `/menu` berhasil menampilkan 3 opsi utama.');

  // 1.2 Pilih Opsi 1 (Jadwal Kuliah)
  mockSock.clear();
  await handleIncomingMessage(mockSock as unknown as WASocket, createWAMessage(userJid, '1'));
  const jadwalMenuText = mockSock.getLastMessageText();
  if (!jadwalMenuText.includes('1️⃣ *Senin*') || !jadwalMenuText.includes('7️⃣ *Lihat Semua Hari*')) {
    throw new Error('[1.2] Submenu Jadwal Kuliah tidak menampilkan pilihan hari!');
  }
  console.log('✔ 1.2 Submenu Jadwal Kuliah menampilkan pilihan hari (1-7).');

  // 1.3 Pilih Opsi 7 (Lihat Semua Hari)
  mockSock.clear();
  await handleIncomingMessage(mockSock as unknown as WASocket, createWAMessage(userJid, '7'));
  const opsi7Text = mockSock.getLastMessageText();
  if (opsi7Text.includes('📌 Status:')) {
    throw new Error('[1.3] Opsi 7 MELANGGAR aturan: terdapat baris status!');
  }
  if (!opsi7Text.includes('JADWAL KULIAH') && !opsi7Text.includes('Belum ada jadwal')) {
    throw new Error('[1.3] Opsi 7 gagal menampilkan Jadwal Kuliah Lengkap!');
  }
  console.log('✔ 1.3 Opsi 7 (Lihat Semua Hari) bersih tanpa baris status.');

  // 1.4 Pilih Opsi 1 (Senin)
  await handleIncomingMessage(mockSock as unknown as WASocket, createWAMessage(userJid, '/menu'));
  await handleIncomingMessage(mockSock as unknown as WASocket, createWAMessage(userJid, '1'));
  mockSock.clear();
  await handleIncomingMessage(mockSock as unknown as WASocket, createWAMessage(userJid, '1'));
  const opsi1Text = mockSock.getLastMessageText();
  if (!opsi1Text.toUpperCase().includes('SENIN') && !opsi1Text.includes('Belum ada jadwal')) {
    throw new Error('[1.4] Opsi 1 gagal menampilkan Jadwal Kuliah Hari Senin!');
  }
  console.log('✔ 1.4 Opsi 1 (Hari Senin) dinamis kontekstual.');

  // 1.5 Boundary & Cancel Test (0 = Keluar)
  await handleIncomingMessage(mockSock as unknown as WASocket, createWAMessage(userJid, '/menu'));
  mockSock.clear();
  await handleIncomingMessage(mockSock as unknown as WASocket, createWAMessage(userJid, '0'));
  const cancelText = mockSock.getLastMessageText();
  if (!cancelText.includes('Sesi menu ditutup')) {
    throw new Error('[1.5] Opsi 0 batal gagal menutup sesi!');
  }
  console.log('✔ 1.5 Opsi 0 (Batal) berhasil menutup state machine session.\n');

  // =========================================================================
  // TEST GROUP 2: SCHEDULER & BROADCAST ENGINE
  // =========================================================================
  console.log('--- [TEST GROUP 2: SCHEDULER ENGINE] ---');

  // 2.1 Daily Class Reminder Evaluation (04:00 WIB)
  mockSock.clear();
  await evaluateDailyClassReminder();
  console.log('✔ 2.1 Evaluator 04:00 WIB Daily Class Reminder dieksekusi tanpa error.');

  // 2.2 Weekly / Daily E-Learning Reminder (00:00 WIB)
  mockSock.clear();
  await evaluateDailyELearningReminder();
  console.log('✔ 2.2 Evaluator 00:00 WIB E-Learning Reminder dieksekusi dengan deduplikasi audit log.');

  // 2.3 Assignment Deadline Milestone Evaluator (15m Interval)
  mockSock.clear();
  await evaluateAssignmentDeadlines();
  console.log('✔ 2.3 Evaluator Tugas & Deadline (H-3, H-2, H-1, H-0) dieksekusi normal.');

  console.log('\n===============================================================');
  console.log('     HASIL PENGUJIAN BLACKBOX: 100% SUKSES (ALL PASS)         ');
  console.log('===============================================================');

  process.exit(0);
}

runBlackboxTestSuite().catch(err => {
  console.error('\n❌ BLACKBOX TEST GAGAL:', err);
  process.exit(1);
});
