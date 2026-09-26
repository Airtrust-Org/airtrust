import { describe, expect, it } from 'vitest';
import { assertSegmentedSyncComplete } from '../../routes/integracoes_sigvoos';

describe('SIGVOOS segmented sync completion guard', () => {
  it('accepts only when every requested window succeeded', () => {
    expect(() => assertSegmentedSyncComplete([
      { from: '2026-09-01', to: '2026-09-07', success: true },
      { from: '2026-09-08', to: '2026-09-14', success: true },
    ])).not.toThrow();
  });

  it('fails closed when any window is incomplete', () => {
    expect(() => assertSegmentedSyncComplete([
      { from: '2026-09-01', to: '2026-09-07', success: true },
      { from: '2026-09-08', to: '2026-09-14', success: false, error: 'provider timeout' },
    ])).toThrow('SIGVOOS_SEGMENTED_SYNC_INCOMPLETE:2026-09-08..2026-09-14');
  });
});
