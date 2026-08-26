import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().default('super_secret_jwt_key_bot_wa_kelas_2026_secure_key'),
  ADMIN_USERNAME: z.string().default('07tplp025admin'),
  ADMIN_PASSWORD: z.string().default('admin07tplp025'),
  DATABASE_URL: z.string().default('libsql://bot-wa-kelas-techspace.aws-ap-northeast-1.turso.io'),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  AUTH_FOLDER: z.string().default('./data/auth_info_baileys'),
  MAIN_CLASS_GROUP_JID: z.string().optional(),
});

export const env = envSchema.parse(process.env);
