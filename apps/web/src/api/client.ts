import type { Asset, ComplianceSummary, Evaluation, Frequency, PpmSchedule, PpmTemplate, Reading, Site, Task, TaskStatus } from '@ld/core';

export interface SiteRow extends Site {
  assetCount: number;
  summary: ComplianceSummary;
}

export interface TaskView extends Task {
  assetName: string;
  assetType: Asset['type'];
  assetTag?: string;
  assetLocation?: string;
  siteName: string;
  templateTitle: string;
  readingCount: number;
  checklist?: Record<string, boolean>;
}

export interface TaskDetail {
  task: TaskView;
  template: PpmTemplate;
  site: Site;
  asset: Asset;
  readings: Reading[];
  evaluation: Evaluation;
}

export interface ScheduleRow extends PpmSchedule {
  assetName: string;
  templateTitle: string;
  defaultFrequency?: Frequency;
}

export interface DeviceRecord {
  id: string;
  name: string;
  driverId: string;
  model?: string;
  serial?: string;
  calibrationDue?: string;
  lastSeenAt?: string;
  createdAt: string;
}

export interface DriverInfo {
  id: string;
  name: string;
  vendor: string;
  models: string[];
  notes: string;
}

export interface ComplianceReport {
  site: Site;
  today: string;
  summary: ComplianceSummary;
  byTemplate: { code: string; title: string; summary: ComplianceSummary }[];
  overdue: TaskView[];
  failed: TaskView[];
}

export type ReadingInput = Omit<Reading, 'id' | 'taskId' | 'assetId' | 'takenAt'> & { takenAt?: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: unknown,
  ) {
    super(message);
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data?.issues);
  return data as T;
}

const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const api = {
  health: () => request<{ ok: boolean; today: string }>('GET', '/api/health'),
  templates: () => request<PpmTemplate[]>('GET', '/api/templates'),
  drivers: () => request<DriverInfo[]>('GET', '/api/drivers'),

  sites: () => request<SiteRow[]>('GET', '/api/sites'),
  site: (id: string) => request<{ site: Site; assets: Asset[]; summary: ComplianceSummary; openTasks: number }>('GET', `/api/sites/${id}`),
  createSite: (input: Partial<Site> & { name: string }) => request<Site>('POST', '/api/sites', input),
  updateSite: (id: string, patch: Partial<Site>) => request<Site>('PATCH', `/api/sites/${id}`, patch),

  createAsset: (siteId: string, input: Partial<Asset> & { type: Asset['type']; name: string }) =>
    request<{ asset: Asset; schedules: PpmSchedule[] }>('POST', `/api/sites/${siteId}/assets`, input),
  updateAsset: (id: string, patch: Partial<Asset> & { autoSchedule?: boolean }) => request<Asset>('PATCH', `/api/assets/${id}`, patch),
  deleteAsset: (id: string) => request<void>('DELETE', `/api/assets/${id}`),

  schedules: (siteId: string) => request<ScheduleRow[]>('GET', `/api/sites/${siteId}/schedules`),
  updateSchedule: (id: string, patch: { frequency?: Frequency; active?: boolean }) => request<PpmSchedule>('PATCH', `/api/schedules/${id}`, patch),

  generateTasks: (siteId: string, range?: { from?: string; to?: string }) =>
    request<{ created: number; from: string; to: string }>('POST', `/api/sites/${siteId}/tasks/generate`, range ?? {}),
  tasks: (filter: { siteId?: string; assetId?: string; status?: TaskStatus | 'open'; from?: string; to?: string; templateCode?: string }) =>
    request<TaskView[]>('GET', `/api/tasks${q(filter)}`),
  task: (id: string) => request<TaskDetail>('GET', `/api/tasks/${id}`),
  addReading: (taskId: string, reading: ReadingInput) => request<{ reading: Reading; evaluation: Evaluation }>('POST', `/api/tasks/${taskId}/readings`, reading),
  deleteReading: (id: string) => request<void>('DELETE', `/api/readings/${id}`),
  completeTask: (taskId: string, body: { completedBy?: string; notes?: string; checklist?: Record<string, boolean>; completedAt?: string }) =>
    request<TaskDetail>('POST', `/api/tasks/${taskId}/complete`, body),
  skipTask: (taskId: string, reason: string, completedBy?: string) => request<TaskView>('POST', `/api/tasks/${taskId}/skip`, { reason, completedBy }),
  reopenTask: (taskId: string) => request<TaskView>('POST', `/api/tasks/${taskId}/reopen`),

  devices: () => request<DeviceRecord[]>('GET', '/api/devices'),
  saveDevice: (id: string, input: Omit<DeviceRecord, 'id' | 'createdAt'>) => request<DeviceRecord>('PUT', `/api/devices/${id}`, input),
  deleteDevice: (id: string) => request<void>('DELETE', `/api/devices/${id}`),

  compliance: (siteId: string) => request<ComplianceReport>('GET', `/api/sites/${siteId}/compliance`),
  exportUrl: (siteId: string) => `${BASE}/api/sites/${siteId}/export.csv`,
};
