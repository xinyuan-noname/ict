import type { ApiClient } from './client';

export type SportType = 'walking' | 'cycling' | 'running';

export interface SportRecordView {
  recordId: string;
  type: SportType;
  day: string;
  distanceM: number;
  durationS: number;
  steps: number;
  continuous: boolean;
  createdAt: string;
}

export type AchievementStatus = 'locked' | 'unlocked' | 'granting' | 'granted';

export interface AchievementStateView {
  achievementId: string;
  ruleVersion: string;
  status: AchievementStatus;
  progress: number;
  need: number;
  points: number;
  grantedPoints: number;
  capped: boolean;
  evidenceDays: string[];
  unlockedAt?: string;
  updatedAt: string;
}

export interface AddRecordRequest {
  recordId: string;
  type: SportType;
  day: string;
  distanceM: number;
  durationS: number;
  steps: number;
  continuous: boolean;
  clientSeq?: number;
}

export interface AddRecordResult {
  record: SportRecordView;
  unlocked: AchievementStateView[];
  earnedPoints: number;
  pointsBalance: number;
  balanceCapped: boolean;
  ruleVersion: string;
  replayed: boolean;
  traceId: string;
}

export interface AchievementSnapshot {
  achievements: AchievementStateView[];
  unlockedCount: number;
  totalCount: number;
  totalGrantedPoints: number;
  pointsBalance: number;
  ruleVersion: string;
  serverTime: string;
  traceId: string;
}

export interface DeleteRecordResult {
  deleted: boolean;
  achievements: AchievementStateView[];
  pointsBalance: number;
  traceId: string;
}

export class SportApi {
  constructor(private readonly client: ApiClient) {}

  addRecord(token: string, body: AddRecordRequest, idempotencyKey: string): Promise<{ data: AddRecordResult; traceId: string }> {
    return this.client.request<AddRecordResult>('/v1/sport/records', {
      method: 'POST',
      token,
      body,
      idempotencyKey
    });
  }

  deleteRecord(token: string, recordId: string): Promise<{ data: DeleteRecordResult; traceId: string }> {
    return this.client.request<DeleteRecordResult>(`/v1/sport/records/${encodeURIComponent(recordId)}`, {
      method: 'DELETE',
      token
    });
  }

  achievements(token: string): Promise<{ data: AchievementSnapshot; traceId: string }> {
    return this.client.request<AchievementSnapshot>('/v1/sport/achievements', { token });
  }
}