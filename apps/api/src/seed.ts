import { addDays, generateTasks, periodContaining, requireTemplate, targetFor, type Asset, type ReadingSource } from '@ld/core';
import type { Db } from './db.js';
import { ensureSchedulesForAsset, existingTaskKeys, insertAsset, insertReading, insertSite, insertTasks, listSchedules, listSites, listTasks, requireSite, setTaskResult, type AssetInput } from './repo.js';

/** Small deterministic PRNG so the demo estate looks the same on every machine. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const HQ_ASSETS: AssetInput[] = [
  { type: 'calorifier', name: 'Calorifier 1', location: 'Plant room, basement', tag: 'HQ-CAL-01' },
  { type: 'cold_water_tank', name: 'Cold water storage tank', location: 'Roof tank room', tag: 'HQ-CWST-01' },
  { type: 'return_loop', name: 'HWS principal return, riser 1', location: 'Plant room, basement', tag: 'HQ-RL-01', loopRank: 'principal' },
  { type: 'return_loop', name: 'HWS subordinate return, floor 3 west', location: 'Floor 3, riser cupboard W', tag: 'HQ-RL-02', loopRank: 'subordinate' },
  { type: 'hot_outlet', name: 'Kitchen hot tap (nearest)', location: 'Ground floor, staff kitchen', tag: 'HQ-HT-001', sentinel: true },
  { type: 'hot_outlet', name: 'WC hot tap (furthest)', location: 'Floor 5, WC north', tag: 'HQ-HT-052', sentinel: true },
  { type: 'hot_outlet', name: 'WC hot tap', location: 'Floor 2, WC south', tag: 'HQ-HT-021' },
  { type: 'hot_outlet', name: "Cleaner's sink hot tap", location: 'Floor 4, cleaner’s cupboard', tag: 'HQ-HT-044' },
  { type: 'cold_outlet', name: 'WC cold tap (nearest)', location: 'Ground floor, WC south', tag: 'HQ-CT-001', sentinel: true },
  { type: 'cold_outlet', name: 'WC cold tap (furthest)', location: 'Floor 5, WC north', tag: 'HQ-CT-052', sentinel: true },
  { type: 'cold_outlet', name: 'Kitchenette cold tap', location: 'Floor 3, kitchenette', tag: 'HQ-CT-031' },
  { type: 'mixed_outlet', name: 'Accessible WC basin (TMV blended)', location: 'Ground floor, accessible WC', tag: 'HQ-MX-002' },
  { type: 'tmv', name: 'TMV, accessible WC basin', location: 'Ground floor, accessible WC', tag: 'HQ-TMV-002' },
  { type: 'shower', name: 'Cycle store shower 1', location: 'Basement, cycle store', tag: 'HQ-SH-01' },
  { type: 'shower', name: 'Cycle store shower 2', location: 'Basement, cycle store', tag: 'HQ-SH-02', littleUsed: true },
  { type: 'pou_heater', name: 'Kitchenette POU heater', location: 'Floor 3, kitchenette', tag: 'HQ-POU-03' },
  { type: 'little_used_outlet', name: 'Store sink (little used)', location: 'Basement, store B04', tag: 'HQ-LU-01' },
  { type: 'expansion_vessel', name: 'Expansion vessel EV1', location: 'Plant room, basement', tag: 'HQ-EV-01' },
];

const OH_ASSETS: AssetInput[] = [
  { type: 'calorifier', name: 'Calorifier', location: 'Plant room', tag: 'OH-CAL-01' },
  { type: 'hot_outlet', name: 'Treatment room 1 hot tap (nearest)', location: 'Ground floor, treatment room 1', tag: 'OH-HT-001', sentinel: true },
  { type: 'hot_outlet', name: 'Treatment room 4 hot tap (furthest)', location: 'Ground floor, treatment room 4', tag: 'OH-HT-004', sentinel: true },
  { type: 'cold_outlet', name: 'Treatment room 1 cold tap (nearest)', location: 'Ground floor, treatment room 1', tag: 'OH-CT-001', sentinel: true },
  { type: 'cold_outlet', name: 'Treatment room 4 cold tap (furthest)', location: 'Ground floor, treatment room 4', tag: 'OH-CT-004', sentinel: true },
  { type: 'shower', name: 'Decontamination shower', location: 'Ground floor, decon room', tag: 'OH-SH-01' },
];

/**
 * Populate an empty database with a two-site demo estate, three months of generated tasks,
 * and plausible completed readings so dashboards have something to show.
 */
export function seedDemo(db: Db, today: string): void {
  if (listSites(db).length > 0) return;
  const rand = rng(20260921);

  const hq = insertSite(db, { name: 'Demo estate: head office', code: 'DEMO-HQ', client: 'Demo client', address: '1 Example Square, London', healthcare: false, responsiblePerson: 'Site FM (demo)' });
  const oh = insertSite(db, { name: 'Demo estate: occupational health suite', code: 'DEMO-OH', client: 'Demo client', address: '1 Example Square, London', healthcare: true, responsiblePerson: 'Site FM (demo)' });

  const assets: Asset[] = [];
  for (const a of HQ_ASSETS) assets.push(insertAsset(db, hq.id, a));
  for (const a of OH_ASSETS) assets.push(insertAsset(db, oh.id, a));
  for (const a of assets) ensureSchedulesForAsset(db, a);

  const from = periodContaining('monthly', addDays(periodContaining('monthly', today).start, -1)).start; // last month
  const backfillFrom = periodContaining('monthly', addDays(from, -1)).start; // two months back
  const to = periodContaining('monthly', today).end;
  for (const site of [hq, oh]) {
    const schedules = listSchedules(db, { siteId: site.id });
    insertTasks(db, generateTasks(schedules, backfillFrom, to, existingTaskKeys(db, site.id)));
  }

  for (const site of [hq, oh]) {
    const s = requireSite(db, site.id);
    for (const task of listTasks(db, { siteId: site.id }, today)) {
      if (task.dueDate >= today) continue; // current period stays open
      const roll = rand();
      if (roll < 0.1) continue; // leave a few overdue
      const template = requireTemplate(task.templateCode);
      const completedOn = addDays(task.periodStart, Math.min(Math.floor(rand() * 20), Math.max(0, daysInPeriod(task.periodStart, task.periodEnd) - 2)));
      const completedAt = `${completedOn}T${String(8 + Math.floor(rand() * 8)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00Z`;
      const source: ReadingSource = rand() < 0.85 ? 'bluetooth' : 'manual';
      const device = source === 'bluetooth' ? { deviceName: 'ThermaQ Blue 4F2A', deviceModel: 'ThermaQ Blue', driverId: 'eti-bluetherm' } : {};
      const fail = rand() < 0.08;

      for (const rule of template.rules) {
        const target = targetFor(rule, s);
        let valueC: number;
        let reached: number | null | undefined;
        if (rule.comparator === 'min') {
          valueC = fail ? target - 2 - rand() * 4 : target + 1 + rand() * 6;
          if (rule.withinSeconds) reached = fail ? null : Math.round(10 + rand() * (rule.withinSeconds - 15));
        } else if (rule.comparator === 'max') {
          valueC = fail ? target + 1 + rand() * 3 : target - 3 - rand() * 6;
          if (rule.withinSeconds) reached = fail ? null : Math.round(5 + rand() * (rule.withinSeconds - 10));
        } else {
          valueC = fail ? (rule.max ?? target) + 2 : target + rand() * ((rule.max ?? target + 5) - target);
        }
        valueC = Math.round(valueC * 10) / 10;
        insertReading(db, task, {
          channel: rule.channel,
          valueC,
          minC: Math.round((Math.min(valueC, 18 + rand() * 6)) * 10) / 10,
          maxC: valueC,
          reachedTargetAtS: reached,
          durationS: rule.withinSeconds ? rule.withinSeconds + 10 : 20,
          stable: true,
          source,
          ...device,
          takenAt: completedAt,
          takenBy: 'Demo engineer',
        });
      }
      const checklist = template.checklist ? Object.fromEntries(template.checklist.map((item) => [item, !fail])) : undefined;
      const outcome = template.rules.length === 0 ? (fail ? 'fail' : 'pass') : fail ? 'fail' : 'pass';
      setTaskResult(db, task.id, {
        status: outcome === 'fail' ? 'failed' : 'completed',
        outcome,
        completedAt,
        completedBy: 'Demo engineer',
        notes: fail ? 'Reported to site FM for investigation.' : undefined,
        checklist,
      });
    }
  }
}

function daysInPeriod(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}
