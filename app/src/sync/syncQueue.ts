import type { SyncChange, SyncOp } from '../api/syncClient';

export const SYNC_QUEUE_MAX = 500;
export const SYNC_MAX_ATTEMPTS = 10;

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 60_000];

export interface QueueItem {
  changeId: string;
  entity: 'sport_record';
  op: SyncOp;
  payload: SyncChange;
  attempts: number;
  nextAt: number;
  idempotencyKey: string;
}

// SyncQueue：容量受限、指数退避、成功/业务失败移除，网络失败保留。
export class SyncQueue {
  private items: QueueItem[] = [];

  constructor(private readonly max = SYNC_QUEUE_MAX) {}

  size(): number {
    return this.items.length;
  }

  snapshot(): QueueItem[] {
    return this.items.map((item) => ({ ...item }));
  }

  restore(items: QueueItem[]): void {
    this.items = items.slice(-this.max);
  }

  enqueue(change: SyncChange, now: number): { dropped: number } {
    const item: QueueItem = {
      changeId: change.changeId,
      entity: change.entity,
      op: change.op,
      payload: change,
      attempts: 0,
      nextAt: now,
      idempotencyKey: `sport_${change.changeId}`
    };
    const existing = this.items.findIndex((it) => it.changeId === change.changeId);
    if (existing >= 0) {
      this.items[existing] = item;
      return { dropped: 0 };
    }
    this.items.push(item);
    let dropped = 0;
    while (this.items.length > this.max) {
      this.items.shift();
      dropped += 1;
    }
    return { dropped };
  }

  due(now: number): QueueItem[] {
    return this.items.filter((item) => item.nextAt <= now);
  }

  succeed(changeIds: string[]): void {
    const done = new Set(changeIds);
    this.items = this.items.filter((item) => !done.has(item.changeId));
  }

  // 网络/5xx：保留并退避；达到上限后保持 pending，不静默丢弃。
  retry(changeIds: string[], now: number): void {
    const ids = new Set(changeIds);
    for (const item of this.items) {
      if (!ids.has(item.changeId)) {
        continue;
      }
      item.attempts += 1;
      const backoff = BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)] ?? 60_000;
      item.nextAt = now + backoff;
    }
  }

  // 业务 4xx：移出队列，避免无限重试。
  drop(changeIds: string[]): void {
    const ids = new Set(changeIds);
    this.items = this.items.filter((item) => !ids.has(item.changeId));
  }

  clear(): void {
    this.items = [];
  }
}