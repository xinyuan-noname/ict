import { ApiError } from '../src/api/client';
import type { SyncClient } from '../src/api/syncClient';
import { SyncEngine } from '../src/sync/syncEngine';
import { SyncQueue } from '../src/sync/syncQueue';

function change(id: string) {
  return {
    changeId: id,
    entity: 'sport_record' as const,
    op: 'upsert' as const,
    record: {
      recordId: id, type: 'walking' as const, day: '2026-11-07',
      distanceM: 1000, durationS: 600, steps: 1000, continuous: true
    }
  };
}

function makeClient(): jest.Mocked<SyncClient> {
  return {
    push: jest.fn(),
    snapshot: jest.fn(),
    cursor: jest.fn(),
    reconcile: jest.fn()
  } as unknown as jest.Mocked<SyncClient>;
}

describe('SyncEngine 触发与错误处理', () => {
  test('游客（无 token）不发起任何同步请求', async () => {
    const client = makeClient();
    const engine = new SyncEngine({
      client: client as never,
      queue: new SyncQueue(10),
      getToken: () => null,
      onUnauthorized: jest.fn()
    });
    engine.enqueue(change('c1'));
    await engine.flush();
    expect(client.push).not.toHaveBeenCalled();
  });

  test('applied 后移出队列并推进游标', async () => {
    const client = makeClient();
    client.push.mockResolvedValue({
      data: { batchId: 'b', results: [{ changeId: 'c1', status: 'applied' }], retryable: [], cursor: 'v1:5', hasMore: false, traceId: 't' },
      traceId: 't'
    });
    const queue = new SyncQueue(10);
    const engine = new SyncEngine({ client: client as never, queue, getToken: () => 'token', onUnauthorized: jest.fn() });

    engine.enqueue(change('c1'));
    await engine.flush();

    expect(queue.size()).toBe(0);
    expect(engine.getCursor()).toBe('v1:5');
  });

  test('401 停止同步并回调重新登录', async () => {
    const client = makeClient();
    client.push.mockRejectedValue(new ApiError(401, 'AUTH_004', 't'));
    const onUnauthorized = jest.fn();
    const queue = new SyncQueue(10);
    const engine = new SyncEngine({ client: client as never, queue, getToken: () => 'token', onUnauthorized });

    engine.enqueue(change('c1'));
    await engine.flush();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(queue.size()).toBe(1);
  });
});