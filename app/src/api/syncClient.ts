import type { ApiClient } from './client';
import type { AchievementStateView, SportRecordView } from './sportApi';
import type { LedgerItem } from './rewardsApi';

export interface SyncCursor {
  cursor: string;
  serverTime: string;
  scopeVersion: string;
  traceId: string;
}

export interface SyncSnapshot {
  cursor: string;
  hasMore: boolean;
  sportRecords: SportRecordView[];
  tombstones: { entity: 'sport_record'; recordId: string; deletedAt: string; seq: number }[];
  achievements: AchievementStateView[];
  points: { balance: number; entries: LedgerItem[] };
  traceId: string;
}

export type SyncOp = 'upsert' | 'delete';

export interface SyncChange {
  changeId: string;
  entity: 'sport_record';
  op: SyncOp;
  record?: {
    recordId: string;
    type: 'walking' | 'cycling' | 'running';
    day: string;
    distanceM: number;
    durationS: number;
    steps: number;
    continuous: boolean;
    clientSeq?: number;
  };
  recordId?: string;
  deletedAt?: string;
}

export interface SyncPushResult {
  batchId: string;
  results: { changeId: string; status: string; code?: string; recordId?: string }[];
  retryable: string[];
  cursor: string;
  hasMore: boolean;
  traceId: string;
}

export interface ReconcileResult {
  consistent: boolean;
  diffs: {
    kind: 'missing_remote' | 'extra_remote' | 'balance_mismatch' | 'achievement_mismatch';
    businessKey?: string;
    local?: unknown;
    server?: unknown;
    action: 'overwrite_local' | 'pull_again';
  }[];
  cursor: string;
  traceId: string;
}

export class SyncClient {
  constructor(private readonly client: ApiClient) {}

  cursor(token: string): Promise<{ data: SyncCursor; traceId: string }> {
    return this.client.request<SyncCursor>('/v1/sync/cursor', { token });
  }

  snapshot(token: string, cursor?: string, limit = 200): Promise<{ data: SyncSnapshot; traceId: string }> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      query.set('cursor', cursor);
    }
    return this.client.request<SyncSnapshot>(`/v1/sync/snapshot?${query.toString()}`, { token });
  }

  push(token: string, batchId: string, baseCursor: string, changes: SyncChange[]): Promise<{ data: SyncPushResult; traceId: string }> {
    return this.client.request<SyncPushResult>('/v1/sync/push', {
      method: 'POST',
      token,
      body: { batchId, baseCursor, changes },
      idempotencyKey: batchId
    });
  }

  reconcile(
    token: string,
    local: {
      sportRecordCount: number;
      sportRecordIds: string[];
      cachedBalance: number | null;
      cachedUnlockedCount: number;
    }
  ): Promise<{ data: ReconcileResult; traceId: string }> {
    return this.client.request<ReconcileResult>('/v1/sync/reconcile', {
      method: 'POST',
      token,
      body: { local }
    });
  }
}