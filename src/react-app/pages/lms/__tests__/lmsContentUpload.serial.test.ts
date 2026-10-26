import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithAuth } from '@/react-app/config/api';
import { uploadScormInactiveProductionCandidate, uploadStructuredLmsPackage } from '../lmsContentUpload';

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

function scormZipWithCompletionContract(contract: Record<string, unknown>) {
  const base = scormZip();
  const entries = [...base.entries, {
    path: 'airtrust-completion-manifest.json',
    bytes: strToU8(JSON.stringify(contract)),
  }];
  const files: Record<string, Uint8Array> = Object.fromEntries(
    entries.map(({ path, bytes }) => [path, bytes]),
  );
  return { entries, zip: zipSync(files) };
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


describe('production SCORM inactive candidate upload: never activates', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    extractBrowserLmsPackageMock.mockReset();
    vi.stubGlobal('window', { location: { hostname: 'airtrust.online' } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores exact-ZIP SHA only as VALIDATED without conformance or activation', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const statuses: string[] = [];
    const expectedDigest = await crypto.subtle.digest('SHA-256', new Uint8Array(fixture.zip));
    const expectedSha = [...new Uint8Array(expectedDigest)]
      .map(b => b.toString(16).padStart(2, '0')).join('');
    fetchWithAuthMock.mockResolvedValueOnce(response({
      ...CANDIDATE_VALIDATED, packageSha256: expectedSha,
    }, 202));
    const receipt = await uploadScormInactiveProductionCandidate({
      cursoId: 44, file: scormFile(fixture.zip),
      onStatus: status => statuses.push(status),
    });
    expect(receipt).toEqual({
      packageId: 'pkg-1', packageSha256: expectedSha, status: 'VALIDATED',
    });
    expect(statuses.at(-1)).toMatch(/INATIVO.*inalterada/);
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    expect(fetchWithAuthMock.mock.calls[0]?.[0]).toBe('/api/lms/cursos/44/scorm-upload');
    const request = fetchWithAuthMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe('POST');
    expect(request.headers).toMatchObject({ 'Idempotency-Key': 'scorm:' + expectedSha });
    expect((request.body as FormData).has('arquivo')).toBe(true);
    expect(fetchWithAuthMock.mock.calls.some(call => /conformance|activate|content-upload/.test(String(call[0])))).toBe(false);
  });

  it('rejects server-side failed static gate without calling activation', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    fetchWithAuthMock.mockResolvedValueOnce(response({
      ...CANDIDATE_VALIDATED, status: 'REJECTED',
      structural: { status: 'FAIL', errors: ['estrutura incorreta'] },
    }, 202));
    await expect(uploadScormInactiveProductionCandidate({
      cursoId: 44, file: scormFile(fixture.zip),
    })).rejects.toThrow(/Quality Gate estático.*estrutura incorreta/);
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an unverifiable candidate SHA response; never marks receipt successful', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    fetchWithAuthMock.mockResolvedValueOnce(response({
      ...CANDIDATE_VALIDATED, packageSha256: '0'.repeat(64),
    }, 202));
    await expect(uploadScormInactiveProductionCandidate({
      cursoId: 44, file: scormFile(fixture.zip),
    })).rejects.toThrow(/estado, SHA ou gates inválidos/);
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
  });

  it('is host-restricted and never sends a request from staging or preview', async () => {
    vi.unstubAllGlobals();
    await expect(uploadScormInactiveProductionCandidate({
      cursoId: 44, file: scormFile(scormZip().zip),
    })).rejects.toThrow(/disponível apenas em airtrust.online/);
    expect(fetchWithAuthMock).not.toHaveBeenCalled();
  });
});

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

  it('technical PASS without Chromium/WebKit functional certification never activates', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({
      conformance: {
        ...CANDIDATE_VALIDATED,
        conformance: { status: 'PASS', errors: [] },
        runtime: { status: 'PASS', errors: [] },
        functionalCertification: {
          status: 'UNCERTIFIED',
          missing: ['CHROMIUM:FIRST_ACCESS', 'WEBKIT:SUSPEND_RESUME'],
        },
      },
    });

    await expect(uploadStructuredLmsPackage({
      cursoId: 44, tipoConteudo: 'scorm', file: scormFile(fixture.zip),
    })).rejects.toThrow(/conformidade técnica.*certificação funcional.*CHROMIUM:FIRST_ACCESS/s);

    expect(calls.filter((c) => c.includes('/conformance'))).toHaveLength(1);
    expect(calls.some((c) => c.includes('/activate'))).toBe(false);
  });

  const blockedR5Cases: Array<[string, Record<string, unknown>]> = [
    ['private R5 release', { release: { status: 'PRIVATE_CANDIDATE_DO_NOT_ACTIVATE', reviewed: false }, assessment: { mode: 'NONE' } }],
    ['private R5 QA upload (actual MGM RC1 contract)', { release: { status: 'PRIVATE_QA_UPLOAD_ONLY', reviewed: false }, assessment: { mode: 'NONE' } }],
    ['private draft with mixed-case release marker', { release: { status: ' private_review_pending ' }, assessment: { mode: 'NONE' } }],
    ['explicit non-activation without private prefix', { release: { status: 'CANDIDATE_DO_NOT_ACTIVATE' }, assessment: { mode: 'NONE' } }],
    ['external examination R5', { release: { status: 'REVIEWED' }, assessment: { mode: 'EXTERNAL' } }],
  ];
  it.each(blockedR5Cases)('blocks %s before any network upload or activation', async (_label, contract) => {
    const fixture = scormZipWithCompletionContract(contract);
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({});
    const statuses: string[] = [];

    await expect(uploadStructuredLmsPackage({
      cursoId: 44, tipoConteudo: 'scorm',
      file: scormFile(fixture.zip, 'REAL_R5_NAO_ATIVAR.zip'),
      onStatus: status => statuses.push(status),
    })).rejects.toThrow(/bloqueada antes do upload.*conteúdo ativo permanece inalterado/i);
    expect(calls).toHaveLength(0);
    // Local archive validation runs before the preflight; no upload begins.
    expect(statuses).toEqual(['Validando pacote...']);
  });

  it('surfaces ONLY allowlisted Browser Rendering diagnostic metadata and never activates', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({ conformance: {
      ...CANDIDATE_VALIDATED, publishable: false,
      runtime: {
        status: 'ERROR', errors: ['SCORM_BROWSER_INFRASTRUCTURE_ERROR'],
        failureStage: 'BROWSER_LAUNCH', failureCategory: 'BROWSER_QUOTA',
        failureCode: 'TIMEOUT_ERROR',
      },
    } });

    await expect(uploadStructuredLmsPackage({
      cursoId: 44, tipoConteudo: 'scorm', file: scormFile(fixture.zip),
    })).rejects.toThrow(/Diagnóstico seguro do navegador: BROWSER_LAUNCH \/ BROWSER_QUOTA \/ TIMEOUT_ERROR/);
    expect(calls.some(call => call.includes('/activate'))).toBe(false);
  });

  it('keeps an infrastructure timeout distinct from an invalid ZIP and never activates it', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({ conformance: {
      ...CANDIDATE_VALIDATED, publishable: false,
      runtime: {
        status: 'TIMEOUT', errors: ['SCORM_BROWSER_INFRASTRUCTURE_ERROR'],
        failureStage: 'VERIFY_SCORM_INITIALIZATION',
        failureCategory: 'BROWSER_TIMEOUT', failureCode: 'TIMEOUT_ERROR',
      },
    } });
    await expect(uploadStructuredLmsPackage({
      cursoId: 44, tipoConteudo: 'scorm', file: scormFile(fixture.zip),
    })).rejects.toThrow(/recebido como candidato inativo.*infraestrutura.*VERIFY_SCORM_INITIALIZATION.*BROWSER_TIMEOUT/s);
    expect(calls.filter(call => call.includes('/scorm-upload'))).toHaveLength(1);
    expect(calls.filter(call => call.includes('/conformance'))).toHaveLength(1);
    expect(calls.some(call => call.includes('/activate'))).toBe(false);
  });

  it('does not reflect unrecognized diagnostic strings or browser exception details', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({ conformance: {
      ...CANDIDATE_VALIDATED, publishable: false,
      runtime: {
        status: 'ERROR', errors: ['SCORM_BROWSER_INFRASTRUCTURE_ERROR'],
        failureStage: 'BROWSER_LAUNCH https://private.example/token=secret',
        failureCategory: 'BROWSER_ACCESS',
        failureCode: 'CREDENTIALS=secret',
      },
    } });

    try {
      await uploadStructuredLmsPackage({
        cursoId: 44, tipoConteudo: 'scorm', file: scormFile(fixture.zip),
      });
      throw new Error('must fail closed');
    } catch (error) {
      expect(String(error)).toContain('SCORM_BROWSER_INFRASTRUCTURE_ERROR');
      expect(String(error)).toContain('BROWSER_ACCESS');
      expect(String(error)).not.toContain('private.example');
      expect(String(error)).not.toContain('CREDENTIALS=');
    }
    expect(calls.some(call => call.includes('/activate'))).toBe(false);
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

  it('dedup: re-uploading the already-ACTIVE identical ZIP resolves without conformance/activate', async () => {
    const fixture = scormZip();
    extractBrowserLmsPackageMock.mockReturnValue(fixture.entries);
    const calls = wireScorm({
      candidate: {
        packageId: 'pkg-active',
        status: 'ACTIVE',
        publishable: true,
        launchFile: 'index.html',
        r2Prefix: 'lms/scorm/6/44/_candidates/pkg-active/',
        structural: { status: 'PASS', errors: [] },
        completionManifest: { status: 'PASS', errors: [] },
        diagnostics: { status: 'PASS', errors: [] },
      },
    });

    const result = await uploadStructuredLmsPackage({
      cursoId: 44,
      tipoConteudo: 'scorm',
      file: scormFile(fixture.zip),
    });

    expect(calls.some((c) => c.includes('/conformance'))).toBe(false);
    expect(calls.some((c) => c.includes('/activate'))).toBe(false);
    expect(result.prefix).toBe('lms/scorm/6/44/_candidates/pkg-active/');
    expect(result.launchFile).toBe('index.html');
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
