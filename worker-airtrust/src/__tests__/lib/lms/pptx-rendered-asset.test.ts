import { describe, expect, it } from 'vitest';
import { pptxRenderedPdfKey } from '../../../lib/lms/pptx-rendered-asset';

describe('PPTX faithful PDF version scope', () => {
  it('binds source edition to immutable derivative key', () => {
    expect(pptxRenderedPdfKey('lms/pptx/6/22/presentation.pptx', '2026-08-30T20:31:35.741Z'))
      .toBe('lms/pptx/6/22/rendered/2026-08-30T20%3A31%3A35.741Z.pdf');
  });
  it('refuses keys outside canonical tenant/course scope or unknown edition', () => {
    for (const key of ['pptx/presentation.pptx', 'lms/pptx/0/22/presentation.pptx',
      'lms/pptx/6/22/other.pptx', 'lms/pptx/6/22/../presentation.pptx']) {
      expect(pptxRenderedPdfKey(key, 'v1')).toBeNull();
    }
    expect(pptxRenderedPdfKey('lms/pptx/6/22/presentation.pptx', null)).toBeNull();
  });
  it('cannot inject path via version metadata', () => {
    expect(pptxRenderedPdfKey('lms/pptx/6/22/presentation.pptx', '../v2'))
      .toBe('lms/pptx/6/22/rendered/..%2Fv2.pdf');
  });
});
