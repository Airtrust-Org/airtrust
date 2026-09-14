import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  buildSyntheticCaeAvailability,
  flattenPairedBlocks,
  flattenProofCandidateBlocks,
} from '../../../../scripts/validation/production-simulator-folga-readonly.mjs';

describe('production simulator FOLGA read-only proof helpers', () => {
  it('prefers real paired blocks and still counts singleton proposal blocks', () => {
    const paired = { block_id: 'paired', target_date: '2026-10-10', sessions: [{ need_id: 'a' }, { need_id: 'b' }] };
    const singleton = { block_id: 'solo', target_date: '2026-10-09', sessions: [{ need_id: 'c' }] };
    expect(flattenPairedBlocks({ classes: [{ blocks: [singleton, paired] }] })).toEqual([paired]);
    expect(flattenProofCandidateBlocks({ classes: [{ blocks: [singleton, paired] }] })).toEqual([paired, singleton]);
  });

  it('builds a valid in-memory CAE slot without persisting anything', () => {
    const block = { equipment: 'AW139', duration_minutes: 120 };
    const doc = buildSyntheticCaeAvailability(block, '2026-10-20');
    expect(doc.slots[0]).toMatchObject({
      equipment: 'AW139',
      date: '2026-10-20',
      start_time: '10:00',
      end_time: '12:00',
      duration_minutes: 120,
      state: 'OFFERED',
    });
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});
