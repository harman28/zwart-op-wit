import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { env } from './env.js';
import { HttpError } from './lib/errors.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { backupRoutes } from './modules/backup/backup.routes.js';
import { knsbRoutes } from './modules/knsb/knsb.routes.js';
import { playersRoutes } from './modules/players/players.routes.js';
import { roundsRoutes } from './modules/rounds/rounds.routes.js';
import { seasonsRoutes } from './modules/seasons/seasons.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';

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

  app.register(authRoutes);
  app.register(playersRoutes);
  app.register(seasonsRoutes);
  app.register(roundsRoutes);
  app.register(backupRoutes);
  app.register(settingsRoutes);
  app.register(knsbRoutes);

  return app;
}
