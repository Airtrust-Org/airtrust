import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithAuth } from '@/react-app/config/api';
import { uploadStructuredLmsPackage } from '../lmsContentUpload';

const { extractBrowserLmsPackageMock } = vi.hoisted(() => ({
  extractBrowserLmsPackageMock: vi.fn(),
}));

vi.mock('@/react-app/config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../lmsPackageValidator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lmsPackageValidator')>()),
  extractBrowserLmsPackage: extractBrowserLmsPackageMock,
}));

const fetchWithAuthMock = vi.mocked(fetchWithAuth);

function response(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('uploadStructuredLmsPackage namespaced SCORM manifest', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    extractBrowserLmsPackageMock.mockReset();
  });

  it('accepts namespace-prefixed resource and resolves the launch file', async () => {
    const files: Record<string, Uint8Array> = {
      'imsmanifest.xml': strToU8(
        '<?xml version="1.0"?><ns0:manifest xmlns:ns0="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><ns0:resources><ns0:resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html" /></ns0:resources></ns0:manifest>',
      ),
      'index.html': strToU8('<!doctype html><title>MEL</title>'),
    };
    const entries = Object.entries(files).map(([path, bytes]) => ({ path, bytes }));
    const zip = zipSync(files);
    extractBrowserLmsPackageMock.mockReturnValue(entries);

    fetchWithAuthMock.mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith('/content-upload/init')) return response({ upload_id: 'namespaced', status: 'uploading' });
      if (path.includes('/content-upload/file?')) return response({ path: 'stored', bytes: 1 });
      if (path.endsWith('/content-upload/complete')) return response({ files_uploaded: 2, prefix: 'lms/scorm/1/1/' });
      throw new Error(`Unexpected endpoint: ${path}`);
    });

    const result = await uploadStructuredLmsPackage({
      cursoId: 1,
      tipoConteudo: 'scorm',
      file: { name: 'mel.zip', arrayBuffer: async () => new Uint8Array(zip).buffer } as File,
    });

    expect(result.launchFile).toBe('index.html');
    expect(result.scormVersao).toBe('1.2');
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(4);
  });
});
