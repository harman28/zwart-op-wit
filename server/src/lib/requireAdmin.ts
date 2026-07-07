import type { FastifyReply, FastifyRequest } from 'fastify';
import { isValidSession, SESSION_COOKIE_NAME } from '../modules/auth/auth.service.js';

/** preHandler for every /api/admin/* route — one place, reused everywhere. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const valid = await isValidSession(token);
  if (!valid) {
    await reply.code(401).send({ error: 'Unauthorized' });
  }
}
