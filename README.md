# Legionella Dossier (in-house)

An in-house replacement for the hosted Legionella Dossier service: the water-hygiene planned tasks
(PPMs) that HSG274 Part 2 asks for, scheduled per asset, and completed in the field with the
temperature fed straight from the engineer's Bluetooth thermometer.

The field app runs in the browser on the engineer's Android phone or Windows laptop, pairs with the
probe over Web Bluetooth, times the outlet run, calls pass or fail against the HSG274 limit, and
stores the trace in the dossier. It keeps working offline and syncs when the signal returns.

## What it does

- **Asset register per site**: calorifiers, tanks, sentinel and other outlets, TMV outlets, showers,
  POU and combination heaters, return loops, little-used outlets, expansion vessels.
- **Automatic PPM scheduling** from the HSG274 Part 2 Table 2.1 catalogue. Adding a sentinel hot tap
  schedules its monthly temperature check; a calorifier gets monthly flow/return plus the annual
  internal inspection, and so on. The risk assessment can override any frequency per schedule.
- **Probe-fed task runner**: the live reading drives the task. For a hot sentinel the app starts a
  one-minute clock, marks the second the water reaches 50 °C (55 °C on healthcare sites), records
  the temperature at the limit plus min / max and the full trace, and auto-records once the reading
  has settled. Cold outlets get the two-minute, below-20 °C rule. Flow / return and tank checks wait
  for a stable reading.
- **Compliance dashboard and report** (on-time percentage, overdue, failed, by task type) and a
  **dossier CSV export** with every reading, device and engineer.
- **Offline first**: readings, completions and skips queue in the browser and replay in order.
- **Manual entry fallback** for outlets the probe cannot reach, clearly labelled as manual.

## Supported thermometers

| Driver | Devices | Protocol |
| --- | --- | --- |
| ETI BlueTherm family | ThermaQ Blue, BlueTherm One LE, BlueTherm Probe, Thermapen Blue, TempTest Blue, ThermoWorks BlueDOT | ETI "ETIBLUETHERM" GATT service `45544942-4c55-4554-4845-524db87ad700`; channel 1 notifies a little-endian float32 °C |
| Standard Health Thermometer | Any device implementing Bluetooth SIG service 0x1809 | Temperature Measurement 0x2A1C / Intermediate 0x2A1E, IEEE 11073 FLOAT |
| Standard Environmental Sensing | Any device implementing service 0x181A | Temperature 0x2A6E, int16 in 0.01 °C |
| Simulator | Built in | Realistic warm-up / cool-down curves for training and tests |

The ETI protocol constants come from an open-source implementation (Beanconqueror's ETI driver) and
match the ETI BLE family that the hosted Legionella Dossier app pairs with. It has not yet been
exercised against a physical ETI probe from this codebase: the first job on site is to pair one on the
Probe page and confirm readings stream. Adding another instrument is one driver object in
`packages/core/src/ble/drivers.ts`.

Browser support: Chrome or Edge on Android, Windows, macOS and ChromeOS, over HTTPS (or
localhost). Safari on iOS has no Web Bluetooth; the Bluefy browser works there.

## Repository layout

```
packages/core   Domain model, HSG274 catalogue, scheduler, compliance rules, BLE parsers, capture logic (pure TS, unit tested)
apps/api        Fastify REST API on SQLite (node:sqlite, no native build), demo seed, serves the built web app
apps/web        React PWA: Web Bluetooth runtime, simulator, task runner, offline queue
scripts         End-to-end smoke test (Playwright against the seeded API)
```

Data flow: probe → `WebBluetoothProbe` (GATT notifications) → `TemperatureCapture` (timing, target,
stability) → `POST /api/tasks/:id/readings` → `evaluateTask` (HSG274 rules) → task outcome → dossier.

## HSG274 Part 2 mapping

| Code | Task | Default frequency | Rule |
| --- | --- | --- | --- |
| CAL-INSPECT | Calorifier internal inspection and clean | Annually | Checklist |
| CAL-FLOW-RETURN | Calorifier flow and return temperatures | Monthly | Flow ≥ 60 °C, return ≥ 50 °C (55 °C healthcare) |
| HWS-SENTINEL | Hot sentinel outlet temperature | Monthly | ≥ 50 °C within 1 minute (55 °C healthcare) |
| HWS-PRINCIPAL-LOOP | Principal return loop temperature | Monthly | ≥ 50 °C (55 °C healthcare) |
| HWS-SUBORDINATE-LOOP | Subordinate return loop temperature | Quarterly | ≥ 50 °C (55 °C healthcare) |
| HWS-PROFILE | Hot water temperature profile (representative outlets) | Annually | ≥ 50 °C within 1 minute |
| CWS-TANK-INSPECT | Cold water storage tank inspection | Annually | Checklist |
| CWS-TANK-TEMP | Tank and incoming mains temperatures | Annually | Tank ≤ 20 °C; mains ≤ 20 °C advisory |
| CWS-SENTINEL | Cold sentinel outlet temperature | Monthly | ≤ 20 °C within 2 minutes |
| CWS-PROFILE | Cold water temperature profile (representative outlets) | Annually | ≤ 20 °C within 2 minutes |
| SHOWER-CLEAN | Shower and spray tap clean and descale | Quarterly | Checklist |
| POU-TEMP | Point-of-use water heater temperature | Monthly (RA: up to six-monthly) | 50–60 °C |
| COMBI-OUTLET-TEMP | Combination water heater outlet temperature | Monthly | 55–60 °C |
| COMBI-HEADER-INSPECT | Combination heater header tank inspection | Annually | Checklist |
| FLUSH-LITTLE-USED | Flush little-used outlet | Weekly | Flush timer |
| TMV-SERVICE | Thermostatic mixing valve service | Annually | Checklist; blended ≤ 44 °C advisory |
| EXP-VESSEL-FLUSH | Expansion vessel flush | Six-monthly (RA: monthly to six-monthly) | Flush |

Legionella sample action levels (Table 2.2) are implemented in `assessLegionellaSample`.

Check the catalogue against the current HSG274 Part 2 text and the site's written scheme before
relying on it; the wording here is paraphrased and the frequencies are the guidance defaults, which the
risk assessment may tighten.

## Running it

Requires Node 22.13 or later and pnpm 10.

```bash
pnpm install
pnpm build          # core, api, web
pnpm start          # API + web app on http://localhost:3000 with a seeded demo estate
```

Development, with hot reload (API on 3000, web on 5173 proxying `/api`):

```bash
pnpm dev
```

Tests and the smoke test:

```bash
pnpm test                       # unit + API tests
node scripts/e2e-smoke.mjs      # builds nothing; expects `pnpm build` first
```

Environment variables for the API: `PORT` (3000), `HOST` (0.0.0.0), `DB_PATH` (`apps/api/data/dossier.db`),
`WEB_DIST` (built web app to serve), `SEED_DEMO` (`false` to start empty). The web app reads
`VITE_API_BASE` at build time when the API lives on another origin.

Web Bluetooth needs a secure context, so put the server behind HTTPS (a reverse proxy with a
certificate is enough) before handing phones to engineers.

## Field workflow

1. Probe page: connect the ETI probe once per shift (Chrome remembers it). Watch the live reading.
2. Site page: generate this period's tasks (or let the scheduled job do it).
3. Tasks page: open the outlet's task. Put the probe under the stream, press Start run, turn the tap on.
4. The card shows the clock, the moment the target was reached, and pass / fail. It auto-records
   when the reading settles; press Record now to stop early.
5. Complete the task. Failures are recorded as failures; notes go in the dossier.

## Not built yet

Users and sign-in, PostgreSQL, the written scheme / risk assessment module, photos on tasks, PDF
reports, sample results entry, and a native wrapper for iOS. The API is small enough that these bolt
onto the existing tables.
