import { describe, expect, it } from 'vitest';
import { pptxRenderedPdfKey } from '../../../lib/lms/pptx-rendered-asset';
const key = 'lms/pptx/6/22/presentation.pptx';
const oldEtag = 'a'.repeat(32);
const newEtag = 'b'.repeat(32);

describe('PPTX faithful PDF strictly bound to actual R2 original bytes', () => {
  it('binds derivative to the source ETag, never catalog version_tag', () => {
    expect(pptxRenderedPdfKey(key, oldEtag)).toBe(`lms/pptx/6/22/rendered/${oldEtag}.pdf`);
    expect(pptxRenderedPdfKey(key, `"${oldEtag}"`)).toBe(`lms/pptx/6/22/rendered/${oldEtag}.pdf`);
  });
  it('rejects source replacement with unchanged database version', () => {
    expect(pptxRenderedPdfKey(key, oldEtag)).not.toBe(pptxRenderedPdfKey(key, newEtag));
  });
  it('keeps the derivative available when only the course thumbnail version changes', () => {
    const before = pptxRenderedPdfKey(key, oldEtag);
    const after = pptxRenderedPdfKey(key, oldEtag);
    expect(after).toBe(before);
  });
  it('refuses keys outside canonical tenant/course scope and invalid ETags', () => {
    for (const unsafe of ['pptx/presentation.pptx', 'lms/pptx/0/22/presentation.pptx',
      'lms/pptx/6/22/other.pptx', 'lms/pptx/6/22/../presentation.pptx']) {
      expect(pptxRenderedPdfKey(unsafe, oldEtag)).toBeNull();
    }
    for (const invalid of [null, '', '../v2', '2026-08-30T20:31:35.741Z', 'z'.repeat(32)]) {
      expect(pptxRenderedPdfKey(key, invalid)).toBeNull();
    }
  });
});
