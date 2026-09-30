import { describe, expect, it } from 'vitest';
import {
  classifyAsset,
  detectHeaderRow,
  isInactiveStatus,
  locationFromPath,
  parseFlag,
  planImport,
  splitTririgaPath,
  suggestMapping,
  suggestMode,
  tririgaPath,
  type ExistingAsset,
  type ExistingSite,
} from '../src/index.js';

describe('header mapping', () => {
  it('maps a TRIRIGA building equipment report by label', () => {
    const headers = ['ID', 'Name', 'Spec Name', 'Barcode', 'Serial Number', 'Status', 'Path'];
    expect(suggestMode(headers)).toBe('assets');
    expect(suggestMapping(headers, 'assets')).toEqual({ assetId: 0, assetName: 1, classification: 2, barcode: 3, serial: 4, status: 5, path: 6 });
  });

  it('maps TRIRIGA field names from an OSLC or Data Integrator file', () => {
    const headers = ['triIdTX', 'triNameTX', 'triSpecNameTX', 'triBarCodeEntryTX', 'triPrimaryLocPathTX', 'identifier', 'spi:triStatusCL'];
    expect(suggestMapping(headers, 'assets')).toEqual({ assetId: 0, assetName: 1, classification: 2, barcode: 3, path: 4, recordId: 5, status: 6 });
  });

  it('maps a legionella risk assessment register', () => {
    const headers = ['Asset Ref', 'Outlet Type', 'Building', 'Floor', 'Room', 'Sentinel (Y/N)', 'Little Used (Y/N)'];
    expect(suggestMapping(headers, 'assets')).toEqual({ assetId: 0, classification: 1, building: 2, floor: 3, space: 4, sentinel: 5, littleUsed: 6 });
  });

  it('maps a building list in locations mode', () => {
    const headers = ['ID', 'Name', 'Parent Property', 'Address', 'City', 'Postcode'];
    expect(suggestMode(headers)).toBe('locations');
    expect(suggestMapping(headers, 'locations')).toEqual({ buildingId: 0, building: 1, property: 2, address: 3, city: 4, postcode: 5 });
  });

  it('finds the header row under a report title', () => {
    const rows = [['Building Equipment report'], ['Run on 30/09/2026', ''], ['ID', 'Name', 'Spec Name', 'Path'], ['EQ-1', 'Cal 1', 'Calorifier', '\\Locations\\P\\B']];
    expect(detectHeaderRow(rows)).toBe(2);
  });
});

describe('location paths', () => {
  it('splits \\Locations paths', () => {
    expect(splitTririgaPath('\\Locations\\Property 08\\Bldg 07\\Floor 15\\A.002')).toEqual(['Property 08', 'Bldg 07', 'Floor 15', 'A.002']);
    expect(locationFromPath('\\Locations\\Property 08\\Bldg 07\\Floor 15\\A.002')).toEqual({ property: 'Property 08', building: 'Bldg 07', floor: 'Floor 15', space: 'A.002' });
  });

  it('drops a trailing segment that is the asset itself', () => {
    expect(locationFromPath('\\Locations\\P\\B\\F1\\Kitchen\\HT-01', 1, 'HT-01')).toEqual({ property: 'P', building: 'B', floor: 'F1', space: 'Kitchen' });
  });

  it('handles an extra category level', () => {
    expect(locationFromPath('\\Locations\\UK\\London Estate\\House A\\Ground', 2)).toEqual({ property: 'UK / London Estate', building: 'House A', floor: 'Ground' });
  });

  it('builds paths back', () => {
    expect(tririgaPath({ property: 'P', building: 'B', floor: 'F' })).toBe('\\Locations\\P\\B\\F');
    expect(tririgaPath({})).toBeUndefined();
  });
});

describe('classification', () => {
  const cases: [string, string | null][] = [
    ['Calorifier', 'calorifier'],
    ['Hot Water Storage Tank', 'calorifier'],
    ['Cold Water Storage Tank', 'cold_water_tank'],
    ['CWST 2', 'cold_water_tank'],
    ['TMV3', 'tmv'],
    ['Basin (TMV)', 'mixed_outlet'],
    ['TMV shower', 'shower'],
    ['Point of Use Water Heater', 'pou_heater'],
    ['Combination water heater', 'combi_heater'],
    ['Expansion Vessel', 'expansion_vessel'],
    ['HWS return loop - subordinate', 'return_loop'],
    ['Wash Hand Basin', 'mixed_outlet'],
    ['Hot tap', 'hot_outlet'],
    ['Cold outlet', 'cold_outlet'],
    ['Drinking water fountain', 'cold_outlet'],
    ['Eye wash station', 'shower'],
    ['Boiling water unit', null],
    ['Air handling unit', null],
    ['Fire extinguisher', null],
  ];
  it.each(cases)('%s → %s', (text, type) => {
    expect(classifyAsset(text).type).toBe(type);
  });

  it('picks up flags from wording', () => {
    expect(classifyAsset('Sentinel hot tap (furthest)')).toMatchObject({ type: 'hot_outlet', sentinel: true });
    expect(classifyAsset('Emergency shower')).toMatchObject({ type: 'shower', littleUsed: true });
    expect(classifyAsset('Subordinate return loop').loopRank).toBe('subordinate');
    expect(parseFlag('Y')).toBe(true);
    expect(parseFlag('no')).toBe(false);
    expect(parseFlag('maybe')).toBeUndefined();
    expect(isInactiveStatus('Retired')).toBe(true);
    expect(isInactiveStatus('Active')).toBe(false);
  });
});

describe('planImport', () => {
  const headers = ['ID', 'Name', 'Spec Name', 'Barcode', 'Status', 'Path', 'Building ID'];
  const rows = [
    ['EQ-1', 'Calorifier 1', 'Calorifier', 'BC-1', 'Active', '\\Locations\\Estate\\House A\\Basement\\Plant', 'B-100'],
    ['EQ-2', 'Kitchen hot tap', 'Sentinel hot tap', '', 'Active', '\\Locations\\Estate\\House A\\Ground\\Kitchen', 'B-100'],
    ['EQ-3', 'AHU 1', 'Air handling unit', '', 'Active', '\\Locations\\Estate\\House A\\Roof', 'B-100'],
    ['EQ-4', 'Old TMV', 'TMV3', '', 'Retired', '\\Locations\\Estate\\House B\\Ground\\WC', 'B-200'],
    ['', '', 'Calorifier', '', '', '\\Locations\\Estate\\House B', 'B-200'],
    ['EQ-1', 'Calorifier 1 again', 'Calorifier', '', '', '\\Locations\\Estate\\House A\\Basement', 'B-100'],
  ];
  const mapping = suggestMapping(headers, 'assets');

  it('plans sites and assets on a first import', () => {
    const plan = planImport(rows, mapping, { mode: 'assets' }, { sites: [], assets: [] });
    expect(plan.summary.sites).toEqual({ create: 2, update: 0, unchanged: 0 });
    expect(plan.summary.assets).toEqual({ create: 3, update: 0, unchanged: 0, skip: 1, error: 2 });
    const cal = plan.assets[0]!;
    expect(cal).toMatchObject({ action: 'create', siteKey: 'id:b-100', siteLabel: 'House A' });
    expect(cal.data).toMatchObject({ type: 'calorifier', floor: 'Basement', space: 'Plant', tag: 'BC-1', externalRef: 'id:EQ-1', active: true });
    expect(plan.assets[1]!.data).toMatchObject({ type: 'hot_outlet', sentinel: true, tag: 'EQ-2' });
    expect(plan.assets[2]).toMatchObject({ action: 'skip' });
    expect(plan.assets[3]!.data).toMatchObject({ type: 'tmv', active: false });
    expect(plan.assets[4]).toMatchObject({ action: 'error' });
    expect(plan.assets[5]).toMatchObject({ action: 'error', reason: 'Same asset as row 1' });
    expect(plan.sites.find((s) => s.key === 'id:b-100')!.data).toMatchObject({ name: 'House A', code: 'B-100', property: 'Estate', externalPath: '\\Locations\\Estate\\House A' });
    expect(plan.classes.map((c) => [c.value, c.count, c.effective])).toContainEqual(['Air handling unit', 1, 'skip']);
  });

  it('is idempotent against what the first import stored', () => {
    const first = planImport(rows.slice(0, 4), mapping, { mode: 'assets' }, { sites: [], assets: [] });
    const sites: ExistingSite[] = first.sites.map((s, i) => ({ id: `s${i}`, ...s.data }));
    const siteId = (key?: string) => sites[first.sites.findIndex((s) => s.key === key)]!.id;
    const assets: ExistingAsset[] = first.assets
      .filter((a) => a.action === 'create')
      .map((a, i) => ({ id: `a${i}`, siteId: siteId(a.siteKey), ...a.data!, loopRank: a.data!.loopRank }));
    const again = planImport(rows.slice(0, 4), mapping, { mode: 'assets' }, { sites, assets });
    expect(again.summary.sites).toEqual({ create: 0, update: 0, unchanged: 2 });
    expect(again.summary.assets).toMatchObject({ create: 0, update: 0, unchanged: 3, skip: 1 });

    const renamed = rows.slice(0, 1).map((r) => [...r]);
    renamed[0]![1] = 'Calorifier 1 (east)';
    const upd = planImport(renamed, mapping, { mode: 'assets' }, { sites, assets });
    expect(upd.assets[0]).toMatchObject({ action: 'update', changes: ['name'] });
  });

  it('honours class overrides and a target site', () => {
    const sites: ExistingSite[] = [{ id: 'site-1', name: 'Manual site' }];
    const plan = planImport(rows.slice(0, 3), mapping, { mode: 'assets', targetSiteId: 'site-1', classMap: { Calorifier: 'skip', 'Air handling unit': 'cold_outlet' } }, { sites, assets: [] });
    expect(plan.sites).toHaveLength(0);
    expect(plan.assets.map((a) => a.action)).toEqual(['skip', 'create', 'create']);
    expect(plan.assets[2]!.data!.type).toBe('cold_outlet');
    expect(plan.assets[1]!.siteId).toBe('site-1');
  });

  it('links manual assets by tag instead of duplicating them', () => {
    const sites: ExistingSite[] = [{ id: 'site-1', name: 'House A', code: 'B-100' }];
    const assets: ExistingAsset[] = [{ id: 'a1', siteId: 'site-1', name: 'Calorifier', type: 'calorifier', sentinel: false, littleUsed: false, active: true, tag: 'BC-1' }];
    const plan = planImport(rows.slice(0, 1), mapping, { mode: 'assets' }, { sites, assets });
    expect(plan.sites[0]).toMatchObject({ action: 'update', existingId: 'site-1', changes: ['property', 'externalRef', 'externalPath'] });
    expect(plan.assets[0]).toMatchObject({ action: 'update', existingId: 'a1' });
    expect(plan.assets[0]!.changes).toContain('externalRef');
  });

  it('matches IDs case-insensitively but keeps the source spelling', () => {
    const sites: ExistingSite[] = [{ id: 's1', name: 'House A', code: 'B-100', property: 'Estate', externalRef: 'id:b-100', externalPath: '\\Locations\\Estate\\House A' }];
    const assets: ExistingAsset[] = [{ id: 'a1', siteId: 's1', name: 'Calorifier 1', type: 'calorifier', sentinel: false, littleUsed: false, active: true, tag: 'BC-1', floor: 'Basement', space: 'Plant', location: 'Basement · Plant', classification: 'Calorifier', externalRef: 'id:eq-1', externalPath: '\\Locations\\Estate\\House A\\Basement\\Plant' }];
    const plan = planImport(rows.slice(0, 1), mapping, { mode: 'assets' }, { sites, assets });
    expect(plan.sites[0]).toMatchObject({ existingId: 's1', changes: ['externalRef'] });
    expect(plan.assets[0]).toMatchObject({ action: 'update', existingId: 'a1', changes: ['externalRef'] });
    expect(plan.assets[0]!.data!.externalRef).toBe('id:EQ-1');
  });

  it('never downgrades an ID link from a file without IDs', () => {
    const sites: ExistingSite[] = [{ id: 's1', name: 'House A', code: 'B-100', property: 'Estate', externalRef: 'id:B-100' }];
    const assets: ExistingAsset[] = [{ id: 'a1', siteId: 's1', name: 'Kitchen hot tap', type: 'hot_outlet', sentinel: true, littleUsed: false, active: true, tag: 'HT-1', externalRef: 'id:EQ-2' }];
    const h = ['Name', 'Barcode', 'Building', 'Property', 'Outlet Type'];
    const plan = planImport([['Kitchen hot tap', 'HT-1', 'House A', 'Estate', 'Hot tap']], suggestMapping(h, 'assets'), { mode: 'assets' }, { sites, assets });
    expect(plan.sites[0]).toMatchObject({ existingId: 's1', changes: ['externalPath'] });
    expect(plan.sites[0]!.data.externalRef).toBe('id:B-100');
    expect(plan.assets[0]).toMatchObject({ existingId: 'a1' });
    expect(plan.assets[0]!.data!.externalRef).toBe('id:EQ-2');
  });

  it('does not join two different source IDs through a shared tag', () => {
    const sites: ExistingSite[] = [{ id: 's1', name: 'House A', code: 'B-100', externalRef: 'id:B-100' }];
    const assets: ExistingAsset[] = [{ id: 'a1', siteId: 's1', name: 'Tap', type: 'hot_outlet', sentinel: false, littleUsed: false, active: true, tag: 'BC-1', externalRef: 'id:EQ-OLD' }];
    const plan = planImport([['EQ-NEW', 'Tap', 'Hot tap', 'BC-1', '', '', 'B-100']], mapping, { mode: 'assets' }, { sites, assets });
    expect(plan.assets[0]).toMatchObject({ action: 'create' });
  });

  it('reports rows with no building', () => {
    const plan = planImport([['EQ-9', 'Tap', 'Hot tap', '', '', '', '']], mapping, { mode: 'assets' }, { sites: [], assets: [] });
    expect(plan.assets[0]).toMatchObject({ action: 'error' });
    expect(plan.assets[0]!.reason).toMatch(/No building/);
  });

  it('imports buildings in locations mode', () => {
    const h = ['ID', 'Name', 'Parent Property', 'Address', 'City', 'Postcode'];
    const plan = planImport(
      [
        ['B-100', 'House A', 'Estate', '1 Example Road', 'York', 'YO1 1AA'],
        ['B-200', 'House B', 'Estate', '', '', ''],
      ],
      suggestMapping(h, 'locations'),
      { mode: 'locations' },
      { sites: [], assets: [] },
    );
    expect(plan.summary.sites.create).toBe(2);
    expect(plan.sites[0]!.data).toEqual({ name: 'House A', code: 'B-100', property: 'Estate', address: '1 Example Road, York, YO1 1AA', externalRef: 'id:B-100', externalPath: '\\Locations\\Estate\\House A' });
  });
});
