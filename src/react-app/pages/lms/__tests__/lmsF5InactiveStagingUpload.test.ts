import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithAuth } from '@/react-app/config/api';
import { uploadScormF5InactiveStaging } from '../lmsContentUpload';

vi.mock('@/react-app/config/api', () => ({ fetchWithAuth: vi.fn() }));
const fetchMock = vi.mocked(fetchWithAuth);
const operationId = '11111111-2222-4333-8444-555555555555';
const digest = 'ab'.repeat(32);
const source = new Uint8Array(64).fill(7);
const file = {
  name: 'MGM_F5_REAL_RC1.zip',
  arrayBuffer: async () => source.buffer.slice(0),
} as unknown as File;
const base = '/api/lms/cursos/44/scorm-upload/streamed';

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

describe('F5 staging QA intake: exact-granted inactive SCORM candidate', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('window', { location: { hostname: 'staging.airtrust.pages.dev' } });
    vi.stubGlobal('crypto', {
      subtle: { digest: async () => new Uint8Array(32).fill(0xab).buffer },
      randomUUID: () => operationId,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uploads a SHA-scoped candidate through the staging grant without conformance, activate or course update', async () => {
    const calls: string[] = [];
    fetchMock.mockImplementation(async (url, opts) => {
      const path = String(url);
      calls.push(path);
      if (path === base + '/init') {
        const body = JSON.parse(String(opts?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
          operation_id: operationId, expected_sha256: digest,
          zip_bytes: source.byteLength, arquivo_nome: file.name,
        });
        return response({ operationId, partBytes: 8 * 1024 * 1024, partCount: 1 }, 201);
      }
      if (path === base + '/' + operationId + '/parts/1') {
        expect(opts?.method).toBe('PUT');
        expect((opts?.body as Blob).size).toBe(source.byteLength);
        return response({ partNumber: 1, bytes: source.byteLength });
      }
      if (path === base + '/' + operationId + '/complete') {
        return response({ packageId: 'pkg-inactive', packageSha256: digest,
          status: 'VALIDATED', zipBytes: source.byteLength }, 202);
      }
      throw Error('Unexpected side-effect route: ' + path);
    });
    const progress: number[] = [];
    const result = await uploadScormF5InactiveStaging({
      cursoId: 44, file, onProgress: (n) => progress.push(n),
    });
    expect(result).toEqual({
      packageId: 'pkg-inactive', packageSha256: digest,
      status: 'VALIDATED', zipBytes: source.byteLength,
    });
    expect(calls).toEqual([
      base + '/init', base + '/' + operationId + '/parts/1',
      base + '/' + operationId + '/complete',
    ]);
    expect(progress.at(-1)).toBe(100);
    expect(calls.every(p => !/activate|conformance|content-upload|\/cursos\/44$/.test(p))).toBe(true);
  });

  it('fails closed before any upload when running on production', async () => {
    vi.stubGlobal('window', { location: { hostname: 'airtrust.online' } });
    await expect(uploadScormF5InactiveStaging({ cursoId: 44, file }))
      .rejects.toThrow(/somente no staging/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when a staging grant is absent/unauthorized: no R2 part is posted', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      success: false, error: 'Importação SCORM F5 indisponível fora do grant de staging',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    await expect(uploadScormF5InactiveStaging({ cursoId: 44, file }))
      .rejects.toThrow(/grant de staging/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(base + '/init');
  });

  it('aborts an initialized intake on a bad part receipt, never activates', async () => {
    const calls: string[] = [];
    fetchMock.mockImplementation(async (url) => {
      const path = String(url); calls.push(path);
      if (path.endsWith('/init')) return response({
        operationId, partBytes: 8 * 1024 * 1024, partCount: 1,
      });
      if (path.endsWith('/parts/1')) return response({ partNumber: 1, bytes: 1 });
      if (path.endsWith('/abort')) return response({ aborted: true });
      throw Error('Unexpected path');
    });
    await expect(uploadScormF5InactiveStaging({ cursoId: 44, file }))
      .rejects.toThrow(/Recibo de parte/);
    expect(calls.at(-1)).toBe(base + '/' + operationId + '/abort');
    expect(calls.some(p => /activate|conformance|complete/.test(p))).toBe(false);
  });

  it('rejects a candidate with changed SHA or status instead of saying the upload succeeded', async () => {
    fetchMock.mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith('/init')) return response({
        operationId, partBytes: 8 * 1024 * 1024, partCount: 1,
      });
      if (path.endsWith('/parts/1')) return response({ partNumber: 1, bytes: source.byteLength });
      if (path.endsWith('/complete')) return response({
        packageId: 'pkg-x', packageSha256: 'cd'.repeat(32),
        status: 'VALIDATED', zipBytes: source.byteLength,
      });
      throw Error('Unexpected path');
    });
    await expect(uploadScormF5InactiveStaging({ cursoId: 44, file }))
      .rejects.toThrow(/sem confirmação íntegra/);
    expect(fetchMock.mock.calls.some(([url]) => /\/activate|\/conformance/.test(String(url)))).toBe(false);
  });
});
