import { afterEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: request,
}));
import { authorizeScormAssetSession } from '../scormAssetSessionDeadline';

describe('SCORM asset-session authorization deadline', () => {
  afterEach(() => {
    vi.useRealTimers();
    request.mockReset();
  });

  it('bounds an unresolved auth refresh even when the network does not honor abort', async () => {
    vi.useFakeTimers();
    request.mockImplementation(() => new Promise(() => {}));
    const pending = authorizeScormAssetSession({ matriculaId: 341, expectedHandoffId: null });
    const assertion = expect(pending).rejects.toThrow('ASSET_SESSION_TIMEOUT');
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('/api/lms/assets/session');
    expect(init.signal.aborted).toBe(true);
  });

  it('preserves exact enrollment and handoff scope, without a completion write', async () => {
    const authorized = new Response('{}', { status: 200 });
    request.mockResolvedValue(authorized);
    const response = await authorizeScormAssetSession({ matriculaId: 341, expectedHandoffId: 12 });
    expect(response).toBe(authorized);
    expect(request).toHaveBeenCalledWith('/api/lms/assets/session', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({matricula_id:341,expected_handoff_id:12}),
      signal: expect.any(AbortSignal),
    }));
  });

  it('does not turn a real HTTP 409 into an invented authorization success', async () => {
    request.mockResolvedValue(new Response('{}', { status: 409 }));
    const response = await authorizeScormAssetSession({matriculaId:341,expectedHandoffId:null});
    expect(response.status).toBe(409);
  });
});
