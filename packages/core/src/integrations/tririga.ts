import { ASSET_TYPE_LABELS, type Asset, type AssetType, type LoopRank, type Site } from '../types.js';

export type ImportMode = 'assets' | 'locations';

export type ImportField =
  | 'assetId'
  | 'recordId'
  | 'assetName'
  | 'classification'
  | 'description'
  | 'barcode'
  | 'serial'
  | 'status'
  | 'sentinel'
  | 'littleUsed'
  | 'loopRank'
  | 'path'
  | 'locationText'
  | 'property'
  | 'building'
  | 'buildingId'
  | 'floor'
  | 'space'
  | 'address'
  | 'city'
  | 'postcode';

/** Column index per field; absent means "not in this file". */
export type ColumnMapping = Partial<Record<ImportField, number>>;

export interface ImportFieldInfo {
  key: ImportField;
  label: string;
  modes: readonly ImportMode[];
  hint?: string;
}

export const IMPORT_FIELDS: readonly ImportFieldInfo[] = [
  { key: 'assetId', label: 'Asset ID', modes: ['assets'], hint: 'TRIRIGA ID (triIdTX). Used to update the same asset on re-import.' },
  { key: 'recordId', label: 'Record ID', modes: ['assets'], hint: 'TRIRIGA record / spec ID, if exported.' },
  { key: 'assetName', label: 'Asset name', modes: ['assets'] },
  { key: 'classification', label: 'Type / classification', modes: ['assets'], hint: 'Spec name, asset class or outlet type. Decides which HSG274 tasks apply.' },
  { key: 'description', label: 'Description / notes', modes: ['assets'] },
  { key: 'barcode', label: 'Barcode / tag', modes: ['assets'] },
  { key: 'serial', label: 'Serial number', modes: ['assets'] },
  { key: 'status', label: 'Status', modes: ['assets'], hint: 'Retired or inactive records are imported as inactive (no tasks).' },
  { key: 'sentinel', label: 'Sentinel (Y/N)', modes: ['assets'] },
  { key: 'littleUsed', label: 'Little used (Y/N)', modes: ['assets'] },
  { key: 'loopRank', label: 'Loop rank', modes: ['assets'] },
  { key: 'path', label: 'Location path', modes: ['assets', 'locations'], hint: 'TRIRIGA hierarchy path, e.g. \\Locations\\Property\\Building\\Floor\\Space.' },
  { key: 'locationText', label: 'Location (free text)', modes: ['assets'] },
  { key: 'property', label: 'Property', modes: ['assets', 'locations'] },
  { key: 'buildingId', label: 'Building ID', modes: ['assets', 'locations'], hint: 'Used to match buildings to sites on re-import.' },
  { key: 'building', label: 'Building name', modes: ['assets', 'locations'] },
  { key: 'floor', label: 'Floor', modes: ['assets'] },
  { key: 'space', label: 'Space / room', modes: ['assets'] },
  { key: 'address', label: 'Address', modes: ['locations'] },
  { key: 'city', label: 'Town / city', modes: ['locations'] },
  { key: 'postcode', label: 'Postcode', modes: ['locations'] },
];

/** Header synonyms, normalised (lower case, letters and digits only), in priority order. */
const COMMON_SYNONYMS: Partial<Record<ImportField, string[]>> = {
  path: ['tripathtx', 'triprimarylocpathtx', 'path', 'locationpath', 'primarylocationpath', 'fullpath', 'hierarchypath', 'locationhierarchy', 'hierarchy'],
  property: ['triparentpropertytx', 'property', 'propertyname', 'parentproperty', 'campus', 'estate', 'portfolio'],
  buildingId: ['buildingid', 'buildingcode', 'buildingno', 'buildingnumber', 'bldgid', 'bldgcode', 'siteid', 'sitecode', 'siteref', 'sitereference', 'uprn'],
  building: ['triparentbuildingtx', 'tribuildingnametx', 'building', 'buildingname', 'parentbuilding', 'bldg', 'site', 'sitename', 'premises', 'facility'],
};

const ASSET_SYNONYMS: Partial<Record<ImportField, string[]>> = {
  assetId: ['triidtx', 'id', 'assetid', 'assetno', 'assetnumber', 'assetref', 'assetreference', 'equipmentid', 'equipmentno', 'equipmentnumber', 'buildingequipmentid', 'assetcode', 'plantid', 'plantno', 'plantnumber', 'outletid', 'outletref', 'outletno', 'itemid'],
  recordId: ['identifier', 'recordid', 'trirecordidsy', 'specid', 'systemid'],
  assetName: ['trinametx', 'name', 'assetname', 'equipmentname', 'outletname', 'plantname', 'itemname', 'title'],
  classification: [
    'outlettype',
    'legionellaassettype',
    'ldassettype',
    'waterassettype',
    'trispecnametx',
    'specname',
    'specification',
    'assetspec',
    'assetspecclass',
    'specclass',
    'assetclass',
    'assetclassification',
    'classification',
    'equipmenttype',
    'assettype',
    'equipmentclass',
    'category',
    'assetcategory',
    'type',
  ],
  description: ['tridescriptiontx', 'description', 'notes', 'comments', 'remarks', 'details'],
  barcode: ['tribarcodeentrytx', 'barcode', 'barcodeentry', 'assettag', 'tag', 'tagno', 'tagnumber', 'label', 'qrcode'],
  serial: ['triserialnumtx', 'serialnumber', 'serialno', 'serial'],
  status: ['tristatuscl', 'status', 'assetstatus', 'recordstatus', 'lifecyclestatus'],
  sentinel: ['sentinel', 'sentineloutlet', 'issentinel', 'sentinelpoint', 'sentinelyn'],
  littleUsed: ['littleused', 'littleusedyn', 'littleusedoutlet', 'lowuse', 'lowused', 'lowusage', 'infrequentlyused', 'infrequentuse', 'flushing', 'weeklyflush'],
  loopRank: ['looprank', 'looptype', 'loop', 'returnloop', 'circulationloop'],
  locationText: ['location', 'locationdescription', 'area', 'position'],
  floor: ['triparentfloortx', 'floor', 'floorname', 'level', 'floorlevel', 'storey', 'story', 'flr'],
  space: ['triparentspacetx', 'space', 'spacename', 'room', 'roomname', 'roomno', 'roomnumber'],
};

const LOCATION_SYNONYMS: Partial<Record<ImportField, string[]>> = {
  buildingId: ['triidtx', 'id'],
  building: ['trinametx', 'name', 'title'],
  address: ['triaddresstx', 'address', 'address1', 'addressline1', 'street', 'streetaddress'],
  city: ['tricitytx', 'city', 'town'],
  postcode: ['trizippostaltx', 'postcode', 'postalcode', 'zip', 'zipcode', 'zippostal'],
};

function synonymsFor(mode: ImportMode): Partial<Record<ImportField, string[]>> {
  const out: Partial<Record<ImportField, string[]>> = {};
  const add = (src: Partial<Record<ImportField, string[]>>) => {
    for (const [k, v] of Object.entries(src) as [ImportField, string[]][]) out[k] = [...(out[k] ?? []), ...v];
  };
  if (mode === 'locations') add(LOCATION_SYNONYMS);
  add(COMMON_SYNONYMS);
  if (mode === 'assets') add(ASSET_SYNONYMS);
  return out;
}

const NAMESPACE = /^(spi|spi_wm|dcterms|rdf|rdfs|oslc|foaf|acc):/i;

export function normaliseHeader(h: string): string {
  return h.trim().replace(NAMESPACE, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const ALL_SYNONYMS = new Set(
  [ASSET_SYNONYMS, LOCATION_SYNONYMS, COMMON_SYNONYMS].flatMap((m) => Object.values(m).flat() as string[]),
);

/** Index of the header row: TRIRIGA report exports can start with a title and a run date. */
export function detectHeaderRow(rows: readonly (readonly string[])[]): number {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const cells = rows[i]!.map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const matches = cells.filter((c) => ALL_SYNONYMS.has(normaliseHeader(c))).length;
    const score = matches * 10 + cells.length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

const ASSET_HINTS = new Set(['trispecnametx', 'specname', 'serialnumber', 'triserialnumtx', 'barcode', 'tribarcodeentrytx', 'outlettype', 'sentinel', 'assetid', 'equipmentid', 'assetclass', 'classification', 'floor', 'space', 'room', 'triparentfloortx', 'triprimarylocpathtx']);
const LOCATION_HINTS = new Set(['triaddresstx', 'address', 'city', 'postcode', 'trizippostaltx', 'tribuildingnametx', 'buildingclass', 'tribuildingclasscl', 'grossarea', 'trigisLatitudenu']);

export function suggestMode(headers: readonly string[]): ImportMode {
  const norm = headers.map(normaliseHeader);
  const asset = norm.filter((h) => ASSET_HINTS.has(h)).length;
  const location = norm.filter((h) => LOCATION_HINTS.has(h)).length;
  return location > asset ? 'locations' : 'assets';
}

/** Best-guess column for each field. Each column is used at most once. */
export function suggestMapping(headers: readonly string[], mode: ImportMode): ColumnMapping {
  const norm = headers.map(normaliseHeader);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  const synonyms = synonymsFor(mode);
  for (const field of IMPORT_FIELDS) {
    if (!field.modes.includes(mode)) continue;
    for (const syn of synonyms[field.key] ?? []) {
      const idx = norm.findIndex((h, i) => h === syn && !used.has(i));
      if (idx >= 0) {
        mapping[field.key] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return mapping;
}

// ---------- location paths ----------

export interface LocationParts {
  property?: string;
  building?: string;
  floor?: string;
  space?: string;
}

/** "\\Locations\\Property\\Building\\Floor\\Space" → ["Property", "Building", "Floor", "Space"]. */
export function splitTririgaPath(path: string): string[] {
  const parts = path
    .split('\\')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts[0]?.toLowerCase() === 'locations') parts.shift();
  return parts;
}

export function isTririgaPath(value: string): boolean {
  return value.trim().startsWith('\\');
}

/**
 * Location parts from a hierarchy path. `buildingIndex` is the position of the building among the
 * segments after \\Locations (1 when the path is \\Locations\\Property\\Building\\…).
 */
export function locationFromPath(path: string, buildingIndex = 1, assetName?: string): LocationParts {
  const seg = splitTririgaPath(path);
  if (seg.length === 0) return {};
  if (assetName && seg.length > buildingIndex + 1 && seg[seg.length - 1]!.toLowerCase() === assetName.trim().toLowerCase()) seg.pop();
  const out: LocationParts = {};
  if (buildingIndex >= 1) out.property = seg.slice(0, buildingIndex).join(' / ') || undefined;
  out.building = seg[buildingIndex];
  out.floor = seg[buildingIndex + 1];
  const space = seg.slice(buildingIndex + 2).join(' / ');
  if (space) out.space = space;
  return out;
}

export function tririgaPath(parts: LocationParts): string | undefined {
  const seg = [parts.property, parts.building, parts.floor, parts.space].filter((s): s is string => Boolean(s && s.trim()));
  return seg.length ? `\\Locations\\${seg.join('\\')}` : undefined;
}

// ---------- classification ----------

export interface Classification {
  type: AssetType | null;
  sentinel?: boolean;
  littleUsed?: boolean;
  loopRank?: LoopRank;
}

const OUTLET_WORDS = /\b(tap|outlet|basin|whb|sink|bath|shower|spray)\b/i;

const TYPE_RULES: readonly [RegExp, AssetType][] = [
  [/\b(return loop|hws return|secondary return|circulat\w* loop|(principal|subordinate|tertiary) (loop|return))\b/i, 'return_loop'],
  [/\b(expansion vessel|accumulator)\b/i, 'expansion_vessel'],
  [/\bcombination (water )?(heater|unit|cylinder)\b/i, 'combi_heater'],
  [/\b(calorifier|hot water (storage )?(cylinder|vessel|generator|tank)|hwc|unvented cylinder|plate heat exchanger|phe|storage water heater|direct[- ]fired (water )?heater)\b/i, 'calorifier'],
  [/\b(cold water (storage )?tank|cwst|cistern|break tank|water storage tank|header tank)\b/i, 'cold_water_tank'],
  [/\b(point[- ]of[- ]use|pou|instantaneous (water )?heater|under[- ]?sink (water )?heater|over[- ]?sink (water )?heater)\b/i, 'pou_heater'],
];

const OUTLET_RULES: readonly [RegExp, AssetType][] = [
  [/\b(shower|spray tap|eye ?wash|safety shower|emergency shower|drench)\b/i, 'shower'],
  [/\b(mixer|blended|monobloc)\b/i, 'mixed_outlet'],
  [/\bhot\b[^,;]*\b(tap|outlet|pillar|sentinel|feed)\b|\b(tap|outlet)\b[^,;]*\bhot\b|\bhwt\b/i, 'hot_outlet'],
  [/\bcold\b[^,;]*\b(tap|outlet|pillar|sentinel|feed)\b|\b(tap|outlet)\b[^,;]*\bcold\b|\bdrinking (water )?(fountain|tap|point)\b|\bwater (fountain|cooler)\b|\bbottle fill\w*\b/i, 'cold_outlet'],
  [/\b(little[- ]used|infrequently used|low[- ]use|dead ?leg)\b/i, 'little_used_outlet'],
  [/\b(wash ?hand basin|whb|basin|sink|bath|tap|outlet|belfast)\b/i, 'mixed_outlet'],
];

/** Water-hygiene asset type and flags suggested by a classification, name or description. */
export function classifyAsset(text: string): Classification {
  const t = text.trim();
  const out: Classification = { type: null };
  if (!t) return out;
  if (/\bsentinel\b|\bsnt\b|\b(nearest|furthest|farthest)\b/i.test(t)) out.sentinel = true;
  if (/\b(little[- ]used|infrequent\w* used|low[- ]use|eye ?wash|emergency shower|safety shower|drench)\b/i.test(t)) out.littleUsed = true;
  const rank = parseLoopRank(t);
  if (rank) out.loopRank = rank;
  if (/\bboiling water\b|\bhydroboil\b|\bzip tap\b/i.test(t)) return out; // above 90 °C: not an HSG274 temperature-check outlet
  for (const [re, type] of TYPE_RULES) if (re.test(t)) return { ...out, type };
  if (/\b(tmv\d?|thermostatic mix\w*|blending valve)\b/i.test(t)) return { ...out, type: /\bshower\b/i.test(t) ? 'shower' : OUTLET_WORDS.test(t) ? 'mixed_outlet' : 'tmv' };
  for (const [re, type] of OUTLET_RULES) if (re.test(t)) return { ...out, type };
  return out;
}

export function parseFlag(value: string | undefined): boolean | undefined {
  const v = (value ?? '').trim();
  if (/^(y|yes|true|1|x|✓|✔)$/i.test(v)) return true;
  if (/^(n|no|false|0|-)$/i.test(v)) return false;
  return undefined;
}

export function parseLoopRank(value: string | undefined): LoopRank | undefined {
  const v = (value ?? '').toLowerCase();
  if (/\bprincipal\b|\bprimary loop\b/.test(v)) return 'principal';
  if (/\bsubordinate\b|\bsecondary loop\b/.test(v)) return 'subordinate';
  if (/\btertiary\b/.test(v)) return 'tertiary';
  return undefined;
}

export function isInactiveStatus(value: string | undefined): boolean {
  return /\b(retired|inactive|disposed|removed|decommission\w*|demolished|archived|obsolete)\b/i.test(value ?? '');
}

// ---------- planning ----------

export interface ImportOptions {
  mode: ImportMode;
  /** Override per distinct classification value: an asset type, or "skip". */
  classMap?: Record<string, AssetType | 'skip'>;
  /** Position of the building among path segments after \\Locations (default 1). */
  pathBuildingIndex?: number;
  /** Put every asset into this existing site instead of reading the building from the file. */
  targetSiteId?: string;
  /** Change the type of assets that already exist when the file says otherwise (default true). */
  updateTypes?: boolean;
  system?: string;
}

export type ExistingSite = Pick<Site, 'id' | 'name' | 'code' | 'property' | 'address' | 'externalRef' | 'externalPath'>;
export type ExistingAsset = Pick<
  Asset,
  'id' | 'siteId' | 'name' | 'type' | 'sentinel' | 'littleUsed' | 'loopRank' | 'location' | 'floor' | 'space' | 'tag' | 'serial' | 'classification' | 'notes' | 'active' | 'externalRef' | 'externalRecordId' | 'externalPath'
>;

export interface SiteData {
  name: string;
  code?: string;
  property?: string;
  address?: string;
  externalRef: string;
  externalPath?: string;
}

export interface AssetData {
  type: AssetType;
  name: string;
  location?: string;
  floor?: string;
  space?: string;
  tag?: string;
  serial?: string;
  classification?: string;
  notes?: string;
  sentinel: boolean;
  littleUsed: boolean;
  loopRank?: LoopRank;
  active: boolean;
  externalRef: string;
  externalRecordId?: string;
  externalPath?: string;
}

export interface PlannedSite {
  key: string;
  action: 'create' | 'update' | 'unchanged';
  existingId?: string;
  data: SiteData;
  changes: string[];
  rows: number;
}

export type AssetAction = 'create' | 'update' | 'unchanged' | 'skip' | 'error';

export interface PlannedAsset {
  /** 1-based data row number (header excluded). */
  row: number;
  action: AssetAction;
  name: string;
  siteKey?: string;
  siteId?: string;
  siteLabel?: string;
  existingId?: string;
  data?: AssetData;
  typeLabel?: string;
  changes?: string[];
  reason?: string;
}

export interface ClassSummary {
  value: string;
  count: number;
  suggested: AssetType | null;
  effective: AssetType | 'skip';
}

export interface ImportPlan {
  mode: ImportMode;
  summary: {
    rows: number;
    sites: Record<'create' | 'update' | 'unchanged', number>;
    assets: Record<AssetAction, number>;
  };
  sites: PlannedSite[];
  assets: PlannedAsset[];
  classes: ClassSummary[];
  warnings: string[];
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Stored reference keeps the source system's spelling; matching is case-insensitive. */
function siteRefOf(buildingId: string, property: string, building: string): string | null {
  if (buildingId) return `id:${buildingId.trim()}`;
  if (building) return `name:${norm(property)}|${norm(building)}`;
  return null;
}

/** How strong a stored reference is: a source ID beats a record ID beats a name or location key. */
function refRank(ref: string | undefined): number {
  if (!ref) return 0;
  if (ref.startsWith('id:')) return 3;
  if (ref.startsWith('rec:')) return 2;
  return 1;
}

/** Keep the stronger of two references so a file without IDs never downgrades an ID-linked record. */
function strongerRef(incoming: string, existing: string | undefined): string {
  return refRank(incoming) >= refRank(existing) ? incoming : existing!;
}

/** The ID part of a stored reference ("id:EQ-1" → "EQ-1"), or undefined for name/location based keys. */
export function externalIdOf(ref: string | undefined): string | undefined {
  return ref?.startsWith('id:') ? ref.slice(3) : undefined;
}

function diff<T extends object>(before: T, after: Partial<T>, keys: readonly (keyof T)[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const a = before[k] ?? undefined;
    const b = after[k] ?? undefined;
    if (b === undefined) continue;
    if ((a === '' ? undefined : a) !== (b === '' ? undefined : b)) out.push(String(k));
  }
  return out;
}

/**
 * Work out what an import would do without touching storage: which sites and assets are created,
 * updated, left alone or skipped, and why. Pure, so the preview and the commit agree.
 */
export function planImport(
  rows: readonly (readonly string[])[],
  mapping: ColumnMapping,
  options: ImportOptions,
  existing: { sites: readonly ExistingSite[]; assets: readonly ExistingAsset[] },
): ImportPlan {
  const mode = options.mode;
  const buildingIndex = options.pathBuildingIndex ?? 1;
  const updateTypes = options.updateTypes ?? true;
  const warnings: string[] = [];
  const get = (row: readonly string[], f: ImportField) => {
    const i = mapping[f];
    return i === undefined ? '' : (row[i] ?? '').trim();
  };

  const sitesByRef = new Map(existing.sites.filter((s) => s.externalRef).map((s) => [norm(s.externalRef), s]));
  const sitesByCode = new Map(existing.sites.filter((s) => s.code).map((s) => [norm(s.code), s]));
  const sitesByName = new Map(existing.sites.map((s) => [norm(s.name), s]));
  const assetsByRef = new Map(existing.assets.filter((a) => a.externalRef).map((a) => [norm(a.externalRef), a]));
  const assetsByRecord = new Map(existing.assets.filter((a) => a.externalRecordId).map((a) => [norm(a.externalRecordId), a]));
  const assetsBySiteTag = new Map(existing.assets.filter((a) => a.tag).map((a) => [`${a.siteId}|${norm(a.tag)}`, a]));
  const targetSite = options.targetSiteId ? existing.sites.find((s) => s.id === options.targetSiteId) : undefined;
  if (options.targetSiteId && !targetSite) warnings.push('The chosen target site no longer exists.');

  const plannedSites = new Map<string, PlannedSite>();
  const siteRowCounts = new Map<string, number>();

  const resolveSite = (ref: string, data: Omit<SiteData, 'externalRef'>, buildingId: string): PlannedSite => {
    const key = norm(ref);
    const found = plannedSites.get(key);
    if (found) {
      if (!found.data.property && data.property) found.data.property = data.property;
      if (!found.data.address && data.address) found.data.address = data.address;
      return found;
    }
    const match = sitesByRef.get(key) ?? (buildingId ? sitesByCode.get(norm(buildingId)) : undefined) ?? sitesByName.get(norm(data.name));
    const full: SiteData = { ...data, externalRef: ref };
    let planned: PlannedSite;
    if (!match) planned = { key, action: 'create', data: full, changes: [], rows: 0 };
    else {
      const merged: SiteData = {
        ...full,
        code: full.code ?? match.code,
        property: full.property ?? match.property,
        address: full.address ?? match.address,
        externalRef: strongerRef(ref, match.externalRef),
        externalPath: full.externalPath ?? match.externalPath,
      };
      const changes = diff(match as SiteData, merged, ['name', 'code', 'property', 'address', 'externalRef', 'externalPath']);
      planned = { key, action: changes.length ? 'update' : 'unchanged', existingId: match.id, data: merged, changes, rows: 0 };
    }
    plannedSites.set(key, planned);
    return planned;
  };

  const assets: PlannedAsset[] = [];
  const classCounts = new Map<string, number>();
  const seenAssetKeys = new Map<string, number>();
  let defaultedLoops = 0;

  rows.forEach((row, i) => {
    const rowNo = i + 1;
    const path = get(row, 'path') || (isTririgaPath(get(row, 'locationText')) ? get(row, 'locationText') : '');
    const assetName = get(row, 'assetName');
    const fromPath = path ? locationFromPath(path, buildingIndex, mode === 'assets' ? assetName : undefined) : {};
    const property = get(row, 'property') || fromPath.property || '';
    const building = get(row, 'building') || fromPath.building || '';
    const buildingId = get(row, 'buildingId');

    if (mode === 'locations') {
      const name = building || buildingId;
      const ref = siteRefOf(buildingId, property, building);
      if (!ref || !name) {
        assets.push({ row: rowNo, action: 'error', name: '(no building)', reason: 'No building ID or name in this row' });
        return;
      }
      const address = [get(row, 'address'), get(row, 'city'), get(row, 'postcode')].filter(Boolean).join(', ') || undefined;
      const site = resolveSite(ref, { name, code: buildingId || undefined, property: property || undefined, address, externalPath: path || tririgaPath({ property, building }) }, buildingId);
      siteRowCounts.set(site.key, (siteRowCounts.get(site.key) ?? 0) + 1);
      assets.push({ row: rowNo, action: site.action, name, siteKey: site.key, siteLabel: name });
      return;
    }

    // ----- assets mode -----
    const assetId = get(row, 'assetId');
    const recordId = get(row, 'recordId');
    const barcode = get(row, 'barcode');
    const name = assetName || barcode || assetId;
    const classValue = get(row, 'classification');
    const description = get(row, 'description');
    classCounts.set(classValue, (classCounts.get(classValue) ?? 0) + 1);
    if (!name) {
      assets.push({ row: rowNo, action: 'error', name: '(unnamed)', reason: 'No asset name, barcode or ID' });
      return;
    }

    let siteRef: string | undefined;
    let siteKey: string | undefined;
    let siteId: string | undefined;
    let siteLabel: string | undefined;
    if (targetSite) {
      siteId = targetSite.id;
      siteLabel = targetSite.name;
      siteKey = `site:${targetSite.id}`;
    } else {
      siteRef = siteRefOf(buildingId, property, building) ?? undefined;
      if (!siteRef) {
        assets.push({ row: rowNo, action: 'error', name, reason: 'No building for this row: map a building column or path, or choose a target site' });
        return;
      }
      siteKey = norm(siteRef);
      siteLabel = building || buildingId;
    }

    // type
    const mapped = classValue ? options.classMap?.[classValue] : undefined;
    const auto = [classValue, name, description].map(classifyAsset);
    const autoType = auto.find((c) => c.type)?.type ?? null;
    const type: AssetType | null = mapped === 'skip' ? null : (mapped ?? autoType);
    if (!type) {
      assets.push({ row: rowNo, action: 'skip', name, siteLabel, reason: mapped === 'skip' ? `"${classValue}" is set to skip` : `No water-hygiene type for "${classValue || name}"` });
      return;
    }

    const floor = get(row, 'floor') || fromPath.floor || undefined;
    const space = get(row, 'space') || fromPath.space || undefined;
    const locationText = get(row, 'locationText');
    const location = (locationText && !isTririgaPath(locationText) ? locationText : undefined) ?? ([floor, space].filter(Boolean).join(' · ') || undefined);
    const sentinelCol = parseFlag(get(row, 'sentinel'));
    const littleCol = parseFlag(get(row, 'littleUsed'));
    const rankCol = parseLoopRank(get(row, 'loopRank'));
    const kwSentinel = auto.some((c) => c.sentinel) || undefined;
    const kwLittle = auto.some((c) => c.littleUsed) || undefined;
    const kwRank = auto.find((c) => c.loopRank)?.loopRank;
    const active = !isInactiveStatus(get(row, 'status'));

    const ref = assetId ? `id:${assetId}` : recordId ? `rec:${recordId}` : `loc:${siteKey}|${norm(floor)}|${norm(space)}|${norm(name)}`;
    const key = norm(ref);
    const dup = seenAssetKeys.get(key);
    if (dup !== undefined) {
      assets.push({ row: rowNo, action: 'error', name, siteLabel, reason: `Same asset as row ${dup}` });
      return;
    }
    seenAssetKeys.set(key, rowNo);

    const siteForTag = targetSite?.id ?? (siteKey ? (sitesByRef.get(siteKey) ?? (buildingId ? sitesByCode.get(norm(buildingId)) : undefined) ?? sitesByName.get(norm(building)))?.id : undefined);
    // A tag match links rows without IDs, or IDs to assets that have no source link yet; it never
    // joins two different source IDs to one asset.
    const tagMatch = siteForTag && (barcode || assetId) ? assetsBySiteTag.get(`${siteForTag}|${norm(barcode || assetId)}`) : undefined;
    const match =
      assetsByRef.get(key) ??
      (recordId ? assetsByRecord.get(norm(recordId)) : undefined) ??
      (tagMatch && (refRank(ref) === 1 || !tagMatch.externalRef) ? tagMatch : undefined);

    let loopRank = rankCol ?? kwRank;
    if (type === 'return_loop' && !loopRank && !match?.loopRank) {
      loopRank = 'principal';
      defaultedLoops += 1;
    }

    const data: AssetData = {
      type: match && !updateTypes ? match.type : type,
      name,
      location: location ?? match?.location,
      floor: floor ?? match?.floor,
      space: space ?? match?.space,
      tag: barcode || assetId || match?.tag || undefined,
      serial: get(row, 'serial') || match?.serial || undefined,
      classification: classValue || match?.classification || undefined,
      notes: description || match?.notes || undefined,
      sentinel: sentinelCol ?? (kwSentinel ? true : (match?.sentinel ?? false)),
      littleUsed: littleCol ?? (kwLittle ? true : (match?.littleUsed ?? type === 'little_used_outlet')),
      loopRank: type === 'return_loop' ? (loopRank ?? match?.loopRank) : undefined,
      active,
      externalRef: strongerRef(ref, match?.externalRef),
      externalRecordId: recordId || match?.externalRecordId || undefined,
      externalPath: path || match?.externalPath || undefined,
    };

    if (!targetSite) {
      const planned = resolveSite(siteRef!, { name: building || buildingId, code: buildingId || undefined, property: property || undefined, externalPath: tririgaPath({ property, building }) }, buildingId);
      siteRowCounts.set(planned.key, (siteRowCounts.get(planned.key) ?? 0) + 1);
      siteId = planned.existingId;
    }

    if (!match) {
      assets.push({ row: rowNo, action: 'create', name, siteKey, siteId, siteLabel, data, typeLabel: ASSET_TYPE_LABELS[data.type] });
      return;
    }
    const changes = diff(match as unknown as AssetData, data, ['type', 'name', 'location', 'floor', 'space', 'tag', 'serial', 'classification', 'notes', 'sentinel', 'littleUsed', 'loopRank', 'active', 'externalRef', 'externalRecordId', 'externalPath']);
    if (siteId && match.siteId !== siteId) changes.push('site');
    if (!siteId && !targetSite) changes.push('site'); // moving to a site that is created by this import
    assets.push({
      row: rowNo,
      action: changes.length ? 'update' : 'unchanged',
      name,
      siteKey,
      siteId,
      siteLabel,
      existingId: match.id,
      data,
      typeLabel: ASSET_TYPE_LABELS[data.type],
      changes,
    });
  });

  for (const [key, count] of siteRowCounts) {
    const s = plannedSites.get(key);
    if (s) s.rows = count;
  }
  if (defaultedLoops) warnings.push(`${defaultedLoops} return loop(s) had no rank and were set to principal (monthly checks). Change them on the site page if needed.`);

  const classes: ClassSummary[] =
    mode === 'assets' && mapping.classification !== undefined
      ? [...classCounts.entries()]
          .map(([value, count]) => {
            const suggested = classifyAsset(value).type;
            const override = value ? options.classMap?.[value] : undefined;
            return { value, count, suggested, effective: override ?? suggested ?? 'skip' };
          })
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      : [];

  const sites = [...plannedSites.values()];
  const count = <T extends string>(items: readonly { action: T }[], keys: readonly T[]) => Object.fromEntries(keys.map((k) => [k, items.filter((x) => x.action === k).length])) as Record<T, number>;
  return {
    mode,
    summary: {
      rows: rows.length,
      sites: count(sites, ['create', 'update', 'unchanged'] as const),
      assets: mode === 'assets' ? count(assets, ['create', 'update', 'unchanged', 'skip', 'error'] as const) : { create: 0, update: 0, unchanged: 0, skip: 0, error: assets.filter((a) => a.action === 'error').length },
    },
    sites,
    assets,
    classes,
    warnings,
  };
}
