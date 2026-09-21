import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

const TODAY = '2026-09-21';
let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await buildServer({ dbPath: ':memory:', seedDemo: false, today: () => TODAY }));
});

afterAll(async () => {
  await app.close();
});

async function json<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await app.inject({ method, url, payload: body as any });
  const text = res.body;
  return { status: res.statusCode, body: text ? (JSON.parse(text) as T) : (undefined as T) };
}

describe('API', () => {
  let siteId: string;
  let hotId: string;
  let calId: string;
  let hotTaskId: string;

  it('serves templates and drivers', async () => {
    const t = await json('GET', '/api/templates');
    expect(t.status).toBe(200);
    expect(t.body.find((x: any) => x.code === 'HWS-SENTINEL').rules[0].withinSeconds).toBe(60);
    const d = await json('GET', '/api/drivers');
    expect(d.body.map((x: any) => x.id)).toContain('eti-bluetherm');
  });

  it('creates a site and assets with default schedules', async () => {
    const s = await json('POST', '/api/sites', { name: 'Test site', code: 'T1', healthcare: false });
    expect(s.status).toBe(201);
    siteId = s.body.id;

    const hot = await json('POST', `/api/sites/${siteId}/assets`, { type: 'hot_outlet', name: 'Kitchen hot', sentinel: true, tag: 'T1-HT-1' });
    expect(hot.status).toBe(201);
    hotId = hot.body.asset.id;
    expect(hot.body.schedules.map((x: any) => x.templateCode)).toEqual(['HWS-SENTINEL']);

    const cal = await json('POST', `/api/sites/${siteId}/assets`, { type: 'calorifier', name: 'Cal 1' });
    calId = cal.body.asset.id;
    expect(cal.body.schedules.map((x: any) => x.templateCode)).toEqual(['CAL-INSPECT', 'CAL-FLOW-RETURN']);

    const bad = await json('POST', `/api/sites/${siteId}/assets`, { type: 'kettle', name: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('validation');
  });

  it('lets the risk assessment override a frequency', async () => {
    const schedules = await json('GET', `/api/sites/${siteId}/schedules`);
    const cal = schedules.body.find((x: any) => x.templateCode === 'CAL-FLOW-RETURN');
    const upd = await json('PATCH', `/api/schedules/${cal.id}`, { frequency: 'weekly' });
    expect(upd.body.frequency).toBe('weekly');
    await json('PATCH', `/api/schedules/${cal.id}`, { frequency: 'monthly' });
  });

  it('generates tasks idempotently', async () => {
    const g1 = await json('POST', `/api/sites/${siteId}/tasks/generate`, { from: '2026-08-01', to: '2026-09-30' });
    // hot sentinel monthly ×2, calorifier inspect annually ×1, flow/return monthly ×2
    expect(g1.body.created).toBe(5);
    const g2 = await json('POST', `/api/sites/${siteId}/tasks/generate`, { from: '2026-08-01', to: '2026-09-30' });
    expect(g2.body.created).toBe(0);

    const open = await json('GET', `/api/tasks?siteId=${siteId}&status=open`);
    expect(open.body).toHaveLength(5);
    const overdue = open.body.filter((t: any) => t.status === 'overdue');
    expect(overdue.map((t: any) => t.dueDate)).toEqual(['2026-08-31', '2026-08-31']);
    hotTaskId = open.body.find((t: any) => t.templateCode === 'HWS-SENTINEL' && t.dueDate === '2026-09-30').id;
  });

  it('records a probe reading against a task and evaluates it', async () => {
    const detail = await json('GET', `/api/tasks/${hotTaskId}`);
    expect(detail.body.evaluation.outcome).toBe('incomplete');

    const notReady = await json('POST', `/api/tasks/${hotTaskId}/complete`, {});
    expect(notReady.status).toBe(400);
    expect(notReady.body.error).toMatch(/Readings missing for: hot/);

    const wrongChannel = await json('POST', `/api/tasks/${hotTaskId}/readings`, { channel: 'cold', valueC: 18, source: 'manual' });
    expect(wrongChannel.status).toBe(400);

    const r = await json('POST', `/api/tasks/${hotTaskId}/readings`, {
      channel: 'hot',
      valueC: 53.4,
      minC: 21.2,
      maxC: 53.6,
      reachedTargetAtS: 41,
      durationS: 70,
      stable: true,
      source: 'bluetooth',
      deviceName: 'ThermaQ Blue 4F2A',
      driverId: 'eti-bluetherm',
      samples: [
        { t: 0, c: 21.2 },
        { t: 41000, c: 50.1 },
        { t: 70000, c: 53.6 },
      ],
      takenBy: 'Engineer A',
    });
    expect(r.status).toBe(201);
    expect(r.body.evaluation.outcome).toBe('pass');
    expect(r.body.reading.samples).toHaveLength(3);

    // a second reading on the same channel replaces the first
    const r2 = await json('POST', `/api/tasks/${hotTaskId}/readings`, { channel: 'hot', valueC: 47, reachedTargetAtS: null, source: 'bluetooth' });
    expect(r2.body.evaluation.outcome).toBe('fail');
    const detail2 = await json('GET', `/api/tasks/${hotTaskId}`);
    expect(detail2.body.readings).toHaveLength(1);
    expect(detail2.body.readings[0].reachedTargetAtS).toBeNull();

    const done = await json('POST', `/api/tasks/${hotTaskId}/complete`, { completedBy: 'Engineer A', notes: 'Slow to heat' });
    expect(done.status).toBe(200);
    expect(done.body.task.status).toBe('failed');
    expect(done.body.task.outcome).toBe('fail');
    expect(done.body.task.completedBy).toBe('Engineer A');
  });

  it('completes an inspection from its checklist', async () => {
    const tasks = await json('GET', `/api/tasks?siteId=${siteId}&templateCode=CAL-INSPECT`);
    const inspect = tasks.body[0];
    const done = await json('POST', `/api/tasks/${inspect.id}/complete`, { checklist: { 'Vessel drained and sediment / scale removed': true }, completedBy: 'Engineer A' });
    expect(done.body.task.status).toBe('completed');
    expect(done.body.task.outcome).toBe('pass');
    expect(done.body.task.checklist).toEqual({ 'Vessel drained and sediment / scale removed': true });
  });

  it('skips and reopens tasks', async () => {
    const tasks = await json('GET', `/api/tasks?siteId=${siteId}&templateCode=CAL-FLOW-RETURN&status=open`);
    const t = tasks.body[0];
    const skipped = await json('POST', `/api/tasks/${t.id}/skip`, { reason: 'Plant room locked' });
    expect(skipped.body.status).toBe('skipped');
    const reopened = await json('POST', `/api/tasks/${t.id}/reopen`);
    expect(['due', 'overdue']).toContain(reopened.body.status);
  });

  it('reports compliance and exports CSV', async () => {
    const c = await json('GET', `/api/sites/${siteId}/compliance`);
    expect(c.body.summary.total).toBe(5);
    expect(c.body.summary.failed).toBe(1);
    expect(c.body.byTemplate.map((x: any) => x.code).sort()).toEqual(['CAL-FLOW-RETURN', 'CAL-INSPECT', 'HWS-SENTINEL']);

    const csv = await app.inject({ method: 'GET', url: `/api/sites/${siteId}/export.csv` });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const lines = csv.body.trim().split('\n');
    expect(lines[0]).toMatch(/^site,assetTag,asset/);
    expect(lines.some((l) => l.includes('HWS-SENTINEL') && l.includes('not reached'))).toBe(true);

    const sites = await json('GET', '/api/sites');
    expect(sites.body[0].assetCount).toBe(2);
    expect(sites.body[0].summary.total).toBe(5);
  });

  it('stores probe devices', async () => {
    const put = await json('PUT', '/api/devices/abc123', { name: 'ThermaQ Blue 4F2A', driverId: 'eti-bluetherm', model: 'ThermaQ Blue', calibrationDue: '2027-03-01' });
    expect(put.body.calibrationDue).toBe('2027-03-01');
    const list = await json('GET', '/api/devices');
    expect(list.body).toHaveLength(1);
    const del = await app.inject({ method: 'DELETE', url: '/api/devices/abc123' });
    expect(del.statusCode).toBe(204);
  });

  it('seeds the demo estate on demand', async () => {
    const seeded = await buildServer({ dbPath: ':memory:', seedDemo: true, today: () => TODAY });
    const sites = await seeded.app.inject({ method: 'GET', url: '/api/sites' });
    const body = JSON.parse(sites.body);
    expect(body).toHaveLength(2);
    expect(body.every((s: any) => s.summary.total > 0)).toBe(true);
    const tasks = JSON.parse((await seeded.app.inject({ method: 'GET', url: `/api/tasks?siteId=${body[0].id}` })).body);
    expect(tasks.some((t: any) => t.status === 'completed')).toBe(true);
    expect(tasks.some((t: any) => t.status === 'due')).toBe(true);
    await seeded.app.close();
  });
});
