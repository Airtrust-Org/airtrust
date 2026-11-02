import { describe, expect, it } from 'vitest';
import { allowDirectScormUpload } from './lmsScormDirectUploadPolicy';

describe('direct formative SCORM upload surface', () => {
  it('is available only to production administrators', () => {
    expect(allowDirectScormUpload(true, 'airtrust.online')).toBe(true);
    expect(allowDirectScormUpload(false, 'airtrust.online')).toBe(false);
    expect(allowDirectScormUpload(true, 'staging.airtrust.pages.dev')).toBe(false);
    expect(allowDirectScormUpload(true, 'localhost')).toBe(false);
    expect(allowDirectScormUpload(true, 'airtrust.online.evil.example')).toBe(false);
  });
});
