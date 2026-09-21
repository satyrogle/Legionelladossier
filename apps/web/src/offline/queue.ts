import Dexie, { type EntityTable } from 'dexie';
import { api, type ReadingInput } from '../api/client.js';

/** Work recorded while offline, replayed in order once the API is reachable. */
export interface PendingOp {
  id?: number;
  createdAt: string;
  kind: 'reading' | 'complete' | 'skip';
  taskId: string;
  payload: unknown;
  attempts: number;
  lastError?: string;
}

class OfflineDb extends Dexie {
  pending!: EntityTable<PendingOp, 'id'>;
  constructor() {
    super('legionella-dossier');
    this.version(1).stores({ pending: '++id, taskId, createdAt' });
  }
}

export const offlineDb = new OfflineDb();

export async function enqueue(op: Omit<PendingOp, 'id' | 'createdAt' | 'attempts'>): Promise<number> {
  const id = await offlineDb.pending.add({ ...op, createdAt: new Date().toISOString(), attempts: 0 });
  return Number(id);
}

export async function pendingCount(): Promise<number> {
  return offlineDb.pending.count();
}

export async function pendingForTask(taskId: string): Promise<PendingOp[]> {
  return offlineDb.pending.where('taskId').equals(taskId).toArray();
}

/** Replay queued work. Stops at the first network failure so ordering is preserved. */
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const ops = await offlineDb.pending.orderBy('id').toArray();
  let sent = 0;
  for (const op of ops) {
    try {
      if (op.kind === 'reading') await api.addReading(op.taskId, op.payload as ReadingInput);
      else if (op.kind === 'complete') await api.completeTask(op.taskId, op.payload as { completedBy?: string; notes?: string; checklist?: Record<string, boolean> });
      else if (op.kind === 'skip') {
        const p = op.payload as { reason: string; completedBy?: string };
        await api.skipTask(op.taskId, p.reason, p.completedBy);
      }
      await offlineDb.pending.delete(op.id!);
      sent += 1;
    } catch (err) {
      const isNetwork = err instanceof TypeError; // fetch() failed to reach the server
      await offlineDb.pending.update(op.id!, { attempts: op.attempts + 1, lastError: err instanceof Error ? err.message : String(err) });
      if (isNetwork) break;
      // A validation / conflict error will never succeed on retry: drop it so the queue does not jam.
      await offlineDb.pending.delete(op.id!);
    }
  }
  return { sent, remaining: await offlineDb.pending.count() };
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}
