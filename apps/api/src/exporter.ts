import { ASSET_TYPE_LABELS, CHANNEL_LABELS, FREQUENCY_LABELS, describeRule, externalIdOf, getTemplate, templatesForAsset, tririgaPath, type Channel, type Frequency } from '@ld/core';
import { all, type Db } from './db.js';

export type ExportProfile = 'readable' | 'tririga';

const yes = (x: unknown) => (Number(x) === 1 ? 'Y' : 'N');
const s = (x: unknown) => (x === null || x === undefined ? '' : String(x));
/** TRIRIGA ID of a record, only when it came from TRIRIGA (a risk assessor's ref is not a TRIRIGA ID). */
const tririgaId = (system: unknown, ref: unknown) => (s(system) === 'tririga' ? (externalIdOf(s(ref)) ?? '') : '');

/**
 * Asset register for TRIRIGA. The "tririga" profile uses TRIRIGA field names only, ready for a Data
 * Integrator header (check them against the header file your form generates); "readable" adds the
 * water-hygiene fields for people.
 */
export function assetRegisterRows(db: Db, siteId: string | undefined, profile: ExportProfile): string[][] {
  const rows = all(
    db,
    `SELECT a.*, s.name AS site_name, s.code AS site_code, s.property AS site_property, s.external_ref AS site_external_ref, s.external_system AS site_external_system
     FROM assets a JOIN sites s ON s.id = a.site_id
     ${siteId ? 'WHERE a.site_id = ?' : ''}
     ORDER BY s.name, a.floor, a.space, a.name`,
    ...(siteId ? [siteId] : []),
  );
  const pathOf = (r: (typeof rows)[number]) =>
    s(r.external_path) || tririgaPath({ property: s(r.site_property) || undefined, building: s(r.site_name), floor: s(r.floor) || undefined, space: s(r.space) || undefined }) || '';

  if (profile === 'tririga') {
    return [
      ['triIdTX', 'triNameTX', 'triSpecNameTX', 'triBarCodeEntryTX', 'triSerialNumTX', 'triPrimaryLocPathTX', 'triDescriptionTX', 'triStatusCL'],
      ...rows.map((r) => [
        tririgaId(r.external_system, r.external_ref),
        s(r.name),
        s(r.classification) || ASSET_TYPE_LABELS[r.type as keyof typeof ASSET_TYPE_LABELS] || s(r.type),
        s(r.tag),
        s(r.serial),
        pathOf(r),
        s(r.notes),
        Number(r.active) === 1 ? 'Active' : 'Retired',
      ]),
    ];
  }
  return [
    ['TRIRIGA ID', 'Name', 'Classification', 'Water hygiene type', 'Sentinel', 'Little used', 'Loop rank', 'HSG274 tasks', 'Barcode / tag', 'Serial number', 'Property', 'Building ID', 'Building', 'Floor', 'Space', 'Location', 'TRIRIGA path', 'Status', 'Notes', 'Source system', 'Source ID', 'Dossier asset ID'],
    ...rows.map((r) => {
      const type = r.type as keyof typeof ASSET_TYPE_LABELS;
      const tasks = templatesForAsset({ type, sentinel: Number(r.sentinel) === 1, littleUsed: Number(r.little_used) === 1, loopRank: (s(r.loop_rank) || undefined) as never })
        .map((t) => t.code)
        .join(' ');
      return [
        tririgaId(r.external_system, r.external_ref),
        s(r.name),
        s(r.classification),
        ASSET_TYPE_LABELS[type] ?? s(r.type),
        yes(r.sentinel),
        yes(r.little_used),
        s(r.loop_rank),
        tasks,
        s(r.tag),
        s(r.serial),
        s(r.site_property),
        s(r.site_code) || (externalIdOf(s(r.site_external_ref)) ?? ''),
        s(r.site_name),
        s(r.floor),
        s(r.space),
        s(r.location),
        pathOf(r),
        Number(r.active) === 1 ? 'Active' : 'Retired',
        s(r.notes),
        s(r.external_system),
        externalIdOf(s(r.external_ref)) ?? '',
        s(r.id),
      ];
    }),
  ];
}

/** PPM results keyed by TRIRIGA IDs: one row per reading, or one row for a task without readings. */
export function resultsRows(db: Db, opts: { siteId?: string; from?: string; to?: string; completedOnly?: boolean }): string[][] {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.siteId) {
    where.push('t.site_id = ?');
    params.push(opts.siteId);
  }
  if (opts.from) {
    where.push('t.due_date >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    where.push('t.due_date <= ?');
    params.push(opts.to);
  }
  if (opts.completedOnly ?? true) where.push("t.status IN ('completed', 'failed', 'skipped')");
  const rows = all(
    db,
    `SELECT t.*, a.name AS asset_name, a.external_ref AS asset_ref, a.external_system AS asset_system, a.floor, a.space, a.location, a.tag,
            s.name AS site_name, s.code AS site_code, s.external_ref AS site_ref, s.healthcare,
            sc.frequency AS schedule_frequency,
            r.channel, r.value_c, r.min_c, r.max_c, r.timed, r.reached_target_at_s, r.source, r.device_name, r.taken_at
     FROM tasks t JOIN assets a ON a.id = t.asset_id JOIN sites s ON s.id = t.site_id JOIN schedules sc ON sc.id = t.schedule_id
     LEFT JOIN readings r ON r.task_id = t.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY t.due_date, s.name, a.floor, a.space, a.name, r.channel`,
    ...params,
  );
  const header = [
    'TRIRIGA asset ID', 'Asset', 'Barcode / tag', 'Building ID', 'Building', 'Floor', 'Space', 'PPM code', 'Task', 'Frequency', 'Period start', 'Period end', 'Due',
    'Status', 'Outcome', 'Completed', 'Completed by', 'Measurement', 'Value (°C)', 'Target', 'Reached target (s)', 'Min (°C)', 'Max (°C)', 'Source', 'Probe', 'Notes', 'Dossier task ID',
  ];
  return [
    header,
    ...rows.map((r) => {
      const template = getTemplate(s(r.template_code));
      const rule = template?.rules.find((x) => x.channel === r.channel);
      return [
        tririgaId(r.asset_system, r.asset_ref),
        s(r.asset_name),
        s(r.tag),
        s(r.site_code) || (externalIdOf(s(r.site_ref)) ?? ''),
        s(r.site_name),
        s(r.floor),
        s(r.space),
        s(r.template_code),
        template?.title ?? '',
        FREQUENCY_LABELS[r.schedule_frequency as Frequency] ?? s(r.schedule_frequency),
        s(r.period_start),
        s(r.period_end),
        s(r.due_date),
        s(r.status),
        s(r.outcome),
        s(r.completed_at),
        s(r.completed_by),
        r.channel ? (CHANNEL_LABELS[r.channel as Channel] ?? s(r.channel)) : '',
        s(r.value_c),
        rule ? describeRule(rule, { healthcare: Number(r.healthcare) === 1 }) : '',
        Number(r.timed) === 1 ? (r.reached_target_at_s === null ? 'not reached' : s(r.reached_target_at_s)) : '',
        s(r.min_c),
        s(r.max_c),
        s(r.source),
        s(r.device_name),
        s(r.notes),
        s(r.id),
      ];
    }),
  ];
}
