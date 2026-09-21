import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { todayIso } from '@ld/core';
import { openDb } from './db.js';
import { seedDemo } from './seed.js';

const dbPath = process.argv[2] ?? process.env.DB_PATH ?? path.resolve('data', 'dossier.db');
mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
seedDemo(db, todayIso());
db.close();
console.log(`Seeded demo estate into ${dbPath}`);
