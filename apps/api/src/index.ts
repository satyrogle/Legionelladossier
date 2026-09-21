import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from './server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DB_PATH ?? path.resolve(here, '..', 'data', 'dossier.db');
const webDist = process.env.WEB_DIST ?? path.resolve(here, '..', '..', 'web', 'dist');
const seedDemo = (process.env.SEED_DEMO ?? 'true') !== 'false';

mkdirSync(path.dirname(dbPath), { recursive: true });
const { app } = await buildServer({ dbPath, webDist, seedDemo, logger: true });
await app.listen({ port, host });
