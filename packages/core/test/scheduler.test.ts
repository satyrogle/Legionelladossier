import { describe, expect, it } from 'vitest';
import type { PpmSchedule, Task } from '../src/index.js';
import { complianceSummary, deriveStatus, generateTasks, nextDueDate, periodContaining, periodsBetween, taskKey } from '../src/index.js';

describe('periods', () => {
  it('computes calendar periods in UTC', () => {
    expect(periodContaining('monthly', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodContaining('monthly', '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(periodContaining('quarterly', '2026-05-31')).toEqual({ start: '2026-04-01', end: '2026-06-30' });
    expect(periodContaining('six_monthly', '2026-09-21')).toEqual({ start: '2026-07-01', end: '2026-12-31' });
    expect(periodContaining('annually', '2026-09-21')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    // 2026-09-21 is a Monday
    expect(periodContaining('weekly', '2026-09-21')).toEqual({ start: '2026-09-21', end: '2026-09-27' });
    expect(periodContaining('weekly', '2026-09-27')).toEqual({ start: '2026-09-21', end: '2026-09-27' });
  });

  it('lists periods across a range', () => {
    expect(periodsBetween('monthly', '2026-01-15', '2026-03-01').map((p) => p.start)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(periodsBetween('weekly', '2026-09-21', '2026-10-04')).toHaveLength(2);
  });
});

describe('generateTasks', () => {
  const schedule: PpmSchedule = { id: 's1', siteId: 'site', assetId: 'a1', templateCode: 'HWS-SENTINEL', frequency: 'monthly', active: true, createdAt: '2026-01-01T00:00:00Z' };

  it('creates one task per period and is idempotent', () => {
    const first = generateTasks([schedule], '2026-07-01', '2026-09-30');
    expect(first.map((t) => t.dueDate)).toEqual(['2026-07-31', '2026-08-31', '2026-09-30']);
    const keys = new Set(first.map((t) => taskKey(t.scheduleId, t.periodStart)));
    expect(generateTasks([schedule], '2026-07-01', '2026-09-30', keys)).toEqual([]);
  });

  it('skips inactive schedules and backfills earlier periods when asked', () => {
    expect(generateTasks([{ ...schedule, active: false }], '2026-07-01', '2026-09-30')).toEqual([]);
    const late = { ...schedule, createdAt: '2026-08-15T09:00:00Z' };
    expect(generateTasks([late], '2026-07-01', '2026-09-30').map((t) => t.periodStart)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
  });
});

describe('status and compliance', () => {
  const base: Task = { id: 't', siteId: 's', assetId: 'a', scheduleId: 'sc', templateCode: 'HWS-SENTINEL', periodStart: '2026-08-01', periodEnd: '2026-08-31', dueDate: '2026-08-31', status: 'due' };

  it('derives overdue from the due date', () => {
    expect(deriveStatus(base, '2026-08-20')).toBe('due');
    expect(deriveStatus(base, '2026-09-01')).toBe('overdue');
    expect(deriveStatus({ ...base, status: 'completed' }, '2026-09-01')).toBe('completed');
  });

  it('computes next due dates', () => {
    expect(nextDueDate('monthly', undefined, '2026-09-21')).toBe('2026-09-30');
    expect(nextDueDate('monthly', '2026-09-03', '2026-09-21')).toBe('2026-10-31');
    expect(nextDueDate('quarterly', '2026-09-03', '2026-09-21')).toBe('2026-12-31');
  });

  it('summarises compliance for elapsed tasks only', () => {
    const tasks: Task[] = [
      { ...base, id: '1', status: 'completed', completedAt: '2026-08-12T10:00:00Z' },
      { ...base, id: '2', status: 'failed', completedAt: '2026-08-30T10:00:00Z' },
      { ...base, id: '3', status: 'completed', completedAt: '2026-09-02T10:00:00Z' },
      { ...base, id: '4' },
      { ...base, id: '5', periodStart: '2026-09-01', periodEnd: '2026-09-30', dueDate: '2026-09-30' },
    ];
    const s = complianceSummary(tasks, '2026-09-21');
    expect(s).toMatchObject({ total: 5, completed: 2, failed: 1, overdue: 1, due: 1, completedOnTime: 2 });
    expect(s.compliancePct).toBe(50);
  });
});
