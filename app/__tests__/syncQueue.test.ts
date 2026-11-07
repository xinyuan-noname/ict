import { SyncQueue, SYNC_QUEUE_MAX } from '../src/sync/syncQueue';

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

describe('SyncQueue 队列语义', () => {
  test('超出容量淘汰最旧条目', () => {
    const queue = new SyncQueue(SYNC_QUEUE_MAX);
    for (let i = 0; i < SYNC_QUEUE_MAX + 5; i++) {
      queue.enqueue(change(`c${i}`), 0);
    }
    expect(queue.size()).toBe(SYNC_QUEUE_MAX);
    expect(queue.snapshot()[0].changeId).toBe('c5');
  });

  test('网络失败按指数退避，不丢弃', () => {
    const queue = new SyncQueue(10);
    queue.enqueue(change('c1'), 0);
    queue.retry(['c1'], 0);
    expect(queue.due(999)).toHaveLength(0);
    expect(queue.due(1000)).toHaveLength(1);
    expect(queue.snapshot()[0].attempts).toBe(1);
  });

  test('成功与业务失败都会移出队列', () => {
    const queue = new SyncQueue(10);
    queue.enqueue(change('c1'), 0);
    queue.enqueue(change('c2'), 0);
    queue.enqueue(change('c3'), 0);
    queue.succeed(['c1']);
    queue.drop(['c2']);
    expect(queue.size()).toBe(1);
    expect(queue.snapshot()[0].changeId).toBe('c3');
  });
});