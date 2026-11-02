import type { ApiClient } from './client';
import type { HealthProfile } from '../model/waterGoal';

export interface CheckProfileResponse {
  profile: {
    userId: string;
    heightCm: number;
    weightG: number;
    age: number;
    gender: string;
    updatedAt: string;
    effectiveDay: string;
  };
  targetMl: number;
  complete: boolean;
  traceId: string;
}

export interface WaterRecordView {
  recordId: string;
  day: string;
  ml: number;
  createdAt: string;
}

export interface TodayResponse {
  day: string;
  targetMl: number;
  totalMl: number;
  achieved: boolean;
  cupMl: number;
  cups: number;
  streak: number;
  records: WaterRecordView[];
  traceId: string;
}

export interface WeekResponse {
  weekStart: string;
  days: { day: string; totalMl: number; targetMl: number; achieved: boolean; recordCount: number }[];
  averageMl: number | null;
  totalMl: number;
  achievedDays: number;
  elapsedDays: number;
  achievementRate: number;
  targetMl: number;
  traceId: string;
}

export class CheckApi {
  constructor(private readonly client: ApiClient) {}

  profile(token: string): Promise<{ data: CheckProfileResponse; traceId: string }> {
    return this.client.request('/v1/check/profile', { token });
  }

  putProfile(token: string, p: HealthProfile): Promise<{ data: CheckProfileResponse; traceId: string }> {
    return this.client.request('/v1/check/profile', { method: 'PUT', token, body: p });
  }

  today(token: string): Promise<{ data: TodayResponse; traceId: string }> {
    return this.client.request('/v1/check/today', { token });
  }

  addRecord(token: string, ml: number, idemKey: string): Promise<{ data: TodayResponse; traceId: string }> {
    return this.client.request('/v1/check/water/records', { method: 'POST', token, body: { ml }, idempotencyKey: idemKey });
  }

  deleteRecord(token: string, recordId: string): Promise<{ data: TodayResponse; traceId: string }> {
    return this.client.request(`/v1/check/water/records/${encodeURIComponent(recordId)}`, { method: 'DELETE', token });
  }

  week(token: string, weekStart?: string): Promise<{ data: WeekResponse; traceId: string }> {
    const query = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : '';
    return this.client.request(`/v1/check/water/week${query}`, { token });
  }

  preview(p: HealthProfile): Promise<{ data: { targetMl: number }; traceId: string }> {
    const q = `heightCm=${p.heightCm}&weightG=${p.weightG}&age=${p.age}&gender=${p.gender}`;
    return this.client.request(`/v1/check/goal/preview?${q}`);
  }
}