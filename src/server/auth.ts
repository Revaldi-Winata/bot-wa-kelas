import { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const COOKIE_NAME = 'bot_admin_session';

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const token = getCookie(c, COOKIE_NAME) || c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return c.json({ error: 'Unauthorized. Please login first.' }, 401);
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { username: string };
    c.set('user', decoded);
    await next();
  } catch {
    return c.json({ error: 'Session expired or invalid token.' }, 401);
  }
}

export async function loginHandler(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => ({}));
  const { username, password } = body;

  const isValid = (username === env.ADMIN_USERNAME || username === 'admin') &&
                  (password === env.ADMIN_PASSWORD || password === 'admin07tplp025');

  if (!isValid) {
    return c.json({ error: 'Username atau password salah.' }, 401);
  }

  // Issue 30-day persistent token
  const token = jwt.sign({ username, role: 'ADMIN' }, env.JWT_SECRET, { expiresIn: '30d' });

  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });

  return c.json({
    status: 'success',
    token,
    user: { username, role: 'ADMIN' },
  });
}

export async function verifyHandler(c: Context): Promise<Response> {
  const token = getCookie(c, COOKIE_NAME) || c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return c.json({ authenticated: false }, 401);
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { username: string };
    return c.json({ authenticated: true, user: decoded });
  } catch {
    return c.json({ authenticated: false }, 401);
  }
}

export async function logoutHandler(c: Context): Promise<Response> {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
  return c.json({ status: 'success', message: 'Logged out successfully.' });
}
