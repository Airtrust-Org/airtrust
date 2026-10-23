import { describe, expect, it } from 'vitest';

import { guessMime } from '../../routes/lms-assets';

describe('SCORM asset MIME mapping', () => {
  it('serves WebP learner-facing media with image/webp under nosniff', () => {
    expect(guessMime('media/full/m01/aw139-003.webp')).toBe('image/webp');
  });

  it('serves all approved modern media and captions with browser-readable MIME', () => {
    expect(guessMime('media/figure.avif')).toBe('image/avif');
    expect(guessMime('assets/speech.WAV')).toBe('audio/wav');
    expect(guessMime('captions/pt-BR.vtt')).toBe('text/vtt; charset=utf-8');
    expect(guessMime('media/clip.mp4')).toBe('video/mp4');
    expect(guessMime('audio/narration.mp3')).toBe('audio/mpeg');
  });

  it('does not make unknown binaries executable content', () => {
    expect(guessMime('media/unknown.bin')).toBe('application/octet-stream');
  });

  it('preserves existing raster mappings', () => {
    expect(guessMime('figure.png')).toBe('image/png');
    expect(guessMime('figure.jpg')).toBe('image/jpeg');
  });
});
