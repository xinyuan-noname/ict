import type { ApiClient } from './client';

export interface CheckInStatus {
  today: string;
  timezone: string;
  canCheckIn: boolean;
  checkedIn: boolean;
  streakDays: number;
  todayReward: number;
  nextReward: number;
  pointsBalance: number;
  lastCheckInDate: string | null;
  serverTime: string;
  traceId: string;
}

export interface CheckInResult {
  checkedIn: boolean;
  alreadyCheckedIn: boolean;
  checkInDate: string;
  streakDays: number;
  earnedPoints: number;
  balanceAfter: number;
  balanceCapped: boolean;
  nextReward: number;
  ruleVersion: string;
  traceId: string;
}

export interface LedgerItem {
  entryId: string;
  type: 'checkin_earn' | 'reward_spend';
  amount: number;
  balanceAfter: number;
  occurredAt: string;
  refId?: string;
  frameId?: string;
  ruleVersion: string;
}

export interface LedgerPage {
  items: LedgerItem[];
  nextCursor: string | null;
  hasMore: boolean;
  traceId: string;
}

export interface FrameItem {
  frameId: string;
  name: string;
  description?: string;
  price: number;
  assetUrl: string;
  status: 'on_sale' | 'off_shelf';
  owned: boolean;
  equipped: boolean;
  purchasable: boolean;
}

export interface FrameCatalog {
  catalogVersion: string;
  frames: FrameItem[];
  traceId: string;
}

export interface RedeemResult {
  orderId: string;
  frameId: string;
  price: number;
  balanceAfter: number;
  redeemedAt: string;
  replayed: boolean;
  owned: boolean;
  equipped: boolean;
  traceId: string;
}

export interface EquipResult {
  equippedFrame: { frameId: string; name: string; assetUrl: string } | null;
  changed: boolean;
  traceId: string;
}

export class RewardsApi {
  constructor(private readonly client: ApiClient) {}

  status(token: string): Promise<{ data: CheckInStatus; traceId: string }> {
    return this.client.request<CheckInStatus>('/v1/rewards/checkin/status', { token });
  }

  checkIn(token: string): Promise<{ data: CheckInResult; traceId: string }> {
    return this.client.request<CheckInResult>('/v1/rewards/checkin', { method: 'POST', token, body: {} });
  }

  ledger(token: string, cursor?: string, limit = 20): Promise<{ data: LedgerPage; traceId: string }> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      query.set('cursor', cursor);
    }
    return this.client.request<LedgerPage>(`/v1/rewards/points/ledger?${query.toString()}`, { token });
  }

  frames(token: string, status: 'on_sale' | 'all' = 'on_sale'): Promise<{ data: FrameCatalog; traceId: string }> {
    return this.client.request<FrameCatalog>(`/v1/rewards/frames?status=${status}`, { token });
  }

  redeem(token: string, frameId: string, catalogVersion: string, idempotencyKey: string): Promise<{ data: RedeemResult; traceId: string }> {
    return this.client.request<RedeemResult>(`/v1/rewards/frames/${encodeURIComponent(frameId)}/redeem`, {
      method: 'POST',
      token,
      body: { catalogVersion },
      idempotencyKey
    });
  }

  equip(token: string, frameId: string | null): Promise<{ data: EquipResult; traceId: string }> {
    return this.client.request<EquipResult>('/v1/rewards/avatar-frame', { method: 'PUT', token, body: { frameId } });
  }
}