import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { getTelemetry, restartSocket, getActiveSocket } from '../../bot/socket.js';
import { syncGroupParticipants } from '../../bot/whitelist.js';
import { logAudit } from '../../db/audit.js';

export const telemetryRouter = new Hono();

// --- WhatsApp Telemetry & Bot Control ---
telemetryRouter.get('/telemetry', async (c) => {
  const telemetry = getTelemetry();
  const subjectsCount = await db.execute('SELECT COUNT(*) as count FROM subjects');
  const tasksCount = await db.execute('SELECT COUNT(*) as count FROM assignments WHERE is_active = 1');
  const whitelistCount = await db.execute('SELECT COUNT(*) as count FROM whitelist_members');

  return c.json({
    status: 'ok',
    telemetry,
    stats: {
      totalSubjects: subjectsCount.rows[0]?.count || 0,
      totalActiveTasks: tasksCount.rows[0]?.count || 0,
      totalWhitelistMembers: whitelistCount.rows[0]?.count || 0,
    },
  });
});

telemetryRouter.post('/bot/restart', async (c) => {
  await restartSocket();
  await logAudit('BOT_SOCKET', 'Perintah restart socket WhatsApp dijalankan via Dashboard', 'INFO');
  return c.json({ status: 'restarting' });
});

// --- Whitelist Members CRUD & Sync ---
telemetryRouter.get('/whitelist', async (c) => {
  const res = await db.execute('SELECT * FROM whitelist_members ORDER BY display_name ASC, phone_number ASC');
  return c.json(res.rows);
});

telemetryRouter.put('/whitelist/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { displayName } = body;

  await db.execute({
    sql: 'UPDATE whitelist_members SET display_name = ? WHERE id = ?',
    args: [displayName || null, id],
  });
  await logAudit('WHITELIST', `Ubah nama mahasiswa (ID: ${id}) menjadi "${displayName}"`, 'INFO', { id, displayName });
  return c.json({ status: 'updated' });
});

telemetryRouter.post('/whitelist/sync', async (c) => {
  const sock = getActiveSocket();
  if (!sock) {
    return c.json({ status: 'error', message: 'WhatsApp bot belum terhubung ke WhatsApp' }, 400);
  }
  const body = await c.req.json().catch(() => ({}));
  const { getMainClassGroupJid } = await import('../../bot/whitelist.js');
  const targetJid = body.groupJid || (await getMainClassGroupJid());

  if (!targetJid) {
    return c.json({ status: 'error', message: 'Pilih grup WhatsApp kelas terlebih dahulu pada dropdown.' }, 400);
  }

  const count = await syncGroupParticipants(sock, targetJid);
  if (count === 0) {
    await logAudit('BOT_SYNC', `Gagal sinkronisasi anggota grup (${targetJid})`, 'WARN', { targetJid });
    return c.json({ status: 'error', message: 'Gagal membaca anggota grup. Pastikan bot adalah anggota/admin grup tersebut.' }, 400);
  }
  await logAudit('BOT_SYNC', `Sinkronisasi selesai: ${count} anggota berhasil diimpor ke whitelist`, 'SUCCESS', { targetJid, count });
  return c.json({ status: 'synced', count });
});

// --- WhatsApp Group Management ---
telemetryRouter.get('/groups', async (c) => {
  const sock = getActiveSocket();
  const mainJidRes = await db.execute("SELECT value FROM system_configs WHERE key = 'main_class_group_jid' LIMIT 1");
  const currentMainJid = (mainJidRes.rows[0]?.value as string) || '';

  const mappingRes = await db.execute('SELECT * FROM channel_mappings');
  const mappingsMap = new Map(mappingRes.rows.map(m => [m.group_jid, m]));

  if (sock) {
    try {
      const groupsMap = await sock.groupFetchAllParticipating();
      const groupsList = Object.values(groupsMap).map((g: any) => {
        const mapping: any = mappingsMap.get(g.id);
        const isMain = g.id === currentMainJid || mapping?.role === 'MAIN_CLASS_GROUP';
        return {
          id: g.id,
          name: g.subject || 'Tanpa Nama',
          participantsCount: g.participants?.length || 0,
          role: isMain ? 'MAIN_CLASS_GROUP' : (mapping?.role || 'OTHER'),
          isMain,
        };
      });
      return c.json(groupsList);
    } catch (_) {}
  }

  // Fallback to database channel_mappings
  const fallbackList = mappingRes.rows.map((m: any) => ({
    id: m.group_jid,
    name: m.group_name,
    participantsCount: 0,
    role: m.role,
    isMain: m.group_jid === currentMainJid || m.role === 'MAIN_CLASS_GROUP',
  }));

  return c.json(fallbackList);
});

telemetryRouter.post('/groups/set-main', async (c) => {
  const body = await c.req.json();
  const { groupJid, groupName } = body;

  if (!groupJid) {
    return c.json({ status: 'error', message: 'groupJid wajib diisi' }, 400);
  }

  // Update system_configs
  await db.execute({
    sql: `
      INSERT INTO system_configs (key, value, updated_at)
      VALUES ('main_class_group_jid', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `,
    args: [groupJid],
  });

  // Update channel_mappings
  await db.execute("UPDATE channel_mappings SET role = 'OTHER' WHERE role = 'MAIN_CLASS_GROUP'");
  await db.execute({
    sql: `
      INSERT INTO channel_mappings (id, group_jid, group_name, role, last_synced_at)
      VALUES (?, ?, ?, 'MAIN_CLASS_GROUP', CURRENT_TIMESTAMP)
      ON CONFLICT(group_jid) DO UPDATE SET
        group_name = excluded.group_name,
        role = 'MAIN_CLASS_GROUP',
        last_synced_at = CURRENT_TIMESTAMP
    `,
    args: [groupJid, groupJid, groupName || 'Grup Utama Kelas'],
  });

  let syncedCount = 0;
  const sock = getActiveSocket();
  if (sock) {
    syncedCount = await syncGroupParticipants(sock, groupJid);
  }

  await logAudit('BOT_SYNC', `Grup Utama Kelas ditetapkan ke "${groupName || 'Grup Kelas'}" (${syncedCount} anggota disinkronkan)`, 'SUCCESS', { groupJid, groupName, syncedCount });
  return c.json({ status: 'ok', groupJid, syncedCount });
});

// --- System Logs & Recent Messages ---
telemetryRouter.get('/logs', async (c) => {
  const res = await db.execute('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 60');
  return c.json(res.rows);
});

telemetryRouter.get('/bot/recent-messages', async (c) => {
  const res = await db.execute(`
    SELECT *
    FROM audit_logs
    WHERE category IN ('BOT_MESSAGE', 'DAILY_SCHEDULE', 'ELEARNING_REMINDER', 'TASK_REMINDER', 'BROADCAST_SCHEDULE', 'BROADCAST_TASK')
      AND created_at >= datetime('now', '-7 days')
    ORDER BY created_at DESC
    LIMIT 10
  `);
  return c.json(res.rows);
});
