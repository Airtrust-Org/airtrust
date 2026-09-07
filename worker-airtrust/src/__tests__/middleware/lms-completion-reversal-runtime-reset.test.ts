import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('LMS completion reversal runtime reset', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/middleware/lms-completion-reversal.ts'),
    'utf8',
  );

  it('clears resumable SCORM evidence when a completion is invalidated', () => {
    for (const field of [
      'score_raw = NULL',
      'score_max = NULL',
      'score_min = NULL',
      'score_scaled = NULL',
      'session_time = NULL',
      'total_time = NULL',
      'session_count = 0',
      'suspend_data = NULL',
      'launch_data = NULL',
      'cmi_json = NULL',
      'last_commit_at = NULL',
    ]) {
      expect(source).toContain(field);
    }
  });

  it('keeps the enrollment incomplete after the reset', () => {
    expect(source).toContain("lesson_status = 'incomplete'");
    expect(source).toContain("completion_status = 'incomplete'");
    expect(source).toContain("success_status = 'unknown'");
  });
});
