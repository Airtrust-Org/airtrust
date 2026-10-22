import { describe, expect, it } from 'vitest';
import { getLmsPlayerRoute } from '@/react-app/pages/lms/lmsPlayerRoute';

describe('LMS catalog course-to-player routing', () => {
  it.each([
    ['native','/lms/player/native/99'],
    ['scorm','/lms/player/99'],
    ['h5p','/lms/player/h5p/99'],
    ['pdf','/lms/player/pdf/99'],
    ['pptx','/lms/player/pptx/99'],
    ['video','/lms/player/99'],
  ] as const)('routes %s to the correct isolated player', (type, expected) => {
    expect(getLmsPlayerRoute(type, 99)).toBe(expected);
    expect(getLmsPlayerRoute(type, 99, true)).toBe(expected + '?review=1');
  });
  it('rejects malformed enrollment IDs before building player links', () => {
    for (const id of [0,-1,NaN,1.25]) {
      expect(() => getLmsPlayerRoute('native',id)).toThrow('INVALID_LMS_ENROLLMENT_ROUTE');
    }
  });
});
