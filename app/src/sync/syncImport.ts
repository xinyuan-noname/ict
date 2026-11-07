import type { SyncChange } from '../api/syncClient';
import type { SportRecord } from '../check/localData';

export const SYNC_IMPORT_KEY = 'sync.imported.v1';
export type ImportState = 'done' | 'skipped' | 'partial' | null;

export interface ImportCandidate {
  recordId: string;
  type: SportRecord['type'];
  day: string;
  distanceM: number;
  durationS: number;
  steps: number;
  continuous: boolean;
}

// 仅导入真实记录：demo_ 前缀与游客档案一律跳过（SYNC-11）。
export function toImportCandidates(records: SportRecord[]): ImportCandidate[] {
  return records
    .filter((r) => r.id && !r.id.startsWith('demo_'))
    .map((r) => ({
      recordId: r.id,
      type: r.type,
      day: r.day,
      distanceM: r.distanceM,
      durationS: r.durationS,
      steps: r.steps,
      continuous: r.continuous
    }));
}

export function chunkCandidates(candidates: ImportCandidate[], size = 100): ImportCandidate[][] {
  const chunks: ImportCandidate[][] = [];
  for (let i = 0; i < candidates.length; i += size) {
    chunks.push(candidates.slice(i, i + size));
  }
  return chunks;
}

export function toImportChanges(candidates: ImportCandidate[]): SyncChange[] {
  return candidates.map((c) => ({
    changeId: `import_${c.recordId}`,
    entity: 'sport_record',
    op: 'upsert',
    record: c
  }));
}

// 导入结果汇总：applied 计入成功，duplicate 计入跳过，其余计入失败。
export function summarizeImport(results: { status: string }[]): { applied: number; skipped: number; failed: number } {
  let applied = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'applied') {
      applied += 1;
    } else if (r.status === 'duplicate') {
      skipped += 1;
    } else {
      failed += 1;
    }
  }
  return { applied, skipped, failed };
}

export function nextImportState(summary: { failed: number }): ImportState {
  return summary.failed > 0 ? 'partial' : 'done';
}