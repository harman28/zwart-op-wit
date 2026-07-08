import type { FastifyReply, FastifyRequest } from 'fastify';
import { getSession, SESSION_COOKIE_NAME } from '../modules/auth/auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    actorName?: string | null;
  }
}

/** preHandler for every /api/admin/* route — one place, reused everywhere. Also
 * attaches the session's actor name to the request for the action-log hook. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const session = await getSession(token);
  if (!session) {
    await reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  request.actorName = session.actorName;
}
