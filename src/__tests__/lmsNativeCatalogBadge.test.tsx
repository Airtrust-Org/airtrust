import { describe, expect, it } from 'vitest';
import { getTypeMeta } from '@/react-app/pages/lms/lmsUi';

describe('Native catalog type badges', () => {
  it('identifies Native courses without labeling them as SCORM', () => {
    const meta = getTypeMeta('native');
    expect(meta.label).toBe('Native');
    expect(meta.label).not.toBe(getTypeMeta('scorm').label);
  });
  it('preserves the legacy SCORM classification for existing courses', () => {
    expect(getTypeMeta('scorm').label).toBe('SCORM');
  });
});
