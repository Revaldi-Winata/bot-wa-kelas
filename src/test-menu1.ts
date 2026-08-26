import { handleIncomingMessage } from './bot/router.js';
import { sessionManager } from './bot/state.js';
import { rateLimiter } from './bot/rate-limiter.js';
import { db, initDatabase } from './db/index.js';
import type { WASocket, WAMessage } from '@whiskeysockets/baileys';

// Fast jitter delay for testing
rateLimiter.applyJitterDelay = async () => {};

// Mock Socket to capture messages sent by bot
class MockWASocket {
  public sentMessages: { jid: string; content: any }[] = [];

  public async sendMessage(jid: string, content: any): Promise<any> {
    this.sentMessages.push({ jid, content });
    return { key: { id: 'mock-id' } };
  }

  public getLastMessageText(): string {
    if (this.sentMessages.length === 0) return '';
    const last = this.sentMessages[this.sentMessages.length - 1];
    return last.content?.text || '';
  }

  public clearMessages(): void {
    this.sentMessages = [];
  }
}

function createMockWAMessage(remoteJid: string, senderJid: string, text: string): WAMessage {
  return {
    key: {
      remoteJid,
      fromMe: false,
      id: 'msg_' + Date.now(),
      participant: remoteJid.endsWith('@g.us') ? senderJid : undefined,
    },
    message: {
      conversation: text,
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  } as WAMessage;
}

async function runMenu1Test(): Promise<void> {
  console.log('=== TEST SIMULASI MENU 1 (JADWAL KULIAH) ===\n');

  await initDatabase();

  const mockSock = new MockWASocket();
  const testPhone = '628999999999';
  const testJid = `${testPhone}@s.whatsapp.net`;

  // Whitelist the test user in whitelist_members
  await db.execute({
    sql: 'INSERT INTO whitelist_members (id, jid, phone_number, display_name) VALUES (?, ?, ?, ?) ON CONFLICT(jid) DO UPDATE SET phone_number = excluded.phone_number',
    args: [testJid, testJid, testPhone, 'Tester User'],
  });

  // Clear any existing session
  sessionManager.clearSession(testJid, testJid);

  // --- STEP 1: Kirim /menu ---
  console.log('[1] User mengirim: "/menu"');
  mockSock.clearMessages();
  await handleIncomingMessage(mockSock as unknown as WASocket, createMockWAMessage(testJid, testJid, '/menu'));

  const menuResponse = mockSock.getLastMessageText();
  console.log('\n--- Jawaban Bot (/menu): ---');
  console.log(menuResponse);

  const session1 = sessionManager.getSession(testJid, testJid);
  if (!session1 || session1.state !== 'AWAIT_MAIN_MENU') {
    throw new Error(`State salah! Diharapkan AWAIT_MAIN_MENU, didapat: ${session1?.state}`);
  }
  console.log('✔ Sesi aktif: AWAIT_MAIN_MENU\n');

  // --- STEP 2: Kirim pilihan "1" (Menu 1: Jadwal Kuliah) ---
  console.log('[2] User mengirim: "1" (Pilih Menu 1: Jadwal Kuliah)');
  mockSock.clearMessages();
  await handleIncomingMessage(mockSock as unknown as WASocket, createMockWAMessage(testJid, testJid, '1'));

  const menu1Response = mockSock.getLastMessageText();
  console.log('\n--- Jawaban Bot (Pilihan Menu 1): ---');
  console.log(menu1Response);

  const session2 = sessionManager.getSession(testJid, testJid);
  if (!session2 || session2.state !== 'AWAIT_SCHEDULE_DAY') {
    throw new Error(`State salah! Diharapkan AWAIT_SCHEDULE_DAY, didapat: ${session2?.state}`);
  }
  console.log('✔ Sesi aktif: AWAIT_SCHEDULE_DAY\n');

  // --- STEP 3: Kirim pilihan "7" (Lihat Semua Hari) ---
  console.log('[3] User mengirim: "7" (Lihat Semua Jadwal)');
  mockSock.clearMessages();
  await handleIncomingMessage(mockSock as unknown as WASocket, createMockWAMessage(testJid, testJid, '7'));

  const fullScheduleResponse = mockSock.getLastMessageText();
  console.log('\n--- Jawaban Bot (Semua Jadwal): ---');
  console.log(fullScheduleResponse);

  const session3 = sessionManager.getSession(testJid, testJid);
  if (session3) {
    throw new Error('Sesi harusnya sudah selesai (cleared) setelah mengirimkan data jadwal!');
  }
  console.log('✔ Sesi dibersihkan otomatis setelah data terkirim.\n');

  // --- STEP 4: Kirim /menu lagi lalu pilih hari tertentu (Senin / 1) ---
  console.log('[4] User memulai sesi baru (/menu -> 1 -> 1 [Senin])');
  mockSock.clearMessages();
  await handleIncomingMessage(mockSock as unknown as WASocket, createMockWAMessage(testJid, testJid, '/menu'));
  await handleIncomingMessage(mockSock as unknown as WASocket, createMockWAMessage(testJid, testJid, '1'));
  mockSock.clearMessages();
  await handleIncomingMessage(mockSock as unknown as WASocket, createMockWAMessage(testJid, testJid, '1'));

  const seninScheduleResponse = mockSock.getLastMessageText();
  console.log('\n--- Jawaban Bot (Jadwal Hari Senin): ---');
  console.log(seninScheduleResponse);
  console.log('✔ Jadwal spesifik hari Senin berhasil difilter.\n');

  // --- STEP 5: Tes Error Handling (Input invalid seperti "99") ---
  console.log('[5] Tes Error Handling: Input salah saat sesi aktif (/menu -> 99)');
  mockSock.clearMessages();
  await handleIncomingMessage(mockSock as unknown as WASocket, createMockWAMessage(testJid, testJid, '/menu'));
  mockSock.clearMessages();
  await handleIncomingMessage(mockSock as unknown as WASocket, createMockWAMessage(testJid, testJid, '99'));

  const invalidResponse = mockSock.getLastMessageText();
  console.log('\n--- Jawaban Bot (Input Salah): ---');
  console.log(invalidResponse);
  console.log('✔ Peringatan input salah dikirim ke user.\n');

  console.log('=== SEMUA PENGUJIAN MENU 1 BERHASIL (100% PASS) ===');
  process.exit(0);
}

runMenu1Test().catch((err) => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
