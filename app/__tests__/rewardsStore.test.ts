import { ApiError } from '../src/api/client';
import type { RewardsApi } from '../src/api/rewardsApi';
import { RewardsStore, newIdempotencyKey } from '../src/rewards/rewardsStore';

function makeApi(): jest.Mocked<RewardsApi> {
  return {
    status: jest.fn(),
    checkIn: jest.fn(),
    ledger: jest.fn(),
    frames: jest.fn(),
    redeem: jest.fn(),
    equip: jest.fn()
  } as unknown as jest.Mocked<RewardsApi>;
}

const statusData = {
  today: '2026-11-02', timezone: 'Asia/Shanghai', canCheckIn: true, checkedIn: false,
  streakDays: 1, todayReward: 10, nextReward: 12, pointsBalance: 0,
  lastCheckInDate: null, serverTime: '2026-11-02T01:00:00Z', traceId: 't1'
};

const catalogData = {
  catalogVersion: 'catalog-v1',
  frames: [
    { frameId: 'frame_pixel_cyan', name: '青岚光环', price: 0, assetUrl: '/assets/frames/frame_pixel_cyan.png', status: 'on_sale' as const, owned: false, equipped: false, purchasable: true },
    { frameId: 'frame_pixel_sakura', name: '樱瓣', price: 100, assetUrl: '/assets/frames/frame_pixel_sakura.png', status: 'on_sale' as const, owned: false, equipped: false, purchasable: true }
  ],
  traceId: 't1'
};

describe('RewardsStore', () => {
  it('幂等键满足长度与字符集', () => {
    for (let i = 0; i < 5; i++) {
      const key = newIdempotencyKey(Date.now());
      expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    }
  });

  it('无 token 时 reset 且不请求', async () => {
    const api = makeApi();
    const store = new RewardsStore({ api, getToken: () => null });
    await store.load();
    expect(api.status).not.toHaveBeenCalled();
    expect(store.getSnapshot().status).toBeNull();
  });

  it('加载状态与目录', async () => {
    const api = makeApi();
    api.status.mockResolvedValue({ data: statusData, traceId: 't1' });
    api.frames.mockResolvedValue({ data: catalogData, traceId: 't1' });
    const store = new RewardsStore({ api, getToken: () => 's1_token' });
    await store.load();
    expect(store.getSnapshot().status?.pointsBalance).toBe(0);
    expect(store.getSnapshot().catalog?.frames).toHaveLength(2);
  });

  it('并发签到只发一次请求且更新余额', async () => {
    const api = makeApi();
    api.status
      .mockResolvedValueOnce({ data: statusData, traceId: 't1' })
      .mockResolvedValue({ data: { ...statusData, checkedIn: true, canCheckIn: false, pointsBalance: 10 }, traceId: 't1' });
    api.frames.mockResolvedValue({ data: catalogData, traceId: 't1' });
    const store = new RewardsStore({ api, getToken: () => 's1_token' });
    await store.load();
    api.checkIn.mockResolvedValue({
      data: {
        checkedIn: true, alreadyCheckedIn: false, checkInDate: '2026-11-02', streakDays: 1,
        earnedPoints: 10, balanceAfter: 10, balanceCapped: false, nextReward: 12,
        ruleVersion: 'checkin-v1', traceId: 't2'
      },
      traceId: 't2'
    });
    await Promise.all([store.checkIn(), store.checkIn(), store.checkIn()]);
    expect(api.checkIn).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().status?.pointsBalance).toBe(10);
    expect(store.getSnapshot().notice).toContain('签到成功');
  });

  it('重复点击在请求进行中不再发起', async () => {
    const api = makeApi();
    api.status.mockResolvedValue({ data: statusData, traceId: 't1' });
    api.frames.mockResolvedValue({ data: catalogData, traceId: 't1' });
    const store = new RewardsStore({ api, getToken: () => 's1_token' });
    await store.load();
    let resolve!: (v: any) => void;
    api.checkIn.mockReturnValue(new Promise((r) => { resolve = r; }));
    const first = store.checkIn();
    const second = store.checkIn();
    expect(api.checkIn).toHaveBeenCalledTimes(1);
    resolve({ data: { checkedIn: true, alreadyCheckedIn: true, checkInDate: '2026-11-02', streakDays: 1, earnedPoints: 0, balanceAfter: 0, balanceCapped: false, nextReward: 12, ruleVersion: 'checkin-v1', traceId: 't3' }, traceId: 't3' });
    await Promise.all([first, second]);
    expect(store.getSnapshot().notice).toBe('今日已签到');
  });

  it('余额不足映射 POINT_002 文案', async () => {
    const api = makeApi();
    api.status.mockResolvedValue({ data: statusData, traceId: 't1' });
    api.frames.mockResolvedValue({ data: catalogData, traceId: 't1' });
    api.redeem.mockRejectedValue(new ApiError(409, 'POINT_002', 't4'));
    const store = new RewardsStore({ api, getToken: () => 's1_token' });
    await store.load();
    await store.redeem('frame_pixel_sakura');
    expect(store.getSnapshot().errorCode).toBe('POINT_002');
    expect(store.getSnapshot().errorMessage).toBe('积分不足，无法兑换');
  });

  it('已拥有时不再发起兑换', async () => {
    const api = makeApi();
    api.status.mockResolvedValue({ data: statusData, traceId: 't1' });
    api.frames.mockResolvedValue({
      data: { ...catalogData, frames: [{ ...catalogData.frames[0]!, owned: true, purchasable: false }] },
      traceId: 't1'
    });
    const store = new RewardsStore({ api, getToken: () => 's1_token' });
    await store.load();
    await store.redeem('frame_pixel_cyan');
    expect(api.redeem).not.toHaveBeenCalled();
    expect(store.getSnapshot().errorMessage).toContain('已拥有');
  });
});