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

function representativeScormZip() {
  const padding = Array.from({ length: 2048 }, (_, index) => String.fromCharCode(33 + (index % 90))).join('');
  const files: Record<string, Uint8Array> = {
    'imsmanifest.xml': strToU8(
      `<manifest><resources><resource identifier="course" href="index.html" /></resources></manifest>${padding}`,
    ),
    'index.html': strToU8(`<!doctype html><title>SCORM</title>${padding}`),
  };

  for (let index = 0; index < 96; index += 1) {
    const media = new Uint8Array(128 * 1024);
    for (let byte = 0; byte < media.length; byte += 1) {
      media[byte] = (index * 31 + byte * 17) % 251;
    }
    files[`media/chapter-${Math.floor(index / 12)}/asset-${index}.webp`] = media;
  }
  return { entries: Object.entries(files).map(([path, bytes]) => ({ path, bytes })), zip: zipSync(files) };
}

describe('uploadStructuredLmsPackage', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    extractBrowserLmsPackageMock.mockReset();
  });

  it('serializes a media-heavy SCORM package so only one Worker body stream is active', async () => {
    let activeFileUploads = 0;
    let peakFileUploads = 0;

    fetchWithAuthMock.mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith('/content-upload/init')) {
        return response({ upload_id: 'upload-1', status: 'uploading' });
      }
      if (path.includes('/content-upload/file?')) {
        activeFileUploads += 1;
        peakFileUploads = Math.max(peakFileUploads, activeFileUploads);
        await Promise.resolve();
        activeFileUploads -= 1;
        return response({ path: 'stored', bytes: 1 });
      }
      if (path.endsWith('/content-upload/complete')) {
        return response({ files_uploaded: 98, prefix: 'lms/scorm/6/32/' });
      }
      throw new Error(`Unexpected endpoint: ${path}`);
    });

    const fixture = representativeScormZip();
    expect(fixture.zip.subarray(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    expect(fixture.entries).toHaveLength(98);
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const file = {
      name: 'representative-scorm.zip',
      arrayBuffer: async () => new Uint8Array(fixture.zip).buffer,
    } as File;

    const result = await uploadStructuredLmsPackage({
      cursoId: 32,
      tipoConteudo: 'scorm',
      file,
    });

    expect(peakFileUploads).toBe(1);
    expect(result.filesUploaded).toBe(98);
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(100);
  });
});
