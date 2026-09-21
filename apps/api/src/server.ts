import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { todayIso } from '@ld/core';
import { openDb, type Db } from './db.js';
import { registerRoutes } from './routes.js';
import { HttpError } from './repo.js';
import { seedDemo } from './seed.js';

export interface ServerOptions {
  dbPath: string;
  /** Directory holding the built web app; served with an SPA fallback when present. */
  webDist?: string;
  /** Seed the demo estate when the database has no sites. */
  seedDemo?: boolean;
  logger?: boolean;
  today?: () => string;
}

export interface BuiltServer {
  app: FastifyInstance;
  db: Db;
}

export async function buildServer(opts: ServerOptions): Promise<BuiltServer> {
  const db = openDb(opts.dbPath);
  const today = opts.today ?? (() => todayIso());
  if (opts.seedDemo) seedDemo(db, today());

  const app = Fastify({ logger: opts.logger ?? false });
  await app.register(cors, { origin: true });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validation', issues: err.issues });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    const e = err as { statusCode?: number; message?: string };
    const status = typeof e.statusCode === 'number' ? e.statusCode : 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: e.message ?? 'Internal error' });
  });

  registerRoutes(app, { db, today });

  if (opts.webDist && existsSync(opts.webDist)) {
    await app.register(fastifyStatic, { root: opts.webDist, prefix: '/', wildcard: true });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.method !== 'GET') return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Not found' }));
  }

  app.addHook('onClose', async () => db.close());
  return { app, db };
}
