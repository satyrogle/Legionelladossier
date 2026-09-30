import { generateTasks, planImport, type ColumnMapping, type ImportOptions, type ImportPlan } from '@ld/core';
import { transaction, type Db } from './db.js';
import {
  existingTaskKeys,
  getAsset,
  insertAsset,
  insertImportBatch,
  insertSite,
  insertTasks,
  listAllAssets,
  listDueSchedules,
  listSites,
  moveAsset,
  syncSchedulesForAsset,
  updateAsset,
  updateSite,
  type ImportBatch,
} from './repo.js';

export const DEFAULT_IMPORT_SYSTEM = 'tririga';

export interface ImportRequest {
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
  options: ImportOptions;
  filename?: string;
  importedBy?: string;
  /** Generate this period's tasks for every site the import touched (default true). */
  generateTasks?: boolean;
}

export function planFromDb(db: Db, req: ImportRequest): ImportPlan {
  return planImport(req.rows, req.mapping, req.options, { sites: listSites(db), assets: listAllAssets(db) });
}

export interface ImportResult {
  batch: ImportBatch;
  plan: ImportPlan;
  siteIds: string[];
  tasksCreated: number;
  schedules: { activated: number; deactivated: number };
}

/** Apply an import in one transaction. Re-plans against current data so a stale preview cannot misapply. */
export function applyImport(db: Db, req: ImportRequest, today: string): ImportResult {
  return transaction(db, () => {
    const plan = planFromDb(db, req);
    const system = req.options.system ?? DEFAULT_IMPORT_SYSTEM;
    const siteIdByKey = new Map<string, string>();
    const touched = new Set<string>();

    for (const s of plan.sites) {
      if (s.action === 'create') {
        const site = insertSite(db, { ...s.data, externalSystem: system, healthcare: false });
        siteIdByKey.set(s.key, site.id);
        touched.add(site.id);
      } else {
        if (s.action === 'update') updateSite(db, s.existingId!, { ...s.data, externalSystem: system });
        siteIdByKey.set(s.key, s.existingId!);
        touched.add(s.existingId!);
      }
    }

    const schedules = { activated: 0, deactivated: 0 };
    for (const a of plan.assets) {
      if (!a.data || (a.action !== 'create' && a.action !== 'update')) continue;
      const siteId = a.siteId ?? (a.siteKey ? siteIdByKey.get(a.siteKey) : undefined);
      if (!siteId) continue;
      touched.add(siteId);
      const input = { ...a.data, externalSystem: system };
      let asset;
      if (a.action === 'create') asset = insertAsset(db, siteId, input);
      else {
        const before = getAsset(db, a.existingId!);
        if (before && before.siteId !== siteId) moveAsset(db, a.existingId!, siteId);
        asset = updateAsset(db, a.existingId!, input);
      }
      const r = syncSchedulesForAsset(db, asset);
      schedules.activated += r.activated;
      schedules.deactivated += r.deactivated;
    }

    let tasksCreated = 0;
    if (req.generateTasks ?? true) {
      for (const siteId of touched) {
        tasksCreated += insertTasks(db, generateTasks(listDueSchedules(db, siteId), today, today, existingTaskKeys(db, siteId))).length;
      }
    }

    const batch = insertImportBatch(db, {
      source: system,
      mode: plan.mode,
      filename: req.filename,
      importedBy: req.importedBy,
      summary: { ...plan.summary, tasksCreated, schedules },
      options: { ...req.options, mapping: Object.fromEntries(Object.entries(req.mapping).map(([k, i]) => [k, req.headers[i!] ?? i])) },
    });
    return { batch, plan, siteIds: [...touched], tasksCreated, schedules };
  });
}
