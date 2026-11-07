import { ApiError } from '../api/client';
import type { SyncChange, SyncClient } from '../api/syncClient';
import { SyncQueue, type QueueItem } from './syncQueue';

export const SYNC_BATCH_SIZE = 100;

export interface SyncEngineDeps {
  client: SyncClient;
  queue: SyncQueue;
  getToken: () => string | null;
  onUnauthorized: () => void;
  now?: () => number;
  intervalMs?: number;
}

// SyncEngine：登录态下推送队列；游客/未登录零请求。
export class SyncEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor = '';
  private syncing = false;

  constructor(private readonly deps: SyncEngineDeps) {}

  getCursor(): string {
    return this.cursor;
  }

  setCursor(cursor: string): void {
    this.cursor = cursor;
  }

  start(): void {
    this.stop();
    void this.flush();
    const interval = this.deps.intervalMs ?? 60_000;
    this.timer = setInterval(() => {
      void this.flush();
    }, interval);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.syncing = false;
  }

  enqueue(change: SyncChange): void {
    const now = this.deps.now?.() ?? Date.now();
    this.deps.queue.enqueue(change, now);
    void this.flush();
  }

  async flush(): Promise<void> {
    const token = this.deps.getToken();
    if (!token) {
      return;
    }
    if (this.syncing) {
      return;
    }
    const now = this.deps.now?.() ?? Date.now();
    const due = this.deps.queue.due(now).slice(0, SYNC_BATCH_SIZE);
    if (due.length === 0) {
      return;
    }
    this.syncing = true;
    try {
      const batchId = `batch_${now}_${due.length}`;
      const { data } = await this.deps.client.push(
        token,
        batchId,
        this.cursor,
        due.map((item) => item.payload)
      );
      this.cursor = data.cursor;
      this.applyResults(due, data.results, data.retryable, now);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.code === 'AUTH_004' || err.code === 'AUTH_002')) {
        this.stop();
        this.deps.onUnauthorized();
        return;
      }
      this.deps.queue.retry(
        due.map((item) => item.changeId),
        now
      );
    } finally {
      this.syncing = false;
    }
  }

  private applyResults(
    due: QueueItem[],
    results: { changeId: string; status: string }[],
    retryable: string[],
    now: number
  ): void {
    const byId = new Map(results.map((r) => [r.changeId, r.status]));
    const done: string[] = [];
    const retry: string[] = [];
    for (const item of due) {
      const status = byId.get(item.changeId);
      if (status === 'applied' || status === 'duplicate') {
        done.push(item.changeId);
      } else if (status === 'retryable' || retryable.includes(item.changeId)) {
        retry.push(item.changeId);
      } else {
        // conflict / rejected：业务失败，移出队列避免无限重试。
        done.push(item.changeId);
      }
    }
    this.deps.queue.succeed(done);
    if (retry.length > 0) {
      this.deps.queue.retry(retry, now);
    }
  }
}