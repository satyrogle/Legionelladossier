export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  client TEXT,
  address TEXT,
  healthcare INTEGER NOT NULL DEFAULT 0,
  responsible_person TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  tag TEXT,
  sentinel INTEGER NOT NULL DEFAULT 0,
  little_used INTEGER NOT NULL DEFAULT 0,
  loop_rank TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_site ON assets(site_id);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL,
  frequency TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(asset_id, template_code)
);
CREATE INDEX IF NOT EXISTS schedules_site ON schedules(site_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'due',
  outcome TEXT,
  completed_at TEXT,
  completed_by TEXT,
  notes TEXT,
  checklist TEXT,
  UNIQUE(schedule_id, period_start)
);
CREATE INDEX IF NOT EXISTS tasks_site_due ON tasks(site_id, due_date);
CREATE INDEX IF NOT EXISTS tasks_asset ON tasks(asset_id);

CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  value_c REAL NOT NULL,
  min_c REAL,
  max_c REAL,
  timed INTEGER NOT NULL DEFAULT 0,
  reached_target_at_s REAL,
  duration_s REAL,
  stable INTEGER,
  source TEXT NOT NULL,
  device_name TEXT,
  device_model TEXT,
  driver_id TEXT,
  samples TEXT,
  taken_at TEXT NOT NULL,
  taken_by TEXT
);
CREATE INDEX IF NOT EXISTS readings_task ON readings(task_id);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  model TEXT,
  serial TEXT,
  calibration_due TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL
);
`;
