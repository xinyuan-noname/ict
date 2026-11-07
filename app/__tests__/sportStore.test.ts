import type { AchievementStateView, SportApi } from '../src/api/sportApi';
import { SportStore } from '../src/sport/sportStore';

function achievement(id: string, status: AchievementStateView['status'] = 'locked'): AchievementStateView {
  return {
    achievementId: id,
    ruleVersion: 'sport-v1',
    status,
    progress: status === 'locked' ? 0 : 1,
    need: 1,
    points: 10,
    grantedPoints: status === 'granted' ? 10 : 0,
    capped: false,
    evidenceDays: [],
    updatedAt: '2026-11-07T00:00:00Z'
  };
}

function makeApi(): jest.Mocked<SportApi> {
  return {
    addRecord: jest.fn(),
    deleteRecord: jest.fn(),
    achievements: jest.fn()
  } as unknown as jest.Mocked<SportApi>;
}

describe('SportStore 双源与四态', () => {
  test('登录加载以服务端快照为权威', async () => {
    const api = makeApi();
    api.achievements.mockResolvedValue({
      data: {
        achievements: [achievement('walk_10k', 'granted')],
        unlockedCount: 1,
        totalCount: 1,
        totalGrantedPoints: 10,
        pointsBalance: 120,
        ruleVersion: 'sport-v1',
        serverTime: '2026-11-07T00:00:00Z',
        traceId: 't1'
      },
      traceId: 't1'
    });
    const store = new SportStore({ api, getToken: () => 'token' });

    await store.loadRemote();

    expect(api.achievements).toHaveBeenCalledWith('token');
    expect(store.getSnapshot().pointsBalance).toBe(120);
    expect(store.getSnapshot().balanceSource).toBe('server');
    expect(store.getSnapshot().isGuest).toBe(false);
  });

  test('游客不发起网络请求，明确标注本地来源', async () => {
    const api = makeApi();
    const store = new SportStore({ api, getToken: () => null });

    await store.loadRemote();
    store.applyLocal([achievement('walk_10k', 'unlocked')]);

    expect(api.achievements).not.toHaveBeenCalled();
    expect(store.getSnapshot().balanceSource).toBe('local');
    expect(store.getSnapshot().isGuest).toBe(true);
    expect(store.getSnapshot().pointsBalance).toBeNull();
  });

  test('新增记录使用 recordId 派生幂等键并展示 +N', async () => {
    const api = makeApi();
    api.addRecord.mockResolvedValue({
      data: {
        record: {
          recordId: 'sp_1', type: 'walking', day: '2026-11-07', distanceM: 5000,
          durationS: 1800, steps: 15000, continuous: true, createdAt: '2026-11-07T00:00:00Z'
        },
        unlocked: [achievement('walk_10k', 'granted')],
        earnedPoints: 10,
        pointsBalance: 10,
        balanceCapped: false,
        ruleVersion: 'sport-v1',
        replayed: false,
        traceId: 't2'
      },
      traceId: 't2'
    });
    const store = new SportStore({ api, getToken: () => 'token' });

    const result = await store.addRecord({
      recordId: 'sp_1', type: 'walking', day: '2026-11-07',
      distanceM: 5000, durationS: 1800, steps: 15000, continuous: true
    });

    expect(api.addRecord).toHaveBeenCalledWith('token', expect.objectContaining({ recordId: 'sp_1' }), 'sport_sp_1');
    expect(result.earnedPoints).toBe(10);
    expect(store.getSnapshot().pointsBalance).toBe(10);
    expect(store.getSnapshot().notice).toContain('+10');
  });

  test('删除记录更新状态但余额不变', async () => {
    const api = makeApi();
    api.deleteRecord.mockResolvedValue({
      data: {
        deleted: true,
        achievements: [achievement('walk_10k', 'locked')],
        pointsBalance: 10,
        traceId: 't3'
      },
      traceId: 't3'
    });
    const store = new SportStore({ api, getToken: () => 'token' });

    const balance = await store.removeRecord('sp_1');

    expect(balance).toBe(10);
    expect(store.getSnapshot().unlockedCount).toBe(0);
    expect(store.getSnapshot().pointsBalance).toBe(10);
  });
});