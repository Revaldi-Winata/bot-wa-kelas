import { db } from './index.js';

export async function logAudit(
  category: string,
  message: string,
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' = 'INFO',
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    await db.execute({
      sql: `
        INSERT INTO audit_logs (id, level, category, message, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      args: [
        crypto.randomUUID(),
        level,
        category,
        message,
        Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      ],
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
