import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

import { env } from './config/env.js';
import { initDatabase } from './db/index.js';
import { seedDatabaseIfEmpty } from './db/seed.js';
import { startWhatsAppSocket } from './bot/socket.js';
import { initScheduler } from './scheduler/index.js';
import { apiRouter } from './server/routes/api.js';
import { loginHandler, logoutHandler, verifyHandler } from './server/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new Hono();

app.use('*', cors());

// Health Check Endpoint (Used by Cron-job.org / UptimeRobot to prevent Render sleeping)
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Authentication endpoints
app.post('/api/auth/login', loginHandler);
app.post('/api/auth/logout', logoutHandler);
app.get('/api/auth/verify', verifyHandler);

// API Routes
app.route('/api', apiRouter);

function resolveViewPath(relPath: string): string {
  const p1 = path.resolve(__dirname, 'server/views', relPath);
  if (fs.existsSync(p1)) return p1;
  return path.resolve(process.cwd(), 'src/server/views', relPath);
}

// Serve static assets (CSS/JS modules)
app.get('/static/*', (c) => {
  const relPath = c.req.path.replace(/^\/static\//, '');
  const filePath = resolveViewPath(relPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.html': 'text/html',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    };
    return c.body(fs.readFileSync(filePath), 200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
  }
  return c.text('Not found', 404);
});

// Serve Admin Dashboard HTML
app.get('/', (c) => {
  const htmlPath = resolveViewPath('index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  return c.html(htmlContent);
});

app.get('/dashboard', (c) => c.redirect('/'));

async function bootstrap(): Promise<void> {
  try {
    console.log('[Bootstrap] Initializing SQLite database schema on Turso...');
    await initDatabase();
    console.log('[Bootstrap] Database schema initialized.');

    // Auto-seed initial class data if database is empty
    await seedDatabaseIfEmpty();

    // Initialize in-memory milestone scheduler
    initScheduler();

    // Start Web Server
    serve(
      {
        fetch: app.fetch,
        port: env.PORT,
      },
      (info) => {
        console.log(`[Bootstrap] Web Admin Dashboard running at http://localhost:${info.port}`);
      }
    );

    // Start WhatsApp Engine Socket
    console.log('[Bootstrap] Starting WhatsApp socket...');
    await startWhatsAppSocket();
  } catch (error) {
    console.error('[Bootstrap] Failed to bootstrap application:', error);
    process.exit(1);
  }
}

// Global Exception Traps (ADR D11)
process.on('uncaughtException', (err) => {
  console.error('[Fatal] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled Rejection:', reason);
});

bootstrap();
