import { createHash } from 'node:crypto';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { createScormPackageCandidate } from '../../lib/lms/lms-scorm-package-version-service';

const mocks = vi.hoisted(() => ({
  static: vi.fn(), full: vi.fn(), quality: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('../../lib/lms/lms-package-validator', async (original) => ({
  ...(await original<typeof import('../../lib/lms/lms-package-validator')>()),
  extractScormStaticGateMetadata: mocks.static,
  extractAndValidateLmsPackage: mocks.full,
}));
vi.mock('../../lib/lms/lms-scorm-quality-gate', async (original) => ({
  ...(await original<typeof import('../../lib/lms/lms-scorm-quality-gate')>()),
  validateScormPackageQuality: mocks.quality,
}));
vi.mock('../../lib/lms/lms-scorm-rejected-revalidation', () => ({
  revalidateRejectedFormativeScormCandidate: mocks.revalidate,
}));

const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
const sha = createHash('sha256').update(bytes).digest('hex');
const row = {
  id: 'fd358353-76ab-4c61-b9b3-e4a424d5bb5e', empresa_id: 6, curso_id: 26,
  package_sha256: sha,
  r2_prefix: 'lms/scorm/6/26/_candidates/fd358353-76ab-4c61-b9b3-e4a424d5bb5e/',
  launch_file: 'index.html', scorm_versao: '1.2', status: 'REJECTED',
  validation_result_json: JSON.stringify({ structural: { status: 'FAIL' } }),
  assessment_policy: null, certification_profile: null,
};
const pkg = {
  tipoConteudo: 'scorm', scormVersao: '1.2', tipoH5p: null,
  launchFile: 'index.html', entries: [{ path: 'index.html', data: bytes }],
  totalUncompressedBytes: bytes.length,
};
const pass = { status: 'PASS', errors: [], warnings: [] };
const quality = {
  validatorVersion: 'AIRTRUST_SCORM_PACKAGE_QUALITY_GATE_V1',
  structural: pass, completionManifest: pass, diagnostics: pass,
  certificationProfile: 'FORMATIVE_NO_EXAM_V1', assessmentPolicy: 'FORMATIVE',
  formativeContract: { eligible: true, requiredSlides: 101, requiredActivities: 14 },
};

function makeParams(status = 'REJECTED') {
  const original = { ...row, status };
  const bind = vi.fn().mockReturnValue({
    first: vi.fn().mockResolvedValue(original),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
  });
  const db = { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database;
  const bucket = { put: vi.fn(), list: vi.fn() } as unknown as R2Bucket;
  return { db, bucket, empresaId: 6, cursoId: 26, userId: 17, bytes, arquivoNome: 'MGM.zip' };
}

describe('same-SHA SCORM candidate upload lifecycle', () => {
  beforeEach(() => {
    mocks.static.mockReset().mockReturnValue(pkg);
    mocks.full.mockReset().mockReturnValue(pkg);
    mocks.quality.mockReset().mockReturnValue(quality);
    mocks.revalidate.mockReset().mockResolvedValue(true);
  });

  it('reruns the full current gate and invokes explicit revalidation for an old REJECTED row', async () => {
    const params = makeParams();
    const result = await createScormPackageCandidate(params);
    expect(result.status).toBe('VALIDATED');
    expect(result.packageId).toBe(row.id);
    expect(result.packageSha256).toBe(sha);
    expect(result.assessmentPolicy).toBe('FORMATIVE');
    expect(mocks.static).toHaveBeenCalledOnce();
    expect(mocks.full).toHaveBeenCalledOnce();
    expect(mocks.quality).toHaveBeenCalledTimes(2);
    expect(mocks.revalidate).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 6, cursoId: 26, packageSha256: sha,
    }));
  });

  it('does not revive a rejected same-SHA ZIP when fresh static validation fails', async () => {
    const params = makeParams();
    mocks.quality.mockReturnValue({
      ...quality, structural: { status: 'FAIL', errors: ['new gate failure'], warnings: [] },
    });
    const result = await createScormPackageCandidate(params);
    expect(result.status).toBe('REJECTED');
    expect(result.structural?.errors).toContain('new gate failure');
    expect(mocks.full).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(params.bucket.put).not.toHaveBeenCalled();
  });

  it('does not retry a non-rejected same-SHA candidate', async () => {
    const params = makeParams('VALIDATED');
    const result = await createScormPackageCandidate(params);
    expect(result.status).toBe('VALIDATED');
    expect(mocks.full).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
