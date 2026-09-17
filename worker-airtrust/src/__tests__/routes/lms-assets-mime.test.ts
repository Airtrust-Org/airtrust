import { describe, expect, it } from 'vitest';

import { guessMime } from '../../routes/lms-assets';

describe('SCORM asset MIME mapping', () => {
  it('serves WebP learner-facing media with image/webp under nosniff', () => {
    expect(guessMime('media/full/m01/aw139-003.webp')).toBe('image/webp');
  });

  it('preserves existing raster mappings', () => {
    expect(guessMime('figure.png')).toBe('image/png');
    expect(guessMime('figure.jpg')).toBe('image/jpeg');
  });
});
