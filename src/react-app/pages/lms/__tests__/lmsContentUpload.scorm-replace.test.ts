import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithAuthMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: fetchWithAuthMock,
}));

vi.mock('../lmsPackageValidator', () => ({
  normalizeBrowserArchivePath: (path: string) => path.replace(/^\/+/, ''),
  extractBrowserLmsPackage: () => [
    {
      path: 'imsmanifest.xml',
      bytes: new TextEncoder().encode(
        `<?xml version="1.0"?>
         <ns0:manifest xmlns:ns0="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
           <ns0:organizations>
             <ns0:organization identifier="ORG">
               <ns0:item identifier="ITEM" identifierref="RES" />
             </ns0:organization>
           </ns0:organizations>
           <ns0:resources>
             <ns0:resource identifier="RES" type="webcontent" href="index.html" />
           </ns0:resources>
         </ns0:manifest>`,
      ),
    },
    {
      path: 'index.html',
      bytes: new TextEncoder().encode('<!doctype html><title>MEL</title>'),
    },
  ],
}));

import { uploadStructuredLmsPackage } from '../lmsContentUpload';

describe('LMS normal SCORM content replacement', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          success: true,
          data: {
            prefix: 'lms/scorm/1/35/_versions/op/',
            launch_file: 'index.html',
            scorm_versao: '1.2',
            files_uploaded: 2,
          },
        }),
    });
  });

  it('sends the exact ZIP to normal replacement instead of structured init / Quality Gate', async () => {
    const file = new File(['zip-bytes'], 'mel.zip', { type: 'application/zip' });

    const result = await uploadStructuredLmsPackage({
      cursoId: 35,
      tipoConteudo: 'scorm',
      file,
    });

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchWithAuthMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/lms/cursos/35/scorm-upload');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(file);
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/zip',
      'X-AirTrust-Upload-Mode': 'replace-content',
    });
    expect(String(url)).not.toContain('/content-upload/init');
    expect(result).toMatchObject({
      prefix: 'lms/scorm/1/35/_versions/op/',
      launchFile: 'index.html',
      scormVersao: '1.2',
      filesUploaded: 2,
    });
  });

  it('accepts namespace-prefixed SCORM manifests in client-side launch validation', async () => {
    const file = new File(['zip-bytes'], 'mel-prefixed.zip', { type: 'application/zip' });

    await expect(
      uploadStructuredLmsPackage({ cursoId: 35, tipoConteudo: 'scorm', file }),
    ).resolves.toMatchObject({ launchFile: 'index.html' });
  });
});
