import { describe, expect, it } from 'vitest';

import { resolveLmsDisplayProgress } from '../LmsPlayer';

describe('resolveLmsDisplayProgress', () => {
  it('keeps an incomplete SCORM enrollment at 99% even at its final location', () => {
    expect(resolveLmsDisplayProgress({
      completed: false,
      matriculaStatus: 'EM_ANDAMENTO',
      mergedProgress: 100,
    })).toBe(99);
  });

  it('shows 100% only after canonical completion', () => {
    expect(resolveLmsDisplayProgress({
      completed: false,
      matriculaStatus: 'CONCLUIDO',
      mergedProgress: 99,
    })).toBe(100);
  });
});
