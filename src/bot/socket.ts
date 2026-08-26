import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'node:fs';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import { env } from '../config/env.js';
import { handleIncomingMessage } from './router.js';
import { syncGroupParticipants } from './whitelist.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'QR_REQUIRED';

export interface BotTelemetry {
  status: ConnectionStatus;
  qrCodeData: string | null;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  lastConnectedAt: Date | null;
  reconnectAttempts: number;
}

export const botTelemetry: BotTelemetry = {
  status: 'DISCONNECTED',
  qrCodeData: null,
  qrDataUrl: null,
  phoneNumber: null,
  lastConnectedAt: null,
  reconnectAttempts: 0,
};

let activeSocket: WASocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;

export function getActiveSocket(): WASocket | null {
  return activeSocket;
}

export async function startWhatsAppSocket(): Promise<WASocket> {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  botTelemetry.status = 'CONNECTING';
  logger.info('Initializing WhatsApp Baileys socket...');

  const { state, saveCreds } = await useMultiFileAuthState(env.AUTH_FOLDER);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info({ version, isLatest }, 'Using Baileys version');

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Bot WA Kelas', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  activeSocket = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      botTelemetry.status = 'QR_REQUIRED';
      botTelemetry.qrCodeData = qr;
      botTelemetry.phoneNumber = null;

      try {
        botTelemetry.qrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
      } catch (e) {
        console.error('Failed to generate QR Data URL:', e);
      }

      logger.info('QR Code received. Displaying in terminal and dashboard...');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn({ statusCode, shouldReconnect }, 'WhatsApp connection closed.');

      if (shouldReconnect) {
        botTelemetry.status = 'CONNECTING';
        botTelemetry.reconnectAttempts += 1;
        // Exponential Backoff: 2s, 4s, 8s, max 30s
        const backoffMs = Math.min(2000 * Math.pow(2, Math.min(botTelemetry.reconnectAttempts, 4)), 30000);
        logger.info(`Reconnecting in ${backoffMs / 1000}s (attempt ${botTelemetry.reconnectAttempts})...`);

        reconnectTimeout = setTimeout(() => {
          startWhatsAppSocket().catch((err) => logger.error({ err }, 'Error during socket reconnect'));
        }, backoffMs);
      } else {
        logger.error('WhatsApp session logged out. Clearing auth cache and generating new QR...');
        botTelemetry.status = 'QR_REQUIRED';
        botTelemetry.phoneNumber = null;
        botTelemetry.qrCodeData = null;
        botTelemetry.qrDataUrl = null;

        // Clean corrupt auth cache
        try {
          if (fs.existsSync(env.AUTH_FOLDER)) {
            fs.rmSync(env.AUTH_FOLDER, { recursive: true, force: true });
          }
        } catch (e) {
          console.error('Error cleaning auth folder:', e);
        }

        reconnectTimeout = setTimeout(() => {
          startWhatsAppSocket().catch((err) => logger.error({ err }, 'Error restarting fresh socket'));
        }, 2000);
      }
    } else if (connection === 'open') {
      botTelemetry.status = 'CONNECTED';
      botTelemetry.qrCodeData = null;
      botTelemetry.qrDataUrl = null;
      botTelemetry.lastConnectedAt = new Date();
      botTelemetry.reconnectAttempts = 0;

      const userJid = sock.user?.id || '';
      botTelemetry.phoneNumber = userJid.split(':')[0].split('@')[0];

      logger.info({ user: sock.user, phone: botTelemetry.phoneNumber }, 'WhatsApp connection established successfully!');

      // Synchronize whitelist participants from main class group
      await syncGroupParticipants(sock);
    }
  });

  // Listen for group participant changes (auto-sync whitelist)
  sock.ev.on('group-participants.update', async (event) => {
    logger.info({ event }, 'Group participant update event received.');
    await syncGroupParticipants(sock, event.id);
  });

  // Message handler
  sock.ev.on('messages.upsert', async (event) => {
    for (const msg of event.messages) {
      try {
        await handleIncomingMessage(sock, msg);
      } catch (err) {
        logger.error({ err }, 'Unhandled error inside messages.upsert');
      }
    }
  });

  return sock;
}

export function getTelemetry(): BotTelemetry {
  return botTelemetry;
}

export async function restartSocket(): Promise<void> {
  if (activeSocket) {
    try {
      activeSocket.end(undefined);
    } catch (_) {}
    activeSocket = null;
  }
  await startWhatsAppSocket();
}

