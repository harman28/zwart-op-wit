import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { env } from './env.js';
import { HttpError } from './lib/errors.js';
import { actionLogRoutes } from './modules/actionlog/actionlog.routes.js';
import { recordAction } from './modules/actionlog/actionlog.service.js';
import { describeAction } from './modules/actionlog/describeAction.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { backupRoutes } from './modules/backup/backup.routes.js';
import { knsbRoutes } from './modules/knsb/knsb.routes.js';
import { playersRoutes } from './modules/players/players.routes.js';
import { roundsRoutes } from './modules/rounds/rounds.routes.js';
import { seasonsRoutes } from './modules/seasons/seasons.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';

const LOGGED_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

export function buildApp() {
  const app = Fastify({ logger: false });

  app.register(cookie);
  app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });

  // A bodyless request (e.g. POST .../publish) that still claims a JSON
  // content-type — a perfectly normal thing for a generic fetch wrapper to
  // send — would otherwise hit Fastify's default JSON parser trying to
  // JSON.parse('') and surface as a raw 500. Treat an empty body as "no body"
  // instead of a parse error.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (typeof body === 'string' && body.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues });
    }
    // Prisma "record not found" etc. surface as plain errors from the service layer in a few
    // places — treat anything else as a 500 rather than leaking internals.
    return reply.code(500).send({ error: 'Internal server error' });
  });

  app.get('/health', async () => ({ ok: true }));

  // Admin action log: one generic hook covers every mutating admin route
  // (and the differently-prefixed change-password route) rather than
  // threading a log call into each individual handler.
  app.addHook('onResponse', async (request, reply) => {
    if (!LOGGED_METHODS.has(request.method) || reply.statusCode >= 400) return;
    const path = request.raw.url?.split('?')[0] ?? '';
    const isAdminAction = path.startsWith('/api/admin/') || path === '/api/auth/change-password';
    if (!isAdminAction) return;
    const summary = describeAction(request.method, path, request.body);
    await recordAction({ actorName: request.actorName ?? null, method: request.method, path, summary }).catch(() => {});
  });

  app.register(authRoutes);
  app.register(playersRoutes);
  app.register(seasonsRoutes);
  app.register(roundsRoutes);
  app.register(backupRoutes);
  app.register(settingsRoutes);
  app.register(knsbRoutes);
  app.register(actionLogRoutes);

  return app;
}
