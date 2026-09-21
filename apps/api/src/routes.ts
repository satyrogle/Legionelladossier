import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Channel, TaskStatus } from '@ld/core';
import {
  ASSET_TYPES,
  CHANNEL_LABELS,
  FREQUENCIES,
  PPM_TEMPLATES,
  PROBE_DRIVERS,
  complianceSummary,
  evaluateTask,
  generateTasks,
  getTemplate,
  requireTemplate,
  todayIso,
} from '@ld/core';
import type { Db } from './db.js';
import {
  HttpError,
  deleteAsset,
  deleteDevice,
  deleteReading,
  deleteSchedule,
  deleteSite,
  ensureSchedulesForAsset,
  existingTaskKeys,
  exportRows,
  getAsset,
  insertAsset,
  insertReading,
  insertSite,
  insertTasks,
  listAssets,
  listDevices,
  listReadings,
  listSchedules,
  listSites,
  listTasks,
  reopenTask,
  requireAsset,
  requireSite,
  requireTask,
  setTaskResult,
  toCsv,
  updateAsset,
  updateSchedule,
  updateSite,
  upsertDevice,
  upsertSchedule,
} from './repo.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const frequency = z.enum(FREQUENCIES);
const channels = Object.keys(CHANNEL_LABELS) as [Channel, ...Channel[]];

const siteInput = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  client: z.string().optional(),
  address: z.string().optional(),
  healthcare: z.boolean().optional(),
  responsiblePerson: z.string().optional(),
});

const assetInput = z.object({
  type: z.enum(ASSET_TYPES),
  name: z.string().min(1),
  location: z.string().optional(),
  tag: z.string().optional(),
  sentinel: z.boolean().optional(),
  littleUsed: z.boolean().optional(),
  loopRank: z.enum(['principal', 'subordinate', 'tertiary']).optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
  autoSchedule: z.boolean().optional(),
});

const readingInput = z.object({
  channel: z.enum(channels),
  valueC: z.number(),
  minC: z.number().optional(),
  maxC: z.number().optional(),
  reachedTargetAtS: z.number().nullable().optional(),
  durationS: z.number().optional(),
  stable: z.boolean().optional(),
  source: z.enum(['bluetooth', 'manual', 'simulator']),
  deviceName: z.string().optional(),
  deviceModel: z.string().optional(),
  driverId: z.string().optional(),
  samples: z.array(z.object({ t: z.number(), c: z.number() })).max(10_000).optional(),
  takenAt: z.string().optional(),
  takenBy: z.string().optional(),
});

const completeInput = z.object({
  completedBy: z.string().optional(),
  completedAt: z.string().optional(),
  notes: z.string().optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
});

const deviceInput = z.object({
  name: z.string().min(1),
  driverId: z.string().min(1),
  model: z.string().optional(),
  serial: z.string().optional(),
  calibrationDue: isoDate.optional(),
  lastSeenAt: z.string().optional(),
});

type IdParams = { Params: { id: string } };

export interface RouteContext {
  db: Db;
  /** Today's date; overridable per request with ?today=YYYY-MM-DD for demos and tests. */
  today: () => string;
}

function resolveToday(ctx: RouteContext, query: unknown): string {
  const q = query as { today?: string } | undefined;
  return q?.today && isoDate.safeParse(q.today).success ? q.today : ctx.today();
}

export function registerRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { db } = ctx;

  app.get('/api/health', async () => ({ ok: true, today: ctx.today() }));

  app.get('/api/templates', async () => PPM_TEMPLATES);

  app.get('/api/drivers', async () =>
    PROBE_DRIVERS.map((d) => ({ id: d.id, name: d.name, vendor: d.vendor, models: d.models, notes: d.notes })),
  );

  // ----- sites -----
  app.get('/api/sites', async (req) => {
    const today = resolveToday(ctx, req.query);
    return listSites(db).map((site) => ({
      ...site,
      assetCount: listAssets(db, site.id).length,
      summary: complianceSummary(listTasks(db, { siteId: site.id }, today), today),
    }));
  });

  app.post('/api/sites', async (req, reply) => {
    const site = insertSite(db, siteInput.parse(req.body));
    return reply.code(201).send(site);
  });

  app.get<IdParams>('/api/sites/:id', async (req) => {
    const today = resolveToday(ctx, req.query);
    const site = requireSite(db, req.params.id);
    const tasks = listTasks(db, { siteId: site.id }, today);
    return { site, assets: listAssets(db, site.id), summary: complianceSummary(tasks, today), openTasks: tasks.filter((t) => t.status === 'due' || t.status === 'overdue').length };
  });

  app.patch<IdParams>('/api/sites/:id', async (req) => updateSite(db, req.params.id, siteInput.partial().parse(req.body)));

  app.delete<IdParams>('/api/sites/:id', async (req, reply) => {
    deleteSite(db, req.params.id);
    return reply.code(204).send();
  });

  // ----- assets -----
  app.get<IdParams>('/api/sites/:id/assets', async (req) => {
    requireSite(db, req.params.id);
    return listAssets(db, req.params.id);
  });

  app.post<IdParams>('/api/sites/:id/assets', async (req, reply) => {
    const { autoSchedule = true, ...input } = assetInput.parse(req.body);
    const asset = insertAsset(db, req.params.id, input);
    const schedules = autoSchedule ? ensureSchedulesForAsset(db, asset) : [];
    return reply.code(201).send({ asset, schedules });
  });

  app.get<IdParams>('/api/assets/:id', async (req) => {
    const asset = requireAsset(db, req.params.id);
    return { asset, schedules: listSchedules(db, { assetId: asset.id }) };
  });

  app.patch<IdParams>('/api/assets/:id', async (req) => {
    const { autoSchedule = false, ...patch } = assetInput.partial().parse(req.body);
    const asset = updateAsset(db, req.params.id, patch);
    if (autoSchedule) ensureSchedulesForAsset(db, asset);
    return asset;
  });

  app.delete<IdParams>('/api/assets/:id', async (req, reply) => {
    deleteAsset(db, req.params.id);
    return reply.code(204).send();
  });

  // ----- schedules -----
  app.get<IdParams>('/api/sites/:id/schedules', async (req) => {
    requireSite(db, req.params.id);
    return listSchedules(db, { siteId: req.params.id }).map((s) => ({
      ...s,
      assetName: getAsset(db, s.assetId)?.name ?? '',
      templateTitle: getTemplate(s.templateCode)?.title ?? s.templateCode,
      defaultFrequency: getTemplate(s.templateCode)?.frequency,
    }));
  });

  app.post<IdParams>('/api/assets/:id/schedules', async (req, reply) => {
    const body = z.object({ templateCode: z.string(), frequency: frequency.optional() }).parse(req.body);
    return reply.code(201).send(upsertSchedule(db, req.params.id, body.templateCode, body.frequency));
  });

  app.patch<IdParams>('/api/schedules/:id', async (req) =>
    updateSchedule(db, req.params.id, z.object({ frequency: frequency.optional(), active: z.boolean().optional() }).parse(req.body)),
  );

  app.delete<IdParams>('/api/schedules/:id', async (req, reply) => {
    deleteSchedule(db, req.params.id);
    return reply.code(204).send();
  });

  // ----- tasks -----
  app.post<IdParams>('/api/sites/:id/tasks/generate', async (req) => {
    const today = resolveToday(ctx, req.query);
    const body = z.object({ from: isoDate.optional(), to: isoDate.optional() }).parse(req.body ?? {});
    requireSite(db, req.params.id);
    const from = body.from ?? today;
    const to = body.to ?? today;
    if (from > to) throw new HttpError(400, '`from` must not be after `to`');
    const schedules = listSchedules(db, { siteId: req.params.id });
    const created = insertTasks(db, generateTasks(schedules, from, to, existingTaskKeys(db, req.params.id)));
    return { created: created.length, from, to };
  });

  app.get('/api/tasks', async (req) => {
    const today = resolveToday(ctx, req.query);
    const q = z
      .object({
        siteId: z.string().optional(),
        assetId: z.string().optional(),
        templateCode: z.string().optional(),
        status: z.enum(['due', 'overdue', 'completed', 'failed', 'skipped', 'open']).optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
      })
      .parse(req.query);
    return listTasks(db, q, today);
  });

  app.get<IdParams>('/api/tasks/:id', async (req) => taskDetail(req.params.id, resolveToday(ctx, req.query)));

  app.post<IdParams>('/api/tasks/:id/readings', async (req, reply) => {
    const today = resolveToday(ctx, req.query);
    const task = requireTask(db, req.params.id, today);
    const template = requireTemplate(task.templateCode);
    const input = readingInput.parse(req.body);
    if (!template.rules.some((r) => r.channel === input.channel) && template.measurement !== 'flush') {
      throw new HttpError(400, `Template ${template.code} has no ${input.channel} channel`);
    }
    const reading = insertReading(db, task, input);
    const site = requireSite(db, task.siteId);
    return reply.code(201).send({ reading, evaluation: evaluateTask(template, site, listReadings(db, task.id)) });
  });

  app.delete<IdParams>('/api/readings/:id', async (req, reply) => {
    deleteReading(db, req.params.id);
    return reply.code(204).send();
  });

  app.post<IdParams>('/api/tasks/:id/complete', async (req) => {
    const today = resolveToday(ctx, req.query);
    const task = requireTask(db, req.params.id, today);
    const template = requireTemplate(task.templateCode);
    const site = requireSite(db, task.siteId);
    const body = completeInput.parse(req.body ?? {});
    const readings = listReadings(db, task.id);
    const evaluation = evaluateTask(template, site, readings);
    if (evaluation.outcome === 'incomplete') {
      const missing = evaluation.findings.filter((f) => f.message.endsWith('no reading recorded')).map((f) => f.channel);
      throw new HttpError(400, `Readings missing for: ${missing.join(', ')}`);
    }
    let outcome = evaluation.outcome;
    if (template.rules.length === 0 && body.checklist && Object.values(body.checklist).some((ok) => !ok)) outcome = 'fail';
    const status: TaskStatus = outcome === 'fail' ? 'failed' : 'completed';
    setTaskResult(db, task.id, {
      status,
      outcome,
      completedAt: body.completedAt ?? new Date().toISOString(),
      completedBy: body.completedBy,
      notes: body.notes,
      checklist: body.checklist,
    });
    return taskDetail(task.id, today);
  });

  app.post<IdParams>('/api/tasks/:id/skip', async (req) => {
    const today = resolveToday(ctx, req.query);
    const task = requireTask(db, req.params.id, today);
    const body = z.object({ reason: z.string().min(1), completedBy: z.string().optional() }).parse(req.body);
    setTaskResult(db, task.id, { status: 'skipped', completedAt: new Date().toISOString(), completedBy: body.completedBy, notes: body.reason });
    return requireTask(db, task.id, today);
  });

  app.post<IdParams>('/api/tasks/:id/reopen', async (req) => {
    const today = resolveToday(ctx, req.query);
    requireTask(db, req.params.id, today);
    reopenTask(db, req.params.id);
    return requireTask(db, req.params.id, today);
  });

  // ----- devices -----
  app.get('/api/devices', async () => listDevices(db));

  app.put<IdParams>('/api/devices/:id', async (req) => upsertDevice(db, { id: req.params.id, ...deviceInput.parse(req.body) }));

  app.delete<IdParams>('/api/devices/:id', async (req, reply) => {
    deleteDevice(db, req.params.id);
    return reply.code(204).send();
  });

  // ----- reports -----
  app.get<IdParams>('/api/sites/:id/compliance', async (req) => {
    const today = resolveToday(ctx, req.query);
    const site = requireSite(db, req.params.id);
    const tasks = listTasks(db, { siteId: site.id }, today);
    const codes = [...new Set(tasks.map((t) => t.templateCode))];
    return {
      site,
      today,
      summary: complianceSummary(tasks, today),
      byTemplate: codes.map((code) => ({
        code,
        title: getTemplate(code)?.title ?? code,
        summary: complianceSummary(
          tasks.filter((t) => t.templateCode === code),
          today,
        ),
      })),
      overdue: tasks.filter((t) => t.status === 'overdue'),
      failed: tasks.filter((t) => t.status === 'failed'),
    };
  });

  app.get<IdParams>('/api/sites/:id/export.csv', async (req, reply) => {
    const site = requireSite(db, req.params.id);
    const q = z.object({ from: isoDate.optional(), to: isoDate.optional() }).parse(req.query);
    const csv = toCsv(exportRows(db, site.id, q.from, q.to));
    const name = `${(site.code ?? site.name).replace(/[^A-Za-z0-9_-]+/g, '_')}-dossier.csv`;
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${name}"`).send(csv);
  });

  function taskDetail(id: string, today: string) {
    const task = requireTask(db, id, today);
    const template = requireTemplate(task.templateCode);
    const site = requireSite(db, task.siteId);
    const asset = requireAsset(db, task.assetId);
    const readings = listReadings(db, task.id);
    return { task, template, site, asset, readings, evaluation: evaluateTask(template, site, readings) };
  }
}
