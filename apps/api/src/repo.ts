import { randomUUID } from 'node:crypto';
import type { Asset, Frequency, PpmSchedule, Reading, Site, Task, TaskStatus } from '@ld/core';
import { deriveStatus, getTemplate, templatesForAsset } from '@ld/core';
import { all, bool, num, one, run, str, v, type Db, type Row } from './db.js';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const now = () => new Date().toISOString();

// ---------- sites ----------

function rowToSite(r: Row): Site {
  return {
    id: String(r.id),
    name: String(r.name),
    code: str(r, 'code'),
    client: str(r, 'client'),
    address: str(r, 'address'),
    healthcare: bool(r, 'healthcare'),
    responsiblePerson: str(r, 'responsible_person'),
    createdAt: String(r.created_at),
  };
}

export type SiteInput = Omit<Site, 'id' | 'createdAt' | 'healthcare'> & { healthcare?: boolean };

export function listSites(db: Db): Site[] {
  return all(db, 'SELECT * FROM sites ORDER BY name').map(rowToSite);
}

export function getSite(db: Db, id: string): Site | undefined {
  const r = one(db, 'SELECT * FROM sites WHERE id = ?', id);
  return r ? rowToSite(r) : undefined;
}

export function requireSite(db: Db, id: string): Site {
  const s = getSite(db, id);
  if (!s) throw new HttpError(404, `Site ${id} not found`);
  return s;
}

export function insertSite(db: Db, input: SiteInput): Site {
  const id = randomUUID();
  run(
    db,
    'INSERT INTO sites (id, name, code, client, address, healthcare, responsible_person, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    input.name,
    v(input.code),
    v(input.client),
    v(input.address),
    v(input.healthcare ?? false),
    v(input.responsiblePerson),
    now(),
  );
  return getSite(db, id)!;
}

export function updateSite(db: Db, id: string, patch: Partial<SiteInput>): Site {
  const s = requireSite(db, id);
  const next = { ...s, ...patch };
  run(
    db,
    'UPDATE sites SET name = ?, code = ?, client = ?, address = ?, healthcare = ?, responsible_person = ? WHERE id = ?',
    next.name,
    v(next.code),
    v(next.client),
    v(next.address),
    v(next.healthcare),
    v(next.responsiblePerson),
    id,
  );
  return getSite(db, id)!;
}

export function deleteSite(db: Db, id: string): void {
  requireSite(db, id);
  run(db, 'DELETE FROM sites WHERE id = ?', id);
}

// ---------- assets ----------

function rowToAsset(r: Row): Asset {
  return {
    id: String(r.id),
    siteId: String(r.site_id),
    type: String(r.type) as Asset['type'],
    name: String(r.name),
    location: str(r, 'location'),
    tag: str(r, 'tag'),
    sentinel: bool(r, 'sentinel'),
    littleUsed: bool(r, 'little_used'),
    loopRank: str(r, 'loop_rank') as Asset['loopRank'],
    notes: str(r, 'notes'),
    active: bool(r, 'active'),
    createdAt: String(r.created_at),
  };
}

export type AssetInput = Omit<Asset, 'id' | 'siteId' | 'createdAt' | 'sentinel' | 'littleUsed' | 'active'> & {
  sentinel?: boolean;
  littleUsed?: boolean;
  active?: boolean;
};

export function listAssets(db: Db, siteId: string): Asset[] {
  return all(db, 'SELECT * FROM assets WHERE site_id = ? ORDER BY location, name', siteId).map(rowToAsset);
}

export function getAsset(db: Db, id: string): Asset | undefined {
  const r = one(db, 'SELECT * FROM assets WHERE id = ?', id);
  return r ? rowToAsset(r) : undefined;
}

export function requireAsset(db: Db, id: string): Asset {
  const a = getAsset(db, id);
  if (!a) throw new HttpError(404, `Asset ${id} not found`);
  return a;
}

export function insertAsset(db: Db, siteId: string, input: AssetInput): Asset {
  requireSite(db, siteId);
  const id = randomUUID();
  run(
    db,
    'INSERT INTO assets (id, site_id, type, name, location, tag, sentinel, little_used, loop_rank, notes, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    siteId,
    input.type,
    input.name,
    v(input.location),
    v(input.tag),
    v(input.sentinel ?? false),
    v(input.littleUsed ?? false),
    v(input.loopRank),
    v(input.notes),
    v(input.active ?? true),
    now(),
  );
  return getAsset(db, id)!;
}

export function updateAsset(db: Db, id: string, patch: Partial<AssetInput>): Asset {
  const a = requireAsset(db, id);
  const next = { ...a, ...patch };
  run(
    db,
    'UPDATE assets SET type = ?, name = ?, location = ?, tag = ?, sentinel = ?, little_used = ?, loop_rank = ?, notes = ?, active = ? WHERE id = ?',
    next.type,
    next.name,
    v(next.location),
    v(next.tag),
    v(next.sentinel),
    v(next.littleUsed),
    v(next.loopRank),
    v(next.notes),
    v(next.active),
    id,
  );
  return getAsset(db, id)!;
}

export function deleteAsset(db: Db, id: string): void {
  requireAsset(db, id);
  run(db, 'DELETE FROM assets WHERE id = ?', id);
}

// ---------- schedules ----------

function rowToSchedule(r: Row): PpmSchedule {
  return {
    id: String(r.id),
    siteId: String(r.site_id),
    assetId: String(r.asset_id),
    templateCode: String(r.template_code),
    frequency: String(r.frequency) as Frequency,
    active: bool(r, 'active'),
    createdAt: String(r.created_at),
  };
}

export function listSchedules(db: Db, filter: { siteId?: string; assetId?: string }): PpmSchedule[] {
  if (filter.assetId) return all(db, 'SELECT * FROM schedules WHERE asset_id = ? ORDER BY template_code', filter.assetId).map(rowToSchedule);
  if (filter.siteId) return all(db, 'SELECT * FROM schedules WHERE site_id = ? ORDER BY asset_id, template_code', filter.siteId).map(rowToSchedule);
  return all(db, 'SELECT * FROM schedules ORDER BY site_id, asset_id, template_code').map(rowToSchedule);
}

export function getSchedule(db: Db, id: string): PpmSchedule | undefined {
  const r = one(db, 'SELECT * FROM schedules WHERE id = ?', id);
  return r ? rowToSchedule(r) : undefined;
}

export function requireSchedule(db: Db, id: string): PpmSchedule {
  const s = getSchedule(db, id);
  if (!s) throw new HttpError(404, `Schedule ${id} not found`);
  return s;
}

export function upsertSchedule(db: Db, assetId: string, templateCode: string, frequency?: Frequency): PpmSchedule {
  const asset = requireAsset(db, assetId);
  const template = getTemplate(templateCode);
  if (!template) throw new HttpError(400, `Unknown template ${templateCode}`);
  const existing = one(db, 'SELECT * FROM schedules WHERE asset_id = ? AND template_code = ?', assetId, templateCode);
  if (existing) {
    run(db, 'UPDATE schedules SET frequency = ?, active = 1 WHERE id = ?', frequency ?? String(existing.frequency), String(existing.id));
    return getSchedule(db, String(existing.id))!;
  }
  const id = randomUUID();
  run(
    db,
    'INSERT INTO schedules (id, site_id, asset_id, template_code, frequency, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    id,
    asset.siteId,
    assetId,
    templateCode,
    frequency ?? template.frequency,
    now(),
  );
  return getSchedule(db, id)!;
}

export function updateSchedule(db: Db, id: string, patch: { frequency?: Frequency; active?: boolean }): PpmSchedule {
  const s = requireSchedule(db, id);
  run(db, 'UPDATE schedules SET frequency = ?, active = ? WHERE id = ?', patch.frequency ?? s.frequency, v(patch.active ?? s.active), id);
  return getSchedule(db, id)!;
}

export function deleteSchedule(db: Db, id: string): void {
  requireSchedule(db, id);
  run(db, 'DELETE FROM schedules WHERE id = ?', id);
}

/** Create the default HSG274 schedules an asset needs, keeping any that already exist. */
export function ensureSchedulesForAsset(db: Db, asset: Asset): PpmSchedule[] {
  return templatesForAsset(asset).map((t) => upsertSchedule(db, asset.id, t.code));
}

// ---------- tasks ----------

export interface TaskView extends Task {
  assetName: string;
  assetType: Asset['type'];
  assetTag?: string;
  assetLocation?: string;
  siteName: string;
  templateTitle: string;
  readingCount: number;
  checklist?: Record<string, boolean>;
}

const TASK_VIEW_SQL = `
  SELECT t.*, a.name AS asset_name, a.type AS asset_type, a.tag AS asset_tag, a.location AS asset_location, s.name AS site_name,
         (SELECT COUNT(*) FROM readings r WHERE r.task_id = t.id) AS reading_count
  FROM tasks t JOIN assets a ON a.id = t.asset_id JOIN sites s ON s.id = t.site_id`;

function rowToTask(r: Row, today: string): TaskView {
  const base: Task = {
    id: String(r.id),
    siteId: String(r.site_id),
    assetId: String(r.asset_id),
    scheduleId: String(r.schedule_id),
    templateCode: String(r.template_code),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    dueDate: String(r.due_date),
    status: String(r.status) as TaskStatus,
    outcome: str(r, 'outcome') as Task['outcome'],
    completedAt: str(r, 'completed_at'),
    completedBy: str(r, 'completed_by'),
    notes: str(r, 'notes'),
  };
  base.status = deriveStatus(base, today);
  const checklistRaw = str(r, 'checklist');
  return {
    ...base,
    assetName: String(r.asset_name),
    assetType: String(r.asset_type) as Asset['type'],
    assetTag: str(r, 'asset_tag'),
    assetLocation: str(r, 'asset_location'),
    siteName: String(r.site_name),
    templateTitle: getTemplate(base.templateCode)?.title ?? base.templateCode,
    readingCount: Number(r.reading_count ?? 0),
    checklist: checklistRaw ? (JSON.parse(checklistRaw) as Record<string, boolean>) : undefined,
  };
}

export interface TaskFilter {
  siteId?: string;
  assetId?: string;
  status?: TaskStatus | 'open';
  from?: string;
  to?: string;
  templateCode?: string;
}

export function listTasks(db: Db, filter: TaskFilter, today: string): TaskView[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.siteId) {
    where.push('t.site_id = ?');
    params.push(filter.siteId);
  }
  if (filter.assetId) {
    where.push('t.asset_id = ?');
    params.push(filter.assetId);
  }
  if (filter.templateCode) {
    where.push('t.template_code = ?');
    params.push(filter.templateCode);
  }
  if (filter.from) {
    where.push('t.due_date >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    where.push('t.due_date <= ?');
    params.push(filter.to);
  }
  const sql = `${TASK_VIEW_SQL}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY t.due_date, a.location, a.name`;
  let tasks = all(db, sql, ...params).map((r) => rowToTask(r, today));
  if (filter.status === 'open') tasks = tasks.filter((t) => t.status === 'due' || t.status === 'overdue');
  else if (filter.status) tasks = tasks.filter((t) => t.status === filter.status);
  return tasks;
}

export function getTask(db: Db, id: string, today: string): TaskView | undefined {
  const r = one(db, `${TASK_VIEW_SQL} WHERE t.id = ?`, id);
  return r ? rowToTask(r, today) : undefined;
}

export function requireTask(db: Db, id: string, today: string): TaskView {
  const t = getTask(db, id, today);
  if (!t) throw new HttpError(404, `Task ${id} not found`);
  return t;
}

export function existingTaskKeys(db: Db, siteId: string): Set<string> {
  return new Set(all(db, 'SELECT schedule_id, period_start FROM tasks WHERE site_id = ?', siteId).map((r) => `${r.schedule_id}|${r.period_start}`));
}

export function insertTasks(
  db: Db,
  tasks: readonly Pick<Task, 'siteId' | 'assetId' | 'scheduleId' | 'templateCode' | 'periodStart' | 'periodEnd' | 'dueDate'>[],
): string[] {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO tasks (id, site_id, asset_id, schedule_id, template_code, period_start, period_end, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const ids: string[] = [];
  for (const t of tasks) {
    const id = randomUUID();
    const res = stmt.run(id, t.siteId, t.assetId, t.scheduleId, t.templateCode, t.periodStart, t.periodEnd, t.dueDate, 'due');
    if (Number(res.changes) > 0) ids.push(id);
  }
  return ids;
}

export function setTaskResult(
  db: Db,
  id: string,
  patch: { status: TaskStatus; outcome?: Task['outcome']; completedAt?: string; completedBy?: string; notes?: string; checklist?: Record<string, boolean> },
): void {
  run(
    db,
    'UPDATE tasks SET status = ?, outcome = ?, completed_at = ?, completed_by = ?, notes = ?, checklist = ? WHERE id = ?',
    patch.status,
    v(patch.outcome),
    v(patch.completedAt),
    v(patch.completedBy),
    v(patch.notes),
    v(patch.checklist),
    id,
  );
}

export function reopenTask(db: Db, id: string): void {
  run(db, "UPDATE tasks SET status = 'due', outcome = NULL, completed_at = NULL, completed_by = NULL WHERE id = ?", id);
}

// ---------- readings ----------

function rowToReading(r: Row): Reading {
  const timed = bool(r, 'timed');
  const reached = num(r, 'reached_target_at_s');
  const samplesRaw = str(r, 'samples');
  return {
    id: String(r.id),
    taskId: String(r.task_id),
    assetId: String(r.asset_id),
    channel: String(r.channel) as Reading['channel'],
    valueC: Number(r.value_c),
    minC: num(r, 'min_c'),
    maxC: num(r, 'max_c'),
    reachedTargetAtS: timed ? (reached ?? null) : undefined,
    durationS: num(r, 'duration_s'),
    stable: r.stable === null || r.stable === undefined ? undefined : bool(r, 'stable'),
    source: String(r.source) as Reading['source'],
    deviceName: str(r, 'device_name'),
    deviceModel: str(r, 'device_model'),
    driverId: str(r, 'driver_id'),
    samples: samplesRaw ? (JSON.parse(samplesRaw) as Reading['samples']) : undefined,
    takenAt: String(r.taken_at),
    takenBy: str(r, 'taken_by'),
  };
}

export function listReadings(db: Db, taskId: string): Reading[] {
  return all(db, 'SELECT * FROM readings WHERE task_id = ? ORDER BY taken_at', taskId).map(rowToReading);
}

export type ReadingInput = Omit<Reading, 'id' | 'taskId' | 'assetId' | 'takenAt'> & { takenAt?: string };

export function insertReading(db: Db, task: Task, input: ReadingInput): Reading {
  const id = randomUUID();
  const timed = input.reachedTargetAtS !== undefined;
  run(
    db,
    `INSERT INTO readings (id, task_id, asset_id, channel, value_c, min_c, max_c, timed, reached_target_at_s, duration_s, stable, source, device_name, device_model, driver_id, samples, taken_at, taken_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    task.id,
    task.assetId,
    input.channel,
    input.valueC,
    v(input.minC),
    v(input.maxC),
    v(timed),
    v(input.reachedTargetAtS ?? null),
    v(input.durationS),
    v(input.stable),
    input.source,
    v(input.deviceName),
    v(input.deviceModel),
    v(input.driverId),
    v(input.samples),
    input.takenAt ?? now(),
    v(input.takenBy),
  );
  // One reading per channel per task: the latest wins.
  run(db, 'DELETE FROM readings WHERE task_id = ? AND channel = ? AND id <> ?', task.id, input.channel, id);
  return rowToReading(one(db, 'SELECT * FROM readings WHERE id = ?', id)!);
}

export function deleteReading(db: Db, id: string): void {
  if (run(db, 'DELETE FROM readings WHERE id = ?', id) === 0) throw new HttpError(404, `Reading ${id} not found`);
}

// ---------- devices ----------

export interface Device {
  id: string;
  name: string;
  driverId: string;
  model?: string;
  serial?: string;
  calibrationDue?: string;
  lastSeenAt?: string;
  createdAt: string;
}

function rowToDevice(r: Row): Device {
  return {
    id: String(r.id),
    name: String(r.name),
    driverId: String(r.driver_id),
    model: str(r, 'model'),
    serial: str(r, 'serial'),
    calibrationDue: str(r, 'calibration_due'),
    lastSeenAt: str(r, 'last_seen_at'),
    createdAt: String(r.created_at),
  };
}

export function listDevices(db: Db): Device[] {
  return all(db, 'SELECT * FROM devices ORDER BY name').map(rowToDevice);
}

export function upsertDevice(db: Db, input: Omit<Device, 'createdAt'>): Device {
  const existing = one(db, 'SELECT * FROM devices WHERE id = ?', input.id);
  if (existing) {
    run(
      db,
      'UPDATE devices SET name = ?, driver_id = ?, model = ?, serial = ?, calibration_due = ?, last_seen_at = ? WHERE id = ?',
      input.name,
      input.driverId,
      v(input.model ?? str(existing, 'model')),
      v(input.serial ?? str(existing, 'serial')),
      v(input.calibrationDue ?? str(existing, 'calibration_due')),
      v(input.lastSeenAt ?? now()),
      input.id,
    );
  } else {
    run(
      db,
      'INSERT INTO devices (id, name, driver_id, model, serial, calibration_due, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      input.id,
      input.name,
      input.driverId,
      v(input.model),
      v(input.serial),
      v(input.calibrationDue),
      v(input.lastSeenAt ?? now()),
      now(),
    );
  }
  return rowToDevice(one(db, 'SELECT * FROM devices WHERE id = ?', input.id)!);
}

export function deleteDevice(db: Db, id: string): void {
  if (run(db, 'DELETE FROM devices WHERE id = ?', id) === 0) throw new HttpError(404, `Device ${id} not found`);
}

// ---------- export ----------

export interface ExportRow {
  site: string;
  assetTag: string;
  asset: string;
  location: string;
  taskCode: string;
  task: string;
  periodStart: string;
  dueDate: string;
  status: string;
  outcome: string;
  completedAt: string;
  completedBy: string;
  channel: string;
  valueC: string;
  minC: string;
  maxC: string;
  reachedTargetAtS: string;
  durationS: string;
  source: string;
  device: string;
  takenAt: string;
  notes: string;
}

export function exportRows(db: Db, siteId: string, from?: string, to?: string): ExportRow[] {
  const where = ['t.site_id = ?'];
  const params: string[] = [siteId];
  if (from) {
    where.push('t.due_date >= ?');
    params.push(from);
  }
  if (to) {
    where.push('t.due_date <= ?');
    params.push(to);
  }
  const rows = all(
    db,
    `SELECT s.name AS site, a.tag AS asset_tag, a.name AS asset, a.location, t.template_code, t.period_start, t.due_date, t.status, t.outcome,
            t.completed_at, t.completed_by, t.notes, r.channel, r.value_c, r.min_c, r.max_c, r.timed, r.reached_target_at_s, r.duration_s, r.source,
            r.device_name, r.taken_at
     FROM tasks t JOIN assets a ON a.id = t.asset_id JOIN sites s ON s.id = t.site_id
     LEFT JOIN readings r ON r.task_id = t.id
     WHERE ${where.join(' AND ')}
     ORDER BY t.due_date, a.location, a.name, r.channel`,
    ...params,
  );
  const fmt = (x: unknown) => (x === null || x === undefined ? '' : String(x));
  return rows.map((r) => ({
    site: fmt(r.site),
    assetTag: fmt(r.asset_tag),
    asset: fmt(r.asset),
    location: fmt(r.location),
    taskCode: fmt(r.template_code),
    task: getTemplate(String(r.template_code))?.title ?? '',
    periodStart: fmt(r.period_start),
    dueDate: fmt(r.due_date),
    status: fmt(r.status),
    outcome: fmt(r.outcome),
    completedAt: fmt(r.completed_at),
    completedBy: fmt(r.completed_by),
    channel: fmt(r.channel),
    valueC: fmt(r.value_c),
    minC: fmt(r.min_c),
    maxC: fmt(r.max_c),
    reachedTargetAtS: Number(r.timed) === 1 ? (r.reached_target_at_s === null ? 'not reached' : fmt(r.reached_target_at_s)) : '',
    durationS: fmt(r.duration_s),
    source: fmt(r.source),
    device: fmt(r.device_name),
    takenAt: fmt(r.taken_at),
    notes: fmt(r.notes),
  }));
}

export function toCsv(rows: readonly ExportRow[]): string {
  const headers: (keyof ExportRow)[] = [
    'site', 'assetTag', 'asset', 'location', 'taskCode', 'task', 'periodStart', 'dueDate', 'status', 'outcome', 'completedAt', 'completedBy',
    'channel', 'valueC', 'minC', 'maxC', 'reachedTargetAtS', 'durationS', 'source', 'device', 'takenAt', 'notes',
  ];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n') + '\n';
}
