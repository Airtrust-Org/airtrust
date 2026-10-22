import { describe, expect, it, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/react-app/config/api', () => ({ fetchWithAuth: mocks.fetch }));
import { createNativeEnrollment } from '@/react-app/pages/lms/lmsNativeEnrollment';

describe('Native catalog start uses a dedicated authenticated enrollment API', () => {
  beforeEach(() => mocks.fetch.mockReset());

  it('sends no browser-owned employee, edition or grade to the Native endpoint', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({
      success: true, data: { matricula_id: 123 },
    }) });
    await expect(createNativeEnrollment(31)).resolves.toBe(123);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/lms/native/cursos/31/matricular', {
      method: 'POST',
    });
  });

  it('does not call SCORM matrícula API when Native is disabled or denied', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({
      success: false, code: 'NATIVE_ENROLLMENT_CREATE_NOT_ENABLED',
    }) });
    await expect(createNativeEnrollment(31)).rejects.toThrow('ainda não está disponível');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed API receipts rather than navigating a stale SCORM player', async () => {
    for (const data of [{ matricula_id: '123' }, { matricula_id: -1 }, {}, null]) {
      mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data }) });
      await expect(createNativeEnrollment(31)).rejects.toThrow('ainda não está disponível');
    }
  });

  it('rejects invalid local course IDs before calling API', async () => {
    await expect(createNativeEnrollment(0)).rejects.toThrow('inválida');
    await expect(createNativeEnrollment(1.2)).rejects.toThrow('inválida');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
