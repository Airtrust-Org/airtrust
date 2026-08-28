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

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function scormZip(manifestXml?: string) {
  const files: Record<string, Uint8Array> = {
    'imsmanifest.xml': strToU8(
      manifestXml ??
        '<manifest><organizations default="o"><organization identifier="o"><item identifierref="course" /></organization></organizations><resources><resource identifier="course" href="index.html" /></resources></manifest>',
    ),
    'index.html': strToU8('<!doctype html><title>SCORM</title>'),
    'media/asset-1.webp': new Uint8Array([1, 2, 3, 4]),
  };
  return { entries: Object.entries(files).map(([path, bytes]) => ({ path, bytes })), zip: zipSync(files) };
}

// MEL V4: namespaced <ns0:resource> — parseLaunchFile must still resolve index.html.
function namespacedMelZip() {
  const manifestXml =
    '<ns0:manifest xmlns:ns0="http://www.imsproject.org/xsd/imscp_rootv1p1p2">' +
    '<ns0:organizations default="ORG"><ns0:organization identifier="ORG">' +
    '<ns0:item identifier="I1" identifierref="R1"><ns0:title>MEL</ns0:title></ns0:item>' +
    '</ns0:organization></ns0:organizations>' +
    '<ns0:resources><ns0:resource identifier="R1" type="webcontent" href="index.html">' +
    '<ns0:file href="index.html" /></ns0:resource></ns0:resources></ns0:manifest>';
  return scormZip(manifestXml);
}

function h5pZip() {
  const files: Record<string, Uint8Array> = {
    'h5p.json': strToU8('{"mainLibrary":"H5P.InteractiveVideo 1.0","title":"t"}'),
    'content/content.json': strToU8('{"interactiveVideo":{}}'),
    'content/videos/clip.mp4': new Uint8Array(8),
  };
  return { entries: Object.entries(files).map(([path, bytes]) => ({ path, bytes })), zip: zipSync(files) };
}

function scormFile(zip: Uint8Array, name = 'package.zip') {
  // jsdom's File in this env has no arrayBuffer(); the upload code only needs
  // name + arrayBuffer() and rebuilds the multipart Blob from the read bytes.
  return { name, arrayBuffer: async () => new Uint8Array(zip).buffer } as unknown as File;
}

const CANDIDATE_VALIDATED = {
  packageId: 'pkg-1',
  status: 'VALIDATED',
  publishable: false,
  structural: { status: 'PASS', errors: [] },
  completionManifest: { status: 'PASS', errors: [] },
  diagnostics: { status: 'PASS', errors: [] },
};

describe('uploadStructuredLmsPackage — SCORM governed package-version flow', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    extractBrowserLmsPackageMock.mockReset();
  });

  function wireScorm(overrides: {
    candidate?: unknown;
    candidateStatus?: number;
    conformance?: unknown;
    activate?: unknown;
  }) {
    const calls: string[] = [];
    fetchWithAuthMock.mockImplementation(async (url) => {
      const path = String(url);
      calls.push(path);
      if (path.includes('/content-upload/init')) {
        throw new Error('content-upload/init must never be called for SCORM');
      }
      if (path.includes('/scorm-upload')) {
        return response(overrides.candidate ?? CANDIDATE_VALIDATED, overrides.candidateStatus ?? 202);
      }
      if (path.includes('/conformance')) {
        return response(overrides.conformance ?? { ...CANDIDATE_VALIDATED, publishable: true });
      }
      if (path.includes('/activate')) {
        return response(
          overrides.activate ?? {
            packageId: 'pkg-1',
            status: 'ACTIVE',
            launchFile: 'index.html',
            r2Prefix: 'lms/scorm/6/44/_candidates/pkg-1/',
            scorm_versao: '1.2',
          },
        );
      }
      throw new Error(`Unexpected endpoint: ${path}`);
    });
    return calls;
  }

  it('A/B: SCORM never calls content-upload/init and does call scorm-upload', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({});

    await uploadStructuredLmsPackage({ cursoId: 44, tipoConteudo: 'scorm', file: scormFile(fixture.zip) });

    expect(calls.some((c) => c.includes('/content-upload/init'))).toBe(false);
    expect(calls.some((c) => c.includes('/content-upload/file'))).toBe(false);
    expect(calls.some((c) => c.includes('/scorm-upload'))).toBe(true);
  });

  it('C: a REJECTED candidate does not call conformance or activate', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({
      candidate: {
        packageId: 'pkg-x',
        status: 'REJECTED',
        publishable: false,
        structural: { status: 'FAIL', errors: ['imsmanifest sem organização padrão'] },
        completionManifest: { status: 'PASS', errors: [] },
        diagnostics: { status: 'PASS', errors: [] },
      },
    });

    await expect(
      uploadStructuredLmsPackage({ cursoId: 44, tipoConteudo: 'scorm', file: scormFile(fixture.zip) }),
    ).rejects.toThrow(/rejeitado no Quality Gate.*organização padrão/i);

    expect(calls.some((c) => c.includes('/conformance'))).toBe(false);
    expect(calls.some((c) => c.includes('/activate'))).toBe(false);
  });

  it('D: a static VALIDATED candidate proceeds to conformance', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({});

    await uploadStructuredLmsPackage({ cursoId: 44, tipoConteudo: 'scorm', file: scormFile(fixture.zip) });

    expect(calls.filter((c) => c.includes('/conformance'))).toHaveLength(1);
  });

  it('E: conformance publishable=false does not call activate and keeps the previous package', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({
      conformance: {
        ...CANDIDATE_VALIDATED,
        publishable: false,
        runtime: { status: 'FAIL', errors: ['player não emitiu cmi.core.lesson_status'] },
      },
    });

    await expect(
      uploadStructuredLmsPackage({ cursoId: 44, tipoConteudo: 'scorm', file: scormFile(fixture.zip) }),
    ).rejects.toThrow(/conformidade do player.*lesson_status/i);

    expect(calls.some((c) => c.includes('/activate'))).toBe(false);
  });

  it('F: publishable=true calls activate exactly once and returns the active prefix/launch', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({});

    const result = await uploadStructuredLmsPackage({
      cursoId: 44,
      tipoConteudo: 'scorm',
      file: scormFile(fixture.zip),
    });

    expect(calls.filter((c) => c.includes('/activate'))).toHaveLength(1);
    expect(result.prefix).toBe('lms/scorm/6/44/_candidates/pkg-1/');
    expect(result.launchFile).toBe('index.html');
    expect(result.scormVersao).toBe('1.2');
  });

  it('H: namespaced MEL manifest resolves index.html and runs upload → conformance → activate', async () => {
    const fixture = namespacedMelZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({});

    const statuses: string[] = [];
    const result = await uploadStructuredLmsPackage({
      cursoId: 44,
      tipoConteudo: 'scorm',
      file: scormFile(fixture.zip, 'MNT_MEL_V4.zip'),
      onStatus: (s) => statuses.push(s),
    });

    expect(calls.map((c) => c.split('?')[0])).toEqual([
      '/api/lms/cursos/44/scorm-upload',
      '/api/lms/cursos/44/scorm-package-versions/pkg-1/conformance',
      '/api/lms/cursos/44/scorm-package-versions/pkg-1/activate',
    ]);
    expect(result.launchFile).toBe('index.html');
    expect(statuses).toContain('Enviando ZIP...');
    expect(statuses).toContain('Executando Quality Gate...');
    expect(statuses).toContain('Executando validação do player...');
    expect(statuses).toContain('Ativando nova versão...');
    expect(statuses).toContain('Conteúdo substituído com sucesso.');
  });

  it('I: a failure during conformance leaves the previous package active (no activate call)', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({ conformance: { publishable: false, runtime: { status: 'ERROR', errors: ['timeout'] } } });

    await expect(
      uploadStructuredLmsPackage({ cursoId: 44, tipoConteudo: 'scorm', file: scormFile(fixture.zip) }),
    ).rejects.toThrow(/conformidade/i);
    expect(calls.some((c) => c.includes('/activate'))).toBe(false);
  });

  it('rejects a SCORM package whose manifest has no resolvable launch file before any upload', async () => {
    const fixture = scormZip('<manifest><resources></resources></manifest>');
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({});

    await expect(
      uploadStructuredLmsPackage({ cursoId: 44, tipoConteudo: 'scorm', file: scormFile(fixture.zip) }),
    ).rejects.toThrow(/arquivo inicial/i);
    expect(calls).toHaveLength(0);
  });
});

describe('uploadStructuredLmsPackage — H5P keeps the structured file-by-file flow', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    extractBrowserLmsPackageMock.mockReset();
  });

  it('G: H5P still uses content-upload/init + /file + /complete', async () => {
    const fixture = h5pZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls: string[] = [];

    fetchWithAuthMock.mockImplementation(async (url) => {
      const path = String(url);
      calls.push(path.split('?')[0] ?? path);
      if (path.includes('/scorm-upload') || path.includes('/scorm-package-versions')) {
        throw new Error('SCORM package-version endpoints must not be used for H5P');
      }
      if (path.endsWith('/content-upload/init')) return response({ upload_id: 'up-1', status: 'uploading' });
      if (path.includes('/content-upload/file')) return response({ path: 'stored', bytes: 1 });
      if (path.endsWith('/content-upload/complete')) {
        return response({ files_uploaded: fixture.entries.length, prefix: 'lms/h5p/6/70/', tipo_h5p: 'H5P.InteractiveVideo' });
      }
      throw new Error(`Unexpected endpoint: ${path}`);
    });

    const result = await uploadStructuredLmsPackage({
      cursoId: 70,
      tipoConteudo: 'h5p',
      file: scormFile(fixture.zip, 'course.h5p'),
    });

    expect(calls).toContain('/api/lms/cursos/70/content-upload/init');
    expect(calls.some((c) => c.endsWith('/content-upload/file'))).toBe(true);
    expect(calls).toContain('/api/lms/cursos/70/content-upload/complete');
    expect(result.filesUploaded).toBe(fixture.entries.length);
    expect(result.tipoH5p).toBe('H5P.InteractiveVideo');
  });
});
