/**
 * Writes fictional TRIRIGA-style export files to docs/tririga/samples for trying the importer.
 * Run after `pnpm build` (uses the built @ld/core writer): node scripts/make-tririga-samples.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toDelimited, writeXlsx } from '../packages/core/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (name) => path.join(root, 'docs/tririga/samples', name);
const P = '\\Locations\\Demo Estate';

// 1. Building equipment report, as TRIRIGA's Export to Excel produces it: a title and run date above the header.
const equipment = [
  ['Building Equipment - Water Services (demo export)'],
  ['Run date: 30/09/2026'],
  [],
  ['ID', 'Name', 'Spec Name', 'Barcode', 'Serial Number', 'Status', 'Path', 'Building ID'],
  ['DH-EQ-0001', 'Calorifier 1', 'Calorifier', 'DH-CAL-01', 'CAL-88121', 'Active', `${P}\\Demo House\\Basement\\B.01 Plant Room`, 'DH-01'],
  ['DH-EQ-0002', 'Cold water storage tank', 'Cold Water Storage Tank', 'DH-CWST-01', '', 'Active', `${P}\\Demo House\\Roof\\R.01 Tank Room`, 'DH-01'],
  ['DH-EQ-0003', 'HWS principal return', 'HWS Return Loop - Principal', '', '', 'Active', `${P}\\Demo House\\Basement\\B.01 Plant Room`, 'DH-01'],
  ['DH-EQ-0004', 'Kitchen hot tap (nearest)', 'Sentinel Hot Tap', 'DH-HT-001', '', 'Active', `${P}\\Demo House\\Ground\\0.14 Kitchen`, 'DH-01'],
  ['DH-EQ-0005', 'WC hot tap (furthest)', 'Sentinel Hot Tap', 'DH-HT-052', '', 'Active', `${P}\\Demo House\\Third\\3.22 WC North`, 'DH-01'],
  ['DH-EQ-0006', 'WC cold tap (nearest)', 'Sentinel Cold Tap', 'DH-CT-001', '', 'Active', `${P}\\Demo House\\Ground\\0.08 WC South`, 'DH-01'],
  ['DH-EQ-0007', 'WC cold tap (furthest)', 'Sentinel Cold Tap', 'DH-CT-052', '', 'Active', `${P}\\Demo House\\Third\\3.22 WC North`, 'DH-01'],
  ['DH-EQ-0008', 'Wash hand basin 2.10', 'Wash Hand Basin', 'DH-WHB-210', '', 'Active', `${P}\\Demo House\\Second\\2.10 WC`, 'DH-01'],
  ['DH-EQ-0009', 'Accessible WC basin', 'Basin (TMV)', 'DH-MX-002', '', 'Active', `${P}\\Demo House\\Ground\\0.09 Accessible WC`, 'DH-01'],
  ['DH-EQ-0010', 'TMV accessible WC', 'TMV3', 'DH-TMV-002', 'TMV-5521', 'Active', `${P}\\Demo House\\Ground\\0.09 Accessible WC`, 'DH-01'],
  ['DH-EQ-0011', 'Cycle store shower 1', 'Shower', 'DH-SH-01', '', 'Active', `${P}\\Demo House\\Basement\\B.06 Cycle Store`, 'DH-01'],
  ['DH-EQ-0012', 'Cycle store shower 2', 'Shower - Little Used', 'DH-SH-02', '', 'Active', `${P}\\Demo House\\Basement\\B.06 Cycle Store`, 'DH-01'],
  ['DH-EQ-0013', 'Tea point water heater', 'Point of Use Water Heater', 'DH-POU-03', 'POU-7781', 'Active', `${P}\\Demo House\\Third\\3.05 Tea Point`, 'DH-01'],
  ['DH-EQ-0014', 'Expansion vessel EV1', 'Expansion Vessel', 'DH-EV-01', '', 'Active', `${P}\\Demo House\\Basement\\B.01 Plant Room`, 'DH-01'],
  ['DH-EQ-0015', 'Old showers (removed 2025)', 'Shower', 'DH-SH-09', '', 'Retired', `${P}\\Demo House\\First\\1.30 Changing`, 'DH-01'],
  ['DH-EQ-0016', 'Air handling unit 1', 'Air Handling Unit', 'DH-AHU-01', '', 'Active', `${P}\\Demo House\\Roof\\R.02 Plant`, 'DH-01'],
  ['DH-EQ-0017', 'Boiling water tap', 'Boiling Water Unit', 'DH-BWU-01', '', 'Active', `${P}\\Demo House\\Third\\3.05 Tea Point`, 'DH-01'],
  ['DA-EQ-0001', 'Annex calorifier', 'Calorifier', 'DA-CAL-01', '', 'Active', `${P}\\Demo Annex\\Ground\\G.02 Plant`, 'DA-02'],
  ['DA-EQ-0002', 'Annex kitchen hot tap', 'Sentinel Hot Tap', 'DA-HT-001', '', 'Active', `${P}\\Demo Annex\\Ground\\G.05 Kitchen`, 'DA-02'],
  ['DA-EQ-0003', 'Annex kitchen cold tap', 'Sentinel Cold Tap', 'DA-CT-001', '', 'Active', `${P}\\Demo Annex\\Ground\\G.05 Kitchen`, 'DA-02'],
  ['DA-EQ-0004', 'Eye wash station', 'Eye Wash Station', 'DA-EW-01', '', 'Active', `${P}\\Demo Annex\\Ground\\G.07 Lab`, 'DA-02'],
];
writeFileSync(out('building-equipment-report.xlsx'), writeXlsx(equipment, 'Building Equipment'));

// 2. Building list (Buildings only mode).
const buildings = [
  ['ID', 'Name', 'Parent Property', 'Address', 'City', 'Postcode', 'Path'],
  ['DH-01', 'Demo House', 'Demo Estate', '1 Example Road', 'Exampleton', 'XX1 1XX', `${P}\\Demo House`],
  ['DA-02', 'Demo Annex', 'Demo Estate', '3 Example Road', 'Exampleton', 'XX1 1XY', `${P}\\Demo Annex`],
];
writeFileSync(out('buildings.csv'), toDelimited(buildings, ','));

// 3. A saved OSLC query response (…/oslc/spq/triAPICOutboundAssetQC?oslc.select=*).
const member = (id, name, spec, pathTail, rec) => ({
  'spi:triIdTX': id,
  'spi:triNameTX': name,
  'spi:triSpecNameTX': spec,
  'spi:triStatusCL': 'Active',
  'spi:triPrimaryLocPathTX': `${P}\\${pathTail}`,
  'spi:triBarCodeEntryTX': '',
  'dcterms:identifier': rec,
  'rdf:about': `https://tririga.example.invalid/oslc/so/triAPICOutboundAssetRS/${rec}`,
});
const oslc = {
  'oslc:responseInfo': { 'oslc:totalCount': 3, 'rdf:about': 'https://tririga.example.invalid/oslc/spq/triAPICOutboundAssetQC?oslc.select=*' },
  'rdfs:member': [
    member('DA-EQ-0005', 'Annex WC basin', 'Wash Hand Basin', 'Demo Annex\\First\\1.03 WC', '135900001'),
    member('DA-EQ-0006', 'Annex cleaners sink', 'Cleaners Sink - Little Used', 'Demo Annex\\First\\1.04 Cleaners Cupboard', '135900002'),
    member('DA-EQ-0007', 'Annex cold water tank', 'Cold Water Storage Tank', 'Demo Annex\\Roof\\R.01 Tank Room', '135900003'),
  ],
};
writeFileSync(out('oslc-building-equipment.json'), JSON.stringify(oslc, null, 2) + '\n');

// 4. A legionella risk assessment outlet register (no TRIRIGA IDs; flags as columns).
const register = [
  ['Asset Ref', 'Outlet Type', 'Building', 'Floor', 'Room', 'Sentinel (Y/N)', 'Little Used (Y/N)'],
  ['RA-001', 'Hot tap', 'Demo Annex', 'First', '1.10 Office kitchenette', 'N', 'N'],
  ['RA-002', 'Cold tap', 'Demo Annex', 'First', '1.10 Office kitchenette', 'N', 'N'],
  ['RA-003', 'Shower', 'Demo Annex', 'First', '1.12 Shower room', 'N', 'Y'],
];
writeFileSync(out('risk-assessment-register.csv'), toDelimited(register, ','));
console.log('Sample files written to docs/tririga/samples');
