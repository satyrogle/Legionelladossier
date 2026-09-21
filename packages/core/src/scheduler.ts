import type { Frequency, IsoDate, PpmSchedule, Task, TaskStatus } from './types.js';

export interface Period {
  start: IsoDate;
  end: IsoDate;
}

function parseIso(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Bad ISO date: ${date}`);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

/** The calendar period (ISO week, month, quarter, half-year or year) containing `date`. */
export function periodContaining(frequency: Frequency, date: IsoDate): Period {
  const d = parseIso(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (frequency) {
    case 'weekly': {
      const mondayOffset = (d.getUTCDay() + 6) % 7;
      const start = new Date(d);
      start.setUTCDate(d.getUTCDate() - mondayOffset);
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 6);
      return { start: toIso(start), end: toIso(end) };
    }
    case 'monthly':
      return { start: toIso(new Date(Date.UTC(y, m, 1))), end: toIso(new Date(Date.UTC(y, m + 1, 0))) };
    case 'quarterly': {
      const q = Math.floor(m / 3) * 3;
      return { start: toIso(new Date(Date.UTC(y, q, 1))), end: toIso(new Date(Date.UTC(y, q + 3, 0))) };
    }
    case 'six_monthly': {
      const h = m < 6 ? 0 : 6;
      return { start: toIso(new Date(Date.UTC(y, h, 1))), end: toIso(new Date(Date.UTC(y, h + 6, 0))) };
    }
    case 'annually':
      return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
}

export function nextPeriod(frequency: Frequency, period: Period): Period {
  return periodContaining(frequency, addDays(period.end, 1));
}

/** Every period that starts on or before `to` and ends on or after `from`. */
export function periodsBetween(frequency: Frequency, from: IsoDate, to: IsoDate): Period[] {
  const out: Period[] = [];
  let p = periodContaining(frequency, from);
  while (p.start <= to) {
    out.push(p);
    p = nextPeriod(frequency, p);
  }
  return out;
}

export function taskKey(scheduleId: string, periodStart: IsoDate): string {
  return `${scheduleId}|${periodStart}`;
}

export type NewTask = Pick<Task, 'siteId' | 'assetId' | 'scheduleId' | 'templateCode' | 'periodStart' | 'periodEnd' | 'dueDate'>;

/**
 * Tasks a set of schedules needs between two dates, excluding any already known by key.
 * The caller chooses the range, so this also backfills earlier periods when asked to.
 * Idempotent: running it twice with the returned keys added to `existingKeys` yields nothing.
 */
export function generateTasks(
  schedules: readonly PpmSchedule[],
  from: IsoDate,
  to: IsoDate,
  existingKeys: ReadonlySet<string> = new Set(),
): NewTask[] {
  const out: NewTask[] = [];
  for (const s of schedules) {
    if (!s.active) continue;
    for (const p of periodsBetween(s.frequency, from, to)) {
      if (existingKeys.has(taskKey(s.id, p.start))) continue;
      out.push({
        siteId: s.siteId,
        assetId: s.assetId,
        scheduleId: s.id,
        templateCode: s.templateCode,
        periodStart: p.start,
        periodEnd: p.end,
        dueDate: p.end,
      });
    }
  }
  return out;
}

export function deriveStatus(task: Pick<Task, 'status' | 'dueDate'>, today: IsoDate): TaskStatus {
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'skipped') return task.status;
  return today > task.dueDate ? 'overdue' : 'due';
}

export function nextDueDate(frequency: Frequency, lastCompleted: IsoDate | undefined, today: IsoDate): IsoDate {
  if (!lastCompleted) return periodContaining(frequency, today).end;
  return nextPeriod(frequency, periodContaining(frequency, lastCompleted)).end;
}

export interface ComplianceSummary {
  total: number;
  completed: number;
  completedOnTime: number;
  failed: number;
  due: number;
  overdue: number;
  skipped: number;
  /** Share of tasks whose period has ended that were completed (pass or fail recorded) by their due date. */
  compliancePct: number | null;
}

export function complianceSummary(tasks: readonly Task[], today: IsoDate): ComplianceSummary {
  const s: ComplianceSummary = { total: 0, completed: 0, completedOnTime: 0, failed: 0, due: 0, overdue: 0, skipped: 0, compliancePct: null };
  let elapsed = 0;
  let elapsedOnTime = 0;
  for (const t of tasks) {
    s.total += 1;
    const status = deriveStatus(t, today);
    const done = status === 'completed' || status === 'failed';
    const onTime = done && (t.completedAt?.slice(0, 10) ?? '9999-12-31') <= t.dueDate;
    if (status === 'completed') s.completed += 1;
    if (status === 'failed') s.failed += 1;
    if (status === 'due') s.due += 1;
    if (status === 'overdue') s.overdue += 1;
    if (status === 'skipped') s.skipped += 1;
    if (onTime) s.completedOnTime += 1;
    if (t.dueDate < today && status !== 'skipped') {
      elapsed += 1;
      if (onTime) elapsedOnTime += 1;
    }
  }
  s.compliancePct = elapsed === 0 ? null : Math.round((elapsedOnTime / elapsed) * 1000) / 10;
  return s;
}
