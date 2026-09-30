/**
 * End-to-end smoke test: boots the built API with a seeded demo estate, drives the built web app in
 * headless Chromium with the simulated probe, completes a hot sentinel task online, a second one with
 * the probe button only, and a cold sentinel task offline (queued, then synced); then imports a
 * TRIRIGA export through the UI and downloads the TRIRIGA exports. Checks everything through the API.
 *
 * Run `pnpm build` first. Screenshots land in $E2E_OUT (default: ./test-results).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.E2E_PORT ?? 3100);
const base = `http://localhost:${port}`;
const out = process.env.E2E_OUT ?? path.join(root, 'test-results');
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), 'ld-e2e-'));

const api = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', path.join(root, 'apps/api/dist/index.js')], {
  env: { ...process.env, PORT: String(port), DB_PATH: path.join(tmp, 'e2e.db'), WEB_DIST: path.join(root, 'apps/web/dist'), SEED_DEMO: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let apiLog = '';
api.stdout.on('data', (d) => (apiLog += d));
api.stderr.on('data', (d) => (apiLog += d));

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) throw new Error(`Check failed: ${name} ${detail}`);
}

async function waitForApi(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`API did not start:\n${apiLog}`);
}

async function json(url) {
  const r = await fetch(`${base}${url}`);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function pollUntil(fn, ms) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 300));
  }
  return last;
}

let browser;
try {
  await waitForApi(20_000);
  const sites = await json('/api/sites');
  check('demo estate seeded', sites.length === 2, `${sites.length} sites`);
  const hq = sites.find((s) => s.code === 'DEMO-HQ');

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Dashboard
  await page.goto(`${base}/`);
  await page.getByRole('heading', { name: 'Sites' }).waitFor();
  await page.getByText('Demo estate: head office').waitFor();
  await page.screenshot({ path: path.join(out, '01-dashboard.png') });
  check('dashboard renders demo sites', true);

  // Connect the simulated probe, sped up so the smoke test does not wait a real minute.
  await page.getByRole('link', { name: 'Probe', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('ld.simSpeed', '10'));
  await page.getByTestId('sim-scenario').selectOption('hot-pass');
  await page.getByTestId('use-simulator').click();
  await page.locator('.statusline').getByText(/Simulated probe \(hot-pass\): /).waitFor({ timeout: 10_000 });
  check('simulated probe streams into the status bar', true);

  // Open a hot sentinel task via client-side navigation so the probe stays connected.
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.getByRole('heading', { name: 'Tasks' }).waitFor();
  const hotTasks = await json(`/api/tasks?siteId=${hq.id}&status=open&templateCode=HWS-SENTINEL`);
  check('open hot sentinel tasks exist', hotTasks.length > 0, `${hotTasks.length}`);
  const hotLink = page.getByRole('link', { name: new RegExp(`Hot sentinel outlet temperature.*${hotTasks[0].assetName.replace(/[()]/g, '\\$&')}`) }).first();
  await hotLink.click();
  await page.getByRole('heading', { name: 'Hot sentinel outlet temperature' }).waitFor();
  await page.getByPlaceholder('Your name (kept on this device)').fill('Smoke test engineer');

  await page.getByRole('button', { name: 'Start run' }).click();
  await page.locator('.pill', { hasText: /target at \d+ s/ }).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: path.join(out, '02-task-run-live.png') });
  await page.getByText(/^Recorded /).waitFor({ timeout: 60_000 });
  check('probe run auto-recorded a reading', true);
  await page.getByRole('button', { name: 'Complete task' }).click();
  await page.locator('.pill', { hasText: 'completed' }).first().waitFor({ timeout: 10_000 });
  await page.screenshot({ path: path.join(out, '03-task-completed.png') });

  const hotDetail = await json(`/api/tasks/${hotTasks[0].id}`);
  check('task completed as pass through the API', hotDetail.task.status === 'completed' && hotDetail.task.outcome === 'pass', `${hotDetail.task.status}/${hotDetail.task.outcome}`);
  const r = hotDetail.readings[0];
  check('reading came from the probe with timing and trace', r?.source === 'simulator' && r.reachedTargetAtS !== null && r.reachedTargetAtS < 60 && (r.samples?.length ?? 0) > 10, `value ${r?.valueC} °C, target at ${r?.reachedTargetAtS} s, ${r?.samples?.length} samples`);
  check('engineer name stored', hotDetail.task.completedBy === 'Smoke test engineer');

  // Second hot sentinel, driven only by the probe's MEASURE/TRANSFER button (simulated).
  await page.getByRole('link', { name: 'Probe', exact: true }).click();
  await page.getByTestId('sim-scenario').selectOption('hot-pass');
  await page.getByTestId('use-simulator').click();
  await page.getByTestId('sim-button').click();
  await page.getByTestId('button-status').getByText(/1 press received/).waitFor({ timeout: 5000 });
  check('probe page registers a button press', true);
  await page.screenshot({ path: path.join(out, '05-probe-page.png'), fullPage: true });

  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  const hot2 = hotTasks[1];
  await page.getByRole('link', { name: new RegExp(`Hot sentinel outlet temperature.*${hot2.assetName.replace(/[()]/g, '\\$&')}`) }).first().click();
  await page.getByRole('heading', { name: 'Hot sentinel outlet temperature' }).waitFor();
  await page.getByTestId('button-hint').getByText('Press the probe button to start the run.').waitFor();
  await page.getByTestId('sim-probe-button').click();
  await page.getByRole('button', { name: 'Record now' }).waitFor({ timeout: 5000 });
  await page.locator('.pill', { hasText: /target at \d+ s/ }).waitFor({ timeout: 30_000 });
  await page.getByTestId('sim-probe-button').click();
  await page.getByText(/^Recorded /).waitFor({ timeout: 10_000 });
  check('button starts and records a run', true);
  await page.getByRole('button', { name: 'Complete task' }).click();
  await page.locator('.pill', { hasText: 'completed' }).first().waitFor({ timeout: 10_000 });
  const hot2Detail = await json(`/api/tasks/${hot2.id}`);
  check('button-driven run stored as a pass', hot2Detail.task.outcome === 'pass' && hot2Detail.readings[0]?.reachedTargetAtS < 60, `${hot2Detail.task.outcome}, target at ${hot2Detail.readings[0]?.reachedTargetAtS} s`);

  // Offline: a cold sentinel task recorded without a network, then synced.
  await page.getByRole('link', { name: 'Probe', exact: true }).click();
  await page.getByTestId('sim-scenario').selectOption('cold-pass');
  await page.getByTestId('use-simulator').click();
  await page.locator('.statusline').getByText(/Simulated probe \(cold-pass\): /).waitFor({ timeout: 10_000 });
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  const coldTasks = await json(`/api/tasks?siteId=${hq.id}&status=open&templateCode=CWS-SENTINEL`);
  check('open cold sentinel tasks exist', coldTasks.length > 0, `${coldTasks.length}`);
  await page.getByRole('link', { name: new RegExp(`Cold sentinel outlet temperature.*${coldTasks[0].assetName.replace(/[()]/g, '\\$&')}`) }).first().click();
  await page.getByRole('heading', { name: 'Cold sentinel outlet temperature' }).waitFor();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByText(/^Offline:/).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.getByText(/^Recorded /).waitFor({ timeout: 60_000 });
  await page.getByText(/queued for sync/).waitFor({ timeout: 5000 });
  check('offline reading queued locally', true);
  await page.getByRole('button', { name: 'Complete task' }).click();
  await page.getByText(/2 changes queued for sync/).waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(out, '04-offline-queued.png') });

  const beforeSync = await json(`/api/tasks/${coldTasks[0].id}`);
  check('server has nothing yet while offline', beforeSync.readings.length === 0 && beforeSync.task.status !== 'completed');

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const synced = await pollUntil(async () => {
    const d = await json(`/api/tasks/${coldTasks[0].id}`);
    return d.task.status === 'completed' ? d : null;
  }, 15_000);
  check('queue replayed after reconnect', Boolean(synced), synced ? `${synced.task.outcome}, ${synced.readings.length} reading` : 'not synced');
  check('cold reading passed the 20 °C / 2 minute rule', synced?.task.outcome === 'pass' && synced.readings[0]?.reachedTargetAtS < 120);

  // Dossier export contains both runs.
  const csv = await (await fetch(`${base}/api/sites/${hq.id}/export.csv`)).text();
  check('dossier CSV export includes the probe readings', csv.includes('Smoke test engineer') && csv.includes('simulator'));

  // TRIRIGA import through the UI, using the sample building equipment report (Excel, title rows above the header).
  await page.getByRole('link', { name: 'TRIRIGA', exact: true }).click();
  await page.getByRole('heading', { name: 'TRIRIGA import and export' }).waitFor();
  await page.getByTestId('import-file').setInputFiles(path.join(root, 'docs/tririga/samples/building-equipment-report.xlsx'));
  const summary = page.getByTestId('import-summary');
  await summary.getByText('new assets').waitFor({ timeout: 15_000 });
  const newAssets = Number(await summary.locator('.stat', { hasText: 'new assets' }).locator('b').textContent());
  const newSites = Number(await summary.locator('.stat', { hasText: 'new sites' }).locator('b').textContent());
  check('import preview reads the TRIRIGA export', newAssets === 19 && newSites === 2, `${newSites} sites, ${newAssets} assets`);
  await page.getByTestId('class-Wash Hand Basin').selectOption('skip');
  await summary.locator('.stat', { hasText: 'new assets' }).locator('b').getByText('18', { exact: true }).waitFor({ timeout: 10_000 });
  check('changing a classification re-plans the preview', true);
  await page.screenshot({ path: path.join(out, '06-tririga-preview.png'), fullPage: true });
  await page.getByTestId('import-commit').click();
  await page.getByTestId('import-result').waitFor({ timeout: 15_000 });

  const sitesAfter = await json('/api/sites');
  const house = sitesAfter.find((s) => s.code === 'DH-01');
  check('import created the TRIRIGA buildings as sites', Boolean(house) && sitesAfter.some((s) => s.code === 'DA-02') && house.externalRef === 'id:DH-01', `${sitesAfter.length} sites`);
  const houseDetail = await json(`/api/sites/${house.id}`);
  const cal = houseDetail.assets.find((a) => a.externalRef === 'id:DH-EQ-0001');
  check('assets carry TRIRIGA IDs, floor and space', cal?.type === 'calorifier' && cal.floor === 'Basement' && cal.space === 'B.01 Plant Room', cal ? `${cal.type} ${cal.floor}/${cal.space}` : 'missing');
  const houseTasks = await json(`/api/tasks?siteId=${house.id}&status=open`);
  check('import scheduled this period’s HSG274 tasks', houseTasks.some((t) => t.templateCode === 'HWS-SENTINEL') && houseTasks.some((t) => t.templateCode === 'CAL-FLOW-RETURN'), `${houseTasks.length} open tasks`);

  await page.getByTestId('import-result').getByRole('link', { name: 'Demo House' }).click();
  await page.getByRole('heading', { name: 'Demo House' }).waitFor();
  await page.screenshot({ path: path.join(out, '07-imported-site.png'), fullPage: true });

  const di = await (await fetch(`${base}/api/export/tririga/assets.txt?siteId=${house.id}`)).text();
  check('Data Integrator export uses TRIRIGA field names and IDs', di.startsWith('triIdTX\ttriNameTX') && di.includes('DH-EQ-0001\tCalorifier 1'));
  const xlsx = await fetch(`${base}/api/export/tririga/results.xlsx`);
  const bytes = new Uint8Array(await xlsx.arrayBuffer());
  check('PPM results export downloads as Excel', xlsx.ok && bytes[0] === 0x50 && bytes[1] === 0x4b);

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
  console.log(`\nAll ${checks.length} checks passed. Screenshots in ${out}`);
} catch (err) {
  console.error('\nSMOKE TEST FAILED:', err instanceof Error ? err.message : err);
  if (apiLog) console.error('--- api log ---\n' + apiLog.slice(-2000));
  process.exitCode = 1;
} finally {
  await browser?.close();
  api.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
}
