import { describe, expect, it } from 'vitest';

import { patchCursoThumbnailListCache } from '@/react-app/hooks/useLms';

describe('patchCursoThumbnailListCache', () => {
  it('patches the matching course thumbnail without TDZ shadowing', () => {
    const current = {
      data: [
        {
          id: 1,
          titulo: 'Curso TDZ Debug',
          thumbnail_r2_key: null,
          version_tag: null,
        },
        {
          id: 2,
          titulo: 'Outro curso',
          thumbnail_r2_key: 'old-key',
          version_tag: 'old-tag',
        },
      ],
      total: 2,
    };

    expect(() =>
      patchCursoThumbnailListCache(current as never, 1, {
        thumbnail_r2_key: 'thumb/new-key',
        version_tag: 'v2',
      }),
    ).not.toThrow();

    const next = patchCursoThumbnailListCache(current as never, 1, {
      thumbnail_r2_key: 'thumb/new-key',
      version_tag: 'v2',
    });

    expect(next).toEqual({
      data: [
        {
          id: 1,
          titulo: 'Curso TDZ Debug',
          thumbnail_r2_key: 'thumb/new-key',
          version_tag: 'v2',
        },
        {
          id: 2,
          titulo: 'Outro curso',
          thumbnail_r2_key: 'old-key',
          version_tag: 'old-tag',
        },
      ],
      total: 2,
    });
  });

  it('returns the original cache when there is no list data', () => {
    expect(
      patchCursoThumbnailListCache(undefined, 1, {
        thumbnail_r2_key: 'thumb/new-key',
        version_tag: 'v2',
      }),
    ).toBeUndefined();
  });
});
