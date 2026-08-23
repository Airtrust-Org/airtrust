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

function retryScormFixture() {
  const files: Record<string, Uint8Array> = {
    'imsmanifest.xml': strToU8(
      '<manifest><resources><resource identifier="course" href="index.html" /></resources></manifest>',
    ),
    'index.html': strToU8('<!doctype html><title>SCORM</title>'),
    'media/cap08/pcm_connectors.webp': new Uint8Array([1, 2, 3, 4]),
  };
  return { entries: Object.entries(files).map(([path, bytes]) => ({ path, bytes })), zip: zipSync(files) };
}

describe('uploadStructuredLmsPackage', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    extractBrowserLmsPackageMock.mockReset();
  });

  it('uploads a media-heavy SCORM package with at most two small Worker body streams active', async () => {
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

    expect(peakFileUploads).toBe(2);
    expect(result.filesUploaded).toBe(98);
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(100);
  }, 15_000);

  it('keeps a file of at least 4 MB isolated from other uploads', async () => {
    let activeFileUploads = 0;
    let largeUploadOverlapped = false;
    const large = new Uint8Array(4 * 1024 * 1024);
    const fixture = retryScormFixture();
    fixture.entries.push({ path: 'media/large.webm', bytes: large });

    fetchWithAuthMock.mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith('/content-upload/init')) return response({ upload_id: 'upload-large', status: 'uploading' });
      if (path.includes('/content-upload/file?')) {
        const isLarge = path.includes('large.webm');
        activeFileUploads += 1;
        if (isLarge && activeFileUploads > 1) largeUploadOverlapped = true;
        await Promise.resolve();
        activeFileUploads -= 1;
        return response({ path: 'stored', bytes: 1 });
      }
      if (path.endsWith('/content-upload/complete')) return response({ files_uploaded: fixture.entries.length, prefix: 'lms/scorm/6/32/' });
      throw new Error(`Unexpected endpoint: ${path}`);
    });

    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const result = await uploadStructuredLmsPackage({
      cursoId: 32,
      tipoConteudo: 'scorm',
      file: { name: 'mixed-size-scorm.zip', arrayBuffer: async () => fixture.zip.buffer } as File,
    });

    expect(largeUploadOverlapped).toBe(false);
    expect(result.filesUploaded).toBe(fixture.entries.length);
  });

  it('retries a transient network/CORS failure for the same versioned asset and still completes', async () => {
    let targetAttempts = 0;
    const statuses: string[] = [];

    fetchWithAuthMock.mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith('/content-upload/init')) {
        return response({ upload_id: 'db7b6e553c535eb5e5f29063202161cfe3b59942', status: 'uploading' });
      }
      if (path.includes('/content-upload/file?')) {
        if (path.includes('pcm_connectors.webp')) {
          targetAttempts += 1;
          if (targetAttempts === 1) throw new TypeError('Failed to fetch');
        }
        return response({ path: 'stored', bytes: 4 });
      }
      if (path.endsWith('/content-upload/complete')) {
        return response({ files_uploaded: 3, prefix: 'lms/scorm/6/32/_versions/upload/' });
      }
      throw new Error(`Unexpected endpoint: ${path}`);
    });

    const fixture = retryScormFixture();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const file = {
      name: 'aw139-manutencao.zip',
      arrayBuffer: async () => new Uint8Array(fixture.zip).buffer,
    } as File;

    const result = await uploadStructuredLmsPackage({
      cursoId: 32,
      tipoConteudo: 'scorm',
      file,
      onStatus: (status) => statuses.push(status),
    });

    expect(targetAttempts).toBe(2);
    expect(result.filesUploaded).toBe(3);
    expect(statuses.some((status) => /Falha transitória.*pcm_connectors\.webp/i.test(status))).toBe(true);
    expect(fetchWithAuthMock.mock.calls.some(([url]) => String(url).endsWith('/content-upload/complete'))).toBe(true);
  });

  it('resumes the same package without reuploading files already stored in the version prefix', async () => {
    const fixture = retryScormFixture();
    const [manifest, launch, target] = fixture.entries;
    const uploadedPaths: string[] = [];
    const statuses: string[] = [];

    fetchWithAuthMock.mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith('/content-upload/init')) {
        return response({
          upload_id: 'db7b6e553c535eb5e5f29063202161cfe3b59942',
          status: 'uploading',
          uploaded_files: [
            { path: manifest!.path, size: manifest!.bytes.byteLength },
            { path: launch!.path, size: launch!.bytes.byteLength },
          ],
        });
      }
      if (path.includes('/content-upload/file?')) {
        const requestUrl = new URL(path, 'https://airtrust.online');
        uploadedPaths.push(requestUrl.searchParams.get('path') ?? '');
        return response({ path: target!.path, bytes: target!.bytes.byteLength });
      }
      if (path.endsWith('/content-upload/complete')) {
        return response({ files_uploaded: 3, prefix: 'lms/scorm/6/32/_versions/upload/' });
      }
      throw new Error(`Unexpected endpoint: ${path}`);
    });

    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const file = {
      name: 'aw139-manutencao.zip',
      arrayBuffer: async () => new Uint8Array(fixture.zip).buffer,
    } as File;

    const result = await uploadStructuredLmsPackage({
      cursoId: 32,
      tipoConteudo: 'scorm',
      file,
      onStatus: (status) => statuses.push(status),
    });

    expect(uploadedPaths).toEqual(['media/cap08/pcm_connectors.webp']);
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(3);
    expect(result.filesUploaded).toBe(3);
    expect(statuses.some((status) => /Retomando upload: 2 de 3 arquivos já enviados/i.test(status))).toBe(true);
  });
});
