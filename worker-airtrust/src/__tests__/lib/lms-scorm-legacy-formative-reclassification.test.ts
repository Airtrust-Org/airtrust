import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reclassifyLegacyFormativeCandidate } from '../../lib/lms/lms-scorm-legacy-formative-reclassification';
import type { FormativeCandidateRow } from '../../lib/lms/lms-scorm-formative-service';

const SHA = 'a'.repeat(64);
const id = 'fd358353-76ab-4c61-b9b3-e4a424d5bb5e';
const prefix = `lms/scorm/6/26/_candidates/${id}/`;
const manifest = {
  schemaVersion: 1, diagnosticsVersion: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',
  scormVersion: '1.2', courseId: '26', packageVersion: 'MGM',
  content: { requiredSlides: ['modulo-1'] },
  assessment: { mode: 'NONE', scoringBySCORM: false, requiredInteractions: [], successStatus: 'completed' },
  formative: { scored: false, requiredActivities: ['modulo-1'] },
  completion: { strategy: 'AIRTRUST_COMPLETION_CONTRACT_V1',
    passStatusFromSCORM: false, workerApprovalRequired: true },
  diagnostics: { currentSlide: true, slides: true, assessment: true, packageStatus: true, updatedAt: true },
};
const previous = {
  validatorVersion: 'AIRTRUST_SCORM_PACKAGE_QUALITY_GATE_V1',
  structural: { status: 'PASS', errors: [], warnings: [] },
  completionManifest: { status: 'PASS', errors: [], warnings: [] },
  diagnostics: { status: 'PASS', errors: [], warnings: [] },
  uploadMetadata: { originalFilename: 'MGM_CURSO26_SUBSTITUICAO_DO_ATUAL_SCORM12.zip' },
};
const encode = (obj: unknown) => new TextEncoder().encode(typeof obj === 'string' ? obj : JSON.stringify(obj));
const fakeObject = (payload: Uint8Array) => ({ arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) });

function harness(overrides: Partial<FormativeCandidateRow> = {}, alternativeManifest: unknown = manifest) {
  const row = {
    id, empresa_id: 6, curso_id: 26, package_sha256: SHA, r2_prefix: prefix,
    launch_file: 'index.html', status: 'VALIDATED', certification_profile: null,
    assessment_policy: null, validation_result_json: JSON.stringify(previous),
    previous_active_package_id: null,
    ...overrides,
  } as FormativeCandidateRow;
  const members = new Map<string, Uint8Array>([
    ['imsmanifest.xml', encode('<manifest><resources><resource href="index.html"/></resources></manifest>')],
    ['airtrust-completion-manifest.json', encode(alternativeManifest)],
    ['index.html', encode('<html>ok</html>')],
    ['course-model.js', encode('window.AIRTRUST_COURSE_MODEL={};')],
  ]);
  const batch = vi.fn().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  const prepared: Array<{ sql: string; values?: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const query: { sql: string; values?: unknown[] } = { sql };
    prepared.push(query);
    return { bind: (...args: unknown[]) => { query.values = args; return { __query: query }; } };
  });
  const list = vi.fn(async () => ({
    objects: [...members].map(([p,b]) => ({ key: prefix + p, size: b.length })),
    truncated: false,
  }));
  const get = vi.fn(async (key: string) => {
    const bytes = members.get(key.slice(prefix.length));
    return bytes ? fakeObject(bytes) : null;
  });
  const db = { batch, prepare } as unknown as D1Database;
  const bucket = { list, get } as unknown as R2Bucket;
  const call = () => reclassifyLegacyFormativeCandidate({
    db, bucket, empresaId: 6, cursoId: 26, packageId: id, actorId: 1, row,
  });
  return { row, call, batch, prepared, list, get, members };
}

describe('legacy SCORM validated candidate reclassification', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('revalidates trusted R2 metadata and CAS-pins the formative profile for the SAME immutable ZIP', async () => {
    const h = harness();
    expect(await h.call()).toBe(true);
    expect(h.batch).toHaveBeenCalledOnce();
    expect(h.list).toHaveBeenCalledOnce();
    const update = h.prepared[0]!;
    expect(update.sql).toContain("status='VALIDATED'");
    expect(update.sql).toContain("assessment_policy IS NULL AND certification_profile IS NULL");
    expect(update.values?.slice(2,9)).toEqual([id,6,26,SHA,prefix,JSON.stringify(previous)]);
    const updated = JSON.parse(String(update.values?.[1]));
    expect(updated.certificationProfile).toBe('FORMATIVE_NO_EXAM_V1');
    expect(updated.assessmentPolicy).toBe('FORMATIVE');
    expect(updated.formativeContract).toMatchObject({ eligible: true, requiredSlides: 1, requiredActivities: 1 });
    expect(updated.uploadMetadata.originalFilename).toContain('MGM');
    expect(h.prepared[1]?.sql).toContain('VALIDATION_PASSED');
  });

  it('refuses an already scored policy, no list and no mutation', async () => {
    const h = harness({ assessment_policy: 'SCORED' });
    expect(await h.call()).toBe(false);
    expect(h.list).not.toHaveBeenCalled();
    expect(h.batch).not.toHaveBeenCalled();
  });

  it('refuses wrong course, tenant or candidate R2 location', async () => {
    const h = harness({ r2_prefix: 'lms/scorm/7/26/_candidates/' + id + '/' });
    expect(await h.call()).toBe(false);
    expect(h.list).not.toHaveBeenCalled();
  });

  it('refuses a prior failed validation receipt', async () => {
    const h = harness({ validation_result_json: JSON.stringify({
      ...previous, structural: { status: 'FAIL', errors: ['unsafe ZIP'] },
    }) });
    expect(await h.call()).toBe(false);
    expect(h.batch).not.toHaveBeenCalled();
  });

  it('refuses scored/external assessments derived from actual R2 manifest', async () => {
    const h = harness({}, { ...manifest, assessment: { mode: 'EXTERNAL', scoringBySCORM: false, requiredInteractions: [] } });
    expect(await h.call()).toBe(false);
    expect(h.batch).not.toHaveBeenCalled();
  });

  it('refuses missing R2 content/manifest without altering the course', async () => {
    const h = harness();
    h.members.delete('airtrust-completion-manifest.json');
    expect(await h.call()).toBe(false);
    expect(h.batch).not.toHaveBeenCalled();
  });

  it('refuses a missing original M8 course model', async () => {
    const h = harness();
    h.members.delete('course-model.js');
    expect(await h.call()).toBe(false);
    expect(h.batch).not.toHaveBeenCalled();
  });

  it('refuses wrong or missing launch file', async () => {
    const h = harness({ launch_file: 'missing.html' });
    expect(await h.call()).toBe(false);
    expect(h.batch).not.toHaveBeenCalled();
  });

  it('never reports an upgrade when the CAS update lost a race', async () => {
    const h = harness();
    h.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    expect(await h.call()).toBe(false);
  });
});
