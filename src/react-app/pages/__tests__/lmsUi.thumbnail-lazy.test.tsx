import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithAuthMock = vi.hoisted(() => vi.fn());

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://api.example.test/api',
  fetchWithAuth: fetchWithAuthMock,
}));

import { useLmsCourseThumbnailUrl } from '../lms/lmsUi';

describe('useLmsCourseThumbnailUrl', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['thumb'], { type: 'image/png' }),
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:thumb'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não faz request enquanto o artwork está fora do viewport', async () => {
    const course = {
      id: 52,
      thumbnail_r2_key: 'lms/course-thumbnails/6/52/cover.png',
      version_tag: 'v1',
    };

    const { rerender } = renderHook(
      ({ enabled }) => useLmsCourseThumbnailUrl(course, enabled),
      { initialProps: { enabled: false } },
    );

    expect(fetchWithAuthMock).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      'https://api.example.test/api/lms/course-assets/52/thumbnail?v=v1',
    );
  });
});
