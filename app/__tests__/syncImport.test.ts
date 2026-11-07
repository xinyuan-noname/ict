import {
  chunkCandidates,
  nextImportState,
  summarizeImport,
  toImportCandidates,
  toImportChanges
} from '../src/sync/syncImport';
import type { SportRecord } from '../src/check/localData';

function record(id: string): SportRecord {
  return { id, type: 'walking', day: '2026-11-07', distanceM: 1000, durationS: 600, steps: 1500, continuous: true };
}

describe('存量本地数据一次性导入', () => {
  test('过滤 demo_ 演示记录', () => {
    const candidates = toImportCandidates([record('sp_1'), record('demo_1')]);
    expect(candidates.map((c) => c.recordId)).toEqual(['sp_1']);
  });

  test('按 100 条分批并生成幂等 changeId', () => {
    const records = Array.from({ length: 205 }, (_, i) => record(`sp_${i}`));
    const chunks = chunkCandidates(toImportCandidates(records));
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 5]);

    const changes = toImportChanges(chunks[0]);
    expect(changes[0].changeId).toBe('import_sp_0');
  });

  test('汇总已导入/重复/失败并决定标记', () => {
    const summary = summarizeImport([
      { status: 'applied' },
      { status: 'duplicate' },
      { status: 'rejected' }
    ]);
    expect(summary).toEqual({ applied: 1, skipped: 1, failed: 1 });
    expect(nextImportState(summary)).toBe('partial');
    expect(nextImportState({ failed: 0 })).toBe('done');
  });
});