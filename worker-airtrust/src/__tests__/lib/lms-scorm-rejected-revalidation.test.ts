import { describe, expect, it, vi } from 'vitest';
import { FORMATIVE_PROFILE } from '../../lib/lms/lms-scorm-formative-profile';
import { revalidateRejectedFormativeScormCandidate } from '../../lib/lms/lms-scorm-rejected-revalidation';
import type { ScormQualityGateResult } from '../../lib/lms/lms-scorm-quality-gate';
import type { ValidatedLmsPackage } from '../../lib/lms/lms-package-validator';

const candidateId = 'fd358353-76ab-4c61-b9b3-e4a424d5bb5e';
const hash = 'a'.repeat(64);
const prefix = `lms/scorm/6/26/_candidates/${candidateId}/`;
const pass = { status: 'PASS', errors: [], warnings: [] } as const;

function fixture() {
  const row = {
    id: candidateId, empresa_id: 6, curso_id: 26, package_sha256: hash,
    r2_prefix: prefix, launch_file: 'index.html', status: 'REJECTED',
    assessment_policy: null, certification_profile: null,
    validation_result_json: JSON.stringify({ structural: { status: 'FAIL' } }),
  };
  const pkg = {
    tipoConteudo: 'scorm', scormVersao: '1.2', launchFile: 'index.html',
    tipoH5p: null, totalUncompressedBytes: 9,
    entries: [
      { path: 'imsmanifest.xml', data: new Uint8Array([1]) },
      { path: 'airtrust-completion-manifest.json', data: new Uint8Array([2]) },
      { path: 'course-model.js', data: new Uint8Array([3]) },
      { path: 'index.html', data: new Uint8Array([4]) },
    ],
  } as ValidatedLmsPackage;
  const quality = {
    validatorVersion: 'AIRTRUST_SCORM_PACKAGE_QUALITY_GATE_V1',
    structural: { ...pass }, completionManifest: { ...pass }, diagnostics: { ...pass },
    certificationProfile: FORMATIVE_PROFILE, assessmentPolicy: 'FORMATIVE',
    formativeContract: { eligible: true, requiredSlides: 101, requiredActivities: 14 },
  } as unknown as ScormQualityGateResult;
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (...values: unknown[]) => {
        statements.push({ sql, values });
        return { sql, values };
      },
    })),
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]),
  } as unknown as D1Database;
  const bucket = { put: vi.fn().mockResolvedValue({}) } as unknown as R2Bucket;
  const params = {
    db, bucket, row, empresaId: 6, cursoId: 26, actorId: 17,
    packageSha256: hash, pkg, quality, storedQualityJson: JSON.stringify(quality),
  };
  return { row, pkg, quality, db, bucket, statements, params };
}

describe('explicit rejected SCORM same-SHA revalidation', () => {
  it('stores every member before CAS-pinning the now valid same-SHA candidate and audits the retry', async () => {
    const f = fixture();
    expect(await revalidateRejectedFormativeScormCandidate(f.params)).toBe(true);
    expect(f.bucket.put).toHaveBeenCalledTimes(4);
    expect(f.bucket.put).toHaveBeenCalledWith(prefix + 'index.html', f.pkg.entries[3]?.data,
      expect.objectContaining({ httpMetadata: expect.objectContaining({ contentType: 'text/html; charset=utf-8' }) }));
    expect(f.db.batch).toHaveBeenCalledOnce();
    expect(f.statements[0]?.sql).toContain("status='REJECTED'");
    expect(f.statements[0]?.sql).toContain("assessment_policy IS NULL");
    expect(f.statements[0]?.values).toContain(hash);
    expect(f.statements[0]?.values).toContain(f.row.validation_result_json);
    expect(f.statements[1]?.sql).toContain("WHERE changes()=1");
    expect(f.statements[1]?.values).toContain('EXPLICIT_SAME_SHA_REUPLOAD_CURRENT_STATIC_GATE_PASS');
  });

  it('never changes an ACTIVE or VALIDATED edition, or a rejected scored candidate', async () => {
    for (const change of [{ status: 'ACTIVE' }, { status: 'VALIDATED' },
      { assessment_policy: 'SCORED' }, { certification_profile: 'SCORED_FINAL' }]) {
      const f = fixture();
      Object.assign(f.row, change);
      expect(await revalidateRejectedFormativeScormCandidate(f.params)).toBe(false);
      expect(f.bucket.put).not.toHaveBeenCalled();
      expect(f.db.batch).not.toHaveBeenCalled();
    }
  });

  it('fails closed on wrong tenant, course, SHA or stored R2 prefix', async () => {
    for (const change of [{ empresa_id: 7 }, { curso_id: 27 },
      { package_sha256: 'b'.repeat(64) }, { r2_prefix: 'lms/scorm/7/26/_candidates/' + candidateId + '/' }]) {
      const f = fixture();
      Object.assign(f.row, change);
      expect(await revalidateRejectedFormativeScormCandidate(f.params)).toBe(false);
      expect(f.bucket.put).not.toHaveBeenCalled();
    }
  });

  it('requires all three gates and verified formative eligibility', async () => {
    for (const change of [
      { structural: { status: 'FAIL' } },
      { completionManifest: { status: 'FAIL' } },
      { diagnostics: { status: 'FAIL' } },
      { assessmentPolicy: 'SCORED' },
      { formativeContract: { eligible: false, requiredSlides: 101, requiredActivities: 14 } },
    ]) {
      const f = fixture();
      Object.assign(f.quality, change);
      expect(await revalidateRejectedFormativeScormCandidate(f.params)).toBe(false);
      expect(f.bucket.put).not.toHaveBeenCalled();
      expect(f.db.batch).not.toHaveBeenCalled();
    }
  });

  it('never flips D1 status when an R2 upload fails', async () => {
    const f = fixture();
    vi.mocked(f.bucket.put).mockRejectedValue(new Error('R2 unavailable'));
    await expect(revalidateRejectedFormativeScormCandidate(f.params)).rejects.toThrow('R2 unavailable');
    expect(f.db.batch).not.toHaveBeenCalled();
  });

  it('does not pretend success when a concurrent CAS lost', async () => {
    const f = fixture();
    vi.mocked(f.db.batch).mockResolvedValueOnce([
      { meta: { changes: 0 } }, { meta: { changes: 0 } },
    ] as never);
    expect(await revalidateRejectedFormativeScormCandidate(f.params)).toBe(false);
  });
});
