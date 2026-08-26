import { WASocket } from '@whiskeysockets/baileys';
import { db } from '../db/index.js';
import { env } from '../config/env.js';
import pino from 'pino';

const logger = pino({ name: 'whitelist-sync' });

export async function getMainClassGroupJid(): Promise<string | null> {
  const dbRes = await db.execute("SELECT value FROM system_configs WHERE key = 'main_class_group_jid' LIMIT 1");
  if (dbRes.rows.length > 0 && dbRes.rows[0].value) {
    return String(dbRes.rows[0].value);
  }
  const mappingRes = await db.execute("SELECT group_jid FROM channel_mappings WHERE role = 'MAIN_CLASS_GROUP' LIMIT 1");
  if (mappingRes.rows.length > 0 && mappingRes.rows[0].group_jid) {
    return String(mappingRes.rows[0].group_jid);
  }
  return env.MAIN_CLASS_GROUP_JID || null;
}

export async function syncGroupParticipants(sock: WASocket, groupJid?: string): Promise<number> {
  const targetGroupJid = groupJid || (await getMainClassGroupJid());
  if (!targetGroupJid) {
    logger.warn('MAIN_CLASS_GROUP_JID is not configured. Skipping automatic whitelist sync.');
    return 0;
  }

  try {
    logger.info({ groupJid: targetGroupJid }, 'Fetching group metadata for participant sync...');
    const metadata = await sock.groupMetadata(targetGroupJid);
    const participants = metadata.participants || [];

    let syncedCount = 0;
    for (const p of participants) {
      const rawPhone = (p as any).phoneNumber || p.id || '';
      const cleanPhone = rawPhone.replace(/@.*$/, '').split(':')[0].replace(/[^0-9]/g, '');
      if (!cleanPhone) continue;

      const displayName = (p as any).notify || (p as any).name || cleanPhone;

      await db.execute({
        sql: `
          INSERT INTO whitelist_members (id, jid, phone_number, display_name, last_seen_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(jid) DO UPDATE SET
            phone_number = excluded.phone_number,
            display_name = COALESCE(NULLIF(excluded.display_name, ''), whitelist_members.display_name),
            last_seen_at = CURRENT_TIMESTAMP
        `,
        args: [p.id, p.id, cleanPhone, displayName],
      });
      syncedCount++;
    }

    // Auto-register group in channel_mappings if not present
    await db.execute({
      sql: `
        INSERT INTO channel_mappings (id, group_jid, group_name, role, last_synced_at)
        VALUES (?, ?, ?, 'MAIN_CLASS_GROUP', CURRENT_TIMESTAMP)
        ON CONFLICT(group_jid) DO UPDATE SET
          group_name = excluded.group_name,
          role = 'MAIN_CLASS_GROUP',
          last_synced_at = CURRENT_TIMESTAMP
      `,
      args: [targetGroupJid, targetGroupJid, metadata.subject || 'Grup Utama Kelas'],
    });

    logger.info({ syncedCount }, 'Group participants successfully synchronized to whitelist.');
    return syncedCount;
  } catch (error) {
    logger.error({ err: error }, 'Failed to synchronize group participants');
    return 0;
  }
}

export async function isSenderWhitelisted(senderJid: string): Promise<boolean> {
  const cleanJid = senderJid.split(':')[0] + (senderJid.includes('@') ? '' : '@s.whatsapp.net');
  const res = await db.execute({
    sql: 'SELECT id FROM whitelist_members WHERE jid = ? OR jid LIKE ? LIMIT 1',
    args: [cleanJid, `${cleanJid.split('@')[0]}%`],
  });

  // If whitelist is still empty, allow all to bootstrap
  const totalCheck = await db.execute('SELECT count(*) as total FROM whitelist_members');
  const count = Number(totalCheck.rows[0]?.total || 0);
  if (count === 0) return true;

  return res.rows.length > 0;
}

export async function isGroupAllowed(groupJid: string): Promise<boolean> {
  if (env.MAIN_CLASS_GROUP_JID && env.MAIN_CLASS_GROUP_JID === groupJid) return true;

  const res = await db.execute({
    sql: 'SELECT id FROM channel_mappings WHERE group_jid = ? LIMIT 1',
    args: [groupJid],
  });

  // If no specific group configured in env, allow all class groups
  return res.rows.length > 0 || !env.MAIN_CLASS_GROUP_JID;
}
