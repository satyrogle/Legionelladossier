import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { readXlsx, suggestMapping } from '@ld/core';
import { buildServer } from '../src/server.js';
import { openDb, schemaVersion } from '../src/db.js';
import { SCHEMA } from '../src/schema.js';

const TODAY = '2026-09-30';
let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await buildServer({ dbPath: ':memory:', seedDemo: false, today: () => TODAY }));
});
afterAll(async () => {
  await app.close();
});

async function call<T = any>(method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await app.inject({ method, url, payload: body as any });
  return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as T) : (undefined as T) };
}

const headers = ['ID', 'Name', 'Spec Name', 'Barcode', 'Serial Number', 'Status', 'Path', 'Building ID', 'Sentinel'];
const rows = [
  ['EQ-001', 'Calorifier 1', 'Calorifier', 'BC-0001', 'SN-77', 'Active', '\\Locations\\Demo Estate\\Demo House\\Basement\\Plant Room', 'DH-01', ''],
  ['EQ-002', 'Kitchen hot tap', 'Hot tap', '', '', 'Active', '\\Locations\\Demo Estate\\Demo House\\Ground\\Kitchen', 'DH-01', 'Y'],
  ['EQ-003', 'WC basin', 'Wash Hand Basin', '', '', 'Active', '\\Locations\\Demo Estate\\Demo House\\First\\WC 1.02', 'DH-01', ''],
  ['EQ-004', 'Old shower', 'Shower', '', '', 'Retired', '\\Locations\\Demo Estate\\Demo House\\First\\Changing', 'DH-01', ''],
  ['EQ-005', 'AHU 1', 'Air Handling Unit', '', '', 'Active', '\\Locations\\Demo Estate\\Demo House\\Roof', 'DH-01', ''],
  ['EQ-101', 'Store TMV', 'TMV3', '', '', 'Active', '\\Locations\\Demo Estate\\Annex\\Ground\\Store', 'AX-02', ''],
];
const mapping = suggestMapping(headers, 'assets');
const request = (r = rows, extra: Record<string, unknown> = {}) => ({ headers, rows: r, mapping, options: { mode: 'assets' }, filename: 'building-equipment.xlsx', importedBy: 'Test', ...extra });

describe('TRIRIGA import', () => {
  let houseId: string;

  it('previews without writing', async () => {
    const res = await call('POST', '/api/import/tririga/preview', request());
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ rows: 6, sites: { create: 2, update: 0, unchanged: 0 }, assets: { create: 5, update: 0, unchanged: 0, skip: 1, error: 0 } });
    expect((await call('GET', '/api/sites')).body).toHaveLength(0);
  });

  it('commits sites, assets, schedules and this period’s tasks', async () => {
    const res = await call('POST', '/api/import/tririga/commit', request());
    expect(res.status).toBe(201);
    expect(res.body.summary.assets.create).toBe(5);
    expect(res.body.tasksCreated).toBeGreaterThan(0);

    const sites = (await call('GET', '/api/sites')).body;
    const house = sites.find((s: any) => s.code === 'DH-01');
    houseId = house.id;
    expect(house).toMatchObject({ name: 'Demo House', property: 'Demo Estate', externalSystem: 'tririga', externalRef: 'id:DH-01' });

    const detail = (await call('GET', `/api/sites/${houseId}`)).body;
    const cal = detail.assets.find((a: any) => a.name === 'Calorifier 1');
    expect(cal).toMatchObject({ type: 'calorifier', floor: 'Basement', space: 'Plant Room', tag: 'BC-0001', serial: 'SN-77', classification: 'Calorifier', externalRef: 'id:EQ-001' });
    const tap = detail.assets.find((a: any) => a.name === 'Kitchen hot tap');
    expect(tap).toMatchObject({ type: 'hot_outlet', sentinel: true });
    const shower = detail.assets.find((a: any) => a.name === 'Old shower');
    expect(shower.active).toBe(false);

    const schedules = (await call('GET', `/api/sites/${houseId}/schedules`)).body;
    expect(schedules.filter((s: any) => s.assetId === tap.id).map((s: any) => s.templateCode)).toEqual(['HWS-SENTINEL']);
    expect(schedules.filter((s: any) => s.assetId === shower.id && s.active)).toHaveLength(0);

    const tasks = (await call('GET', `/api/tasks?siteId=${houseId}`)).body;
    expect(tasks.some((t: any) => t.assetId === tap.id && t.templateCode === 'HWS-SENTINEL' && t.dueDate === '2026-09-30')).toBe(true);
    expect(tasks.some((t: any) => t.assetId === shower.id)).toBe(false);

    const batches = (await call('GET', '/api/import/batches')).body;
    expect(batches[0]).toMatchObject({ source: 'tririga', mode: 'assets', filename: 'building-equipment.xlsx', importedBy: 'Test' });
    expect(batches[0].options.mapping.assetId).toBe('ID');
  });

  it('re-importing the same file changes nothing', async () => {
    const res = await call('POST', '/api/import/tririga/commit', request());
    expect(res.body.summary.sites).toEqual({ create: 0, update: 0, unchanged: 2 });
    expect(res.body.summary.assets).toMatchObject({ create: 0, update: 0, unchanged: 5 });
    expect(res.body.tasksCreated).toBe(0);
  });

  it('updates flags and re-syncs schedules', async () => {
    const changed = rows.map((r) => [...r]);
    changed[1]![8] = 'N'; // kitchen tap no longer a sentinel
    const res = await call('POST', '/api/import/tririga/commit', request(changed));
    expect(res.body.summary.assets.update).toBe(1);
    expect(res.body.schedules).toEqual({ activated: 1, deactivated: 1 });
    const detail = (await call('GET', `/api/sites/${houseId}`)).body;
    const tap = detail.assets.find((a: any) => a.name === 'Kitchen hot tap');
    const schedules = (await call('GET', `/api/sites/${houseId}/schedules`)).body.filter((s: any) => s.assetId === tap.id);
    expect(schedules.map((s: any) => [s.templateCode, s.active])).toEqual([
      ['HWS-PROFILE', true],
      ['HWS-SENTINEL', false],
    ]);
  });

  it('asset flag edits in the app re-sync schedules too', async () => {
    const detail = (await call('GET', `/api/sites/${houseId}`)).body;
    const basin = detail.assets.find((a: any) => a.name === 'WC basin');
    const res = await call('PATCH', `/api/assets/${basin.id}`, { sentinel: true, autoSchedule: true });
    expect(res.body.schedules).toEqual({ activated: 2, deactivated: 2 });
  });

  it('imports a building list in locations mode', async () => {
    const h = ['ID', 'Name', 'Parent Property', 'Address', 'City', 'Postcode'];
    const res = await call('POST', '/api/import/tririga/commit', {
      headers: h,
      rows: [
        ['DH-01', 'Demo House', 'Demo Estate', '1 Example Road', 'York', 'YO1 1AA'],
        ['NB-03', 'New Block', 'Demo Estate', '3 Example Road', 'York', 'YO1 1AB'],
      ],
      mapping: suggestMapping(h, 'locations'),
      options: { mode: 'locations' },
    });
    expect(res.body.summary.sites).toEqual({ create: 1, update: 1, unchanged: 0 });
    const house = (await call('GET', `/api/sites/${houseId}`)).body.site;
    expect(house.address).toBe('1 Example Road, York, YO1 1AA');
  });

  it('rejects bad payloads', async () => {
    const res = await call('POST', '/api/import/tririga/preview', { ...request(), mapping: { nonsense: 1 } });
    expect(res.status).toBe(400);
  });

  it('accepts payloads above the default 1 MB body limit', async () => {
    const big = Array.from({ length: 6000 }, (_, i) => [`BIG-${i}`, `Hot tap ${i}`, 'Hot tap', '', '', 'Active', `\\Locations\\Demo Estate\\Big House\\Floor ${i % 9}\\Room ${i}`, 'BH-09', '']);
    const res = await call('POST', '/api/import/tririga/preview', request(big));
    expect(res.status).toBe(200);
    expect(res.body.summary.assets.create).toBe(6000);
    expect(res.body.assets).toHaveLength(500);
    expect(res.body.truncated).toBe(true);
  });
});

describe('TRIRIGA export', () => {
  it('exports the asset register with TRIRIGA field names and source IDs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export/tririga/assets.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/all-sites-asset-register-tririga\.txt/);
    const lines = res.body.trim().split('\r\n').map((l) => l.split('\t'));
    expect(lines[0]).toEqual(['triIdTX', 'triNameTX', 'triSpecNameTX', 'triBarCodeEntryTX', 'triSerialNumTX', 'triPrimaryLocPathTX', 'triDescriptionTX', 'triStatusCL']);
    const cal = lines.find((l) => l[1] === 'Calorifier 1')!;
    expect(cal).toEqual(['EQ-001', 'Calorifier 1', 'Calorifier', 'BC-0001', 'SN-77', '\\Locations\\Demo Estate\\Demo House\\Basement\\Plant Room', '', 'Active']);
    expect(lines.find((l) => l[1] === 'Old shower')![7]).toBe('Retired');
  });

  it('exports a readable register as CSV and XLSX', async () => {
    const csv = await app.inject({ method: 'GET', url: '/api/export/tririga/assets.csv' });
    expect(csv.body.charCodeAt(0)).toBe(0xfeff);
    expect(csv.body).toMatch(/TRIRIGA ID,Name,Classification,Water hygiene type,Sentinel/);

    const xlsx = await app.inject({ method: 'GET', url: '/api/export/tririga/assets.xlsx' });
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
    const sheet = readXlsx(new Uint8Array(xlsx.rawPayload));
    expect(sheet.rows[0]![0]).toBe('TRIRIGA ID');
    expect(sheet.rows.some((r) => r[0] === 'EQ-001' && r[3] === 'Calorifier / hot water generator')).toBe(true);
  });

  it('exports completed PPM results keyed by TRIRIGA asset ID', async () => {
    const tasks = (await call('GET', '/api/tasks?templateCode=HWS-PROFILE&status=open')).body;
    const task = tasks.find((t: any) => t.assetName === 'Kitchen hot tap');
    await call('POST', `/api/tasks/${task.id}/readings`, { channel: 'hot', valueC: 55.2, reachedTargetAtS: 22, source: 'bluetooth', deviceName: 'Thermapen ONE Blue' });
    await call('POST', `/api/tasks/${task.id}/complete`, { completedBy: 'Engineer A' });

    const res = await app.inject({ method: 'GET', url: '/api/export/tririga/results.csv' });
    const lines = res.body.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^TRIRIGA asset ID,Asset,Barcode \/ tag,Building ID,Building/);
    const row = lines.find((l) => l.startsWith('EQ-002,'))!;
    expect(row).toContain('HWS-PROFILE');
    expect(row).toContain('55.2');
    expect(row).toContain('at least 50 °C within 1 minute');
    expect(row).toContain('Thermapen ONE Blue');
    expect(row).toContain('Engineer A');
  });
});

describe('schema migration', () => {
  it('upgrades a version 1 database in place', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ld-migrate-'));
    const file = path.join(dir, 'v1.db');
    try {
      const old = new DatabaseSync(file);
      old.exec(SCHEMA);
      old.prepare("INSERT INTO sites (id, name, healthcare, created_at) VALUES ('s1', 'Old site', 0, '2026-01-01T00:00:00Z')").run();
      old.close();

      const db = openDb(file);
      expect(schemaVersion(db)).toBe(2);
      const cols = (db.prepare('PRAGMA table_info(assets)').all() as { name: string }[]).map((c) => c.name);
      expect(cols).toEqual(expect.arrayContaining(['floor', 'space', 'serial', 'classification', 'external_ref', 'external_record_id', 'external_path']));
      expect((db.prepare('SELECT name FROM sites').get() as { name: string }).name).toBe('Old site');
      db.close();

      const again = openDb(file); // idempotent
      expect(schemaVersion(again)).toBe(2);
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
