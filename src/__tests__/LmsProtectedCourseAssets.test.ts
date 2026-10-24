import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithAuth } from '@/react-app/config/api';
import { fetchLmsCourseAsset } from '@/react-app/pages/lms/lmsProtectedCourseAsset';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  fetchWithAuth: vi.fn(),
}));

const transport = vi.mocked(fetchWithAuth);

describe('LMS protected PDF/PPTX media uses rotating authenticated transport', () => {
  beforeEach(() => transport.mockReset());

  it.each(['pdf', 'pptx'] as const)(
    '%s loads only through the refresh-capable client without cached Authorization',
    async kind => {
      const response = new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      transport.mockResolvedValueOnce(response);
      const result = await fetchLmsCourseAsset(kind, 57);
      expect(result).toBe(response);
      expect(transport).toHaveBeenCalledExactlyOnceWith(
        `/api/lms/${kind}/asset/57`,
        { method: 'GET', cache: 'no-store' },
      );
      expect(transport.mock.calls[0][1]?.headers).toBeUndefined();
    },
  );

  it('keeps a failed authorization failed, never falls back to a raw fetch', async () => {
    const denied = new Response(null, { status: 403 });
    transport.mockResolvedValueOnce(denied);
    expect((await fetchLmsCourseAsset('pdf', 57)).status).toBe(403);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('propagates transport errors without retrying a protected asset anonymously', async () => {
    transport.mockRejectedValueOnce(new Error('Session expired'));
    await expect(fetchLmsCourseAsset('pptx', 57)).rejects.toThrow('Session expired');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid identifiers before any authenticated network request', async () => {
    for (const cursoId of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(fetchLmsCourseAsset('pdf', cursoId))
        .rejects.toThrow('LMS_PROTECTED_ASSET_INVALID_SCOPE');
    }
    await expect(fetchLmsCourseAsset('video' as 'pdf', 57))
      .rejects.toThrow('LMS_PROTECTED_ASSET_INVALID_SCOPE');
    expect(transport).not.toHaveBeenCalled();
  });
});
