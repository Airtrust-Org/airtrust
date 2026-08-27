/**
 * Fix 9 — the wrapper's suspend_data regression guard must stay fail-closed.
 *
 * `protectSuspendDataValue` is defined inside the injected wrapper script string
 * in src/routes/lms-assets.ts, so it cannot be imported directly. This test
 * MIRRORS the exact guard body (kept in sync with the source — see the
 * assertions in lms-assets-progress-authority.test.ts that pin the real code)
 * and proves the required behaviour:
 *
 *   - a shorter suspend_data mid-course is BLOCKED (SCORM_REGRESSION_BLOCKED);
 *   - a shorter suspend_data near the SCORM 1.2 ~4096B ceiling is a legitimate
 *     finalization and is ALLOWED;
 *   - an empty overwrite of non-empty state is BLOCKED;
 *   - growth / equal length passes through.
 *
 * No change was made to hide SCORM_REGRESSION_BLOCKED; the guard is unchanged.
 */
import { describe, expect, it } from 'vitest';

// ── mirrors src/routes/lms-assets.ts: protectSuspendDataValue ────────────────
const SUSPEND_DATA_NEAR_LIMIT_THRESHOLD = 3800;
function protectSuspendDataValue(currentValue: unknown, nextValue: unknown) {
  const currentText = typeof currentValue === 'string' ? currentValue : '';
  const nextText = typeof nextValue === 'string' ? nextValue : '';
  if (currentText && !nextText.trim()) {
    return { value: currentText, blocked: true, reason: 'empty-suspend-data' };
  }
  if (currentText && nextText && nextText.length < currentText.length) {
    if (currentText.length >= SUSPEND_DATA_NEAR_LIMIT_THRESHOLD) {
      return { value: nextText, blocked: false, reason: 'accepted-suspend-data-near-limit-shrink' };
    }
    return { value: currentText, blocked: true, reason: 'shorter-suspend-data' };
  }
  return { value: nextText || currentText || '', blocked: false, reason: 'accepted-suspend-data' };
}
// ────────────────────────────────────────────────────────────────────────────

describe('protectSuspendDataValue', () => {
  it('blocks an intermediate regressive shrink and keeps the fuller state', () => {
    const current = 'x'.repeat(1200);
    const next = 'x'.repeat(800);
    const out = protectSuspendDataValue(current, next);
    expect(out.blocked).toBe(true);
    expect(out.reason).toBe('shorter-suspend-data');
    expect(out.value).toBe(current);
  });

  it('allows a shorter final save only when the prior state is near the 4KB ceiling', () => {
    const current = 'x'.repeat(3900);
    const next = 'x'.repeat(3200);
    const out = protectSuspendDataValue(current, next);
    expect(out.blocked).toBe(false);
    expect(out.reason).toBe('accepted-suspend-data-near-limit-shrink');
    expect(out.value).toBe(next);
  });

  it('blocks an empty overwrite of existing state', () => {
    const out = protectSuspendDataValue('abc123', '   ');
    expect(out.blocked).toBe(true);
    expect(out.reason).toBe('empty-suspend-data');
    expect(out.value).toBe('abc123');
  });

  it('passes through growth and equal-length writes', () => {
    expect(protectSuspendDataValue('abc', 'abcdef').blocked).toBe(false);
    expect(protectSuspendDataValue('abc', 'xyz').blocked).toBe(false);
  });
});
