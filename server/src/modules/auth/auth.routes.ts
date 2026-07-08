import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { recordAction } from '../actionlog/actionlog.service.js';
import { SESSION_COOKIE_NAME, changePassword, isValidSession, login, logout } from './auth.service.js';

const loginBody = z.object({ password: z.string().min(1), name: z.string().optional() });
const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const body = loginBody.parse(request.body);
    const result = await login(body.password, body.name);
    if (!result) {
      return reply.code(401).send({ error: 'Incorrect password' });
    }
    reply.setCookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      expires: result.expiresAt,
    });
    await recordAction({
      actorName: result.actorName,
      method: 'POST',
      path: '/api/auth/login',
      summary: result.actorName ? `${result.actorName} logged in` : 'Logged in (no name given)',
    }).catch(() => {});
    return { isAdmin: true };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await logout(request.cookies[SESSION_COOKIE_NAME]);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/session', async (request) => {
    const isAdmin = await isValidSession(request.cookies[SESSION_COOKIE_NAME]);
    return { isAdmin };
  });

  app.post('/api/auth/change-password', { preHandler: requireAdmin }, async (request, reply) => {
    const body = changePasswordBody.parse(request.body);
    const ok = await changePassword(request.cookies[SESSION_COOKIE_NAME], body.currentPassword, body.newPassword);
    if (!ok) {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }
    return { ok: true };
  });
}
