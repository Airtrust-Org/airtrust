import { beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceValidatedFormativeScorm } from '../../lib/lms/lms-scorm-direct-replacement';

const mocks = vi.hoisted(() => ({ evaluate: vi.fn(), commit: vi.fn(), head: vi.fn(), reclassify: vi.fn() }));
vi.mock('../../lib/lms/lms-scorm-formative-service', async (original) => ({
  ...(await original<typeof import('../../lib/lms/lms-scorm-formative-service')>()),
  evaluateFormativeActivation: mocks.evaluate,
}));
vi.mock('../../lib/lms/lms-scorm-legacy-formative-reclassification', () => ({
  reclassifyLegacyFormativeCandidate: mocks.reclassify,
}));
vi.mock('../../lib/lms/lms-scorm-package-activation', () => ({
  commitCertifiedScormActivation: mocks.commit,
}));

const SHA = 'a'.repeat(64);
const quality = {
  structural: { status: 'PASS', errors: [], warnings: [] },
  completionManifest: { status: 'PASS', errors: [], warnings: [] },
  diagnostics: { status: 'PASS', errors: [], warnings: [] },
  certificationProfile: 'FORMATIVE_NO_EXAM_V1',
  assessmentPolicy: 'FORMATIVE',
  formativeContract: { eligible: true, requiredSlides: 101, requiredActivities: 14 },
};
function plan(overrides: Record<string, unknown> = {}) {
  return {
    row: {
      id: 'candidate', status: 'VALIDATED', empresa_id: 6, curso_id: 26,
      package_sha256: SHA, r2_prefix: 'lms/scorm/6/26/_candidates/candidate/',
      launch_file: 'index.html', assessment_policy: 'FORMATIVE',
      certification_profile: 'FORMATIVE_NO_EXAM_V1',
      validation_result_json: JSON.stringify(quality),
    },
    course: { id: 26, titulo: 'MGM', tipoConteudo: 'scorm', currentPolicy: 'SCORED', masteryScore: 70 },
    active: { packageId: 'old', packageSha256: 'b'.repeat(64), policy: 'SCORED' },
    impact: { terminalToFreeze: 18, inProgress: 3, notStarted: 3 },
    checks: ['COURSE_IDENTITY', 'CANDIDATE_VALIDATED', 'NOT_ALREADY_ACTIVE',
      'PROFILE_ELIGIBLE', 'JOURNEY_EVIDENCE', 'ADMIN_APPROVAL'].map(id => ({
        id, ok: !['JOURNEY_EVIDENCE', 'ADMIN_APPROVAL'].includes(id), detail: 'test',
      })),
    incomingPolicy: 'FORMATIVE',
    ...overrides,
  };
}
const makeParams = (overrides: Record<string, unknown> = {}) => ({
  db: {} as D1Database, bucket: { head: mocks.head } as unknown as R2Bucket,
  empresaId: 6, cursoId: 26, packageId: 'candidate', userId: 1,
  confirm: { cursoId: 26, packageSha256: SHA, acknowledgeInProgress: 3 },
  ...overrides,
});

describe('admin direct SCORM replacement — fail closed', () => {
  beforeEach(() => {
    mocks.evaluate.mockReset().mockResolvedValue(plan());
    mocks.head.mockReset().mockResolvedValue({ key: 'index.html' });
    mocks.commit.mockReset().mockResolvedValue(true);
    mocks.reclassify.mockReset().mockResolvedValue(true);
  });

  it('activates only the same tenant/course/SHA and preserves prior course policy in CAS', async () => {
    const receipt = await replaceValidatedFormativeScorm(makeParams());
    expect(receipt.status).toBe('ACTIVE');
    expect(receipt.validationMode).toBe('SERVER_STATIC_GATE');
    expect(mocks.head).toHaveBeenCalledWith('lms/scorm/6/26/_candidates/candidate/index.html');
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 6, cursoId: 26, packageId: 'candidate', packageSha256: SHA,
      observed: { activePackageId: 'old', coursePolicy: 'SCORED' },
      policy: { incoming: 'FORMATIVE' },
    }));
  });

  it('repairs a legacy VALIDATED candidate and retries preflight before atomic activation', async () => {
    const modern = plan();
    const legacy = {
      ...modern, incomingPolicy: null,
      checks: modern.checks.filter((check) => check.id !== 'PROFILE_ELIGIBLE'),
      row: { ...modern.row, certification_profile: null, assessment_policy: null,
        validation_result_json: JSON.stringify({
          ...quality, certificationProfile: undefined,
          assessmentPolicy: undefined, formativeContract: undefined,
        }),
      },
    };
    mocks.evaluate.mockResolvedValueOnce(legacy).mockResolvedValueOnce(modern);
    expect((await replaceValidatedFormativeScorm(makeParams())).status).toBe('ACTIVE');
    expect(mocks.reclassify).toHaveBeenCalledOnce();
    expect(mocks.evaluate).toHaveBeenCalledTimes(2);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it('preserves active edition when a legacy candidate cannot be safely reclassified', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({
      ...p, row: { ...p.row, certification_profile: null, assessment_policy: null },
      incomingPolicy: null,
    });
    mocks.reclassify.mockResolvedValue(false);
    await expect(replaceValidatedFormativeScorm(makeParams())).rejects.toThrow(/perfil formativo/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('refuses unauthenticated or invalid administrator IDs before reading D1', async () => {
    await expect(replaceValidatedFormativeScorm(makeParams({ userId: null }))).rejects.toThrow(/administrador/);
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it('refuses cross-course or wrong-SHA confirmation', async () => {
    await expect(replaceValidatedFormativeScorm(makeParams({
      confirm: { cursoId: 27, packageSha256: SHA, acknowledgeInProgress: 3 },
    }))).rejects.toThrow(/SHA-256/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('requires exact acknowledgement of ongoing enrollments', async () => {
    await expect(replaceValidatedFormativeScorm(makeParams({
      confirm: { cursoId: 26, packageSha256: SHA, acknowledgeInProgress: 2 },
    }))).rejects.toThrow(/matrícula/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('never activates scored/exam packages through the direct formative route', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({
      ...p, row: { ...p.row, certification_profile: null, assessment_policy: 'SCORED' },
    });
    await expect(replaceValidatedFormativeScorm(makeParams())).rejects.toThrow(/perfil formativo/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('rejects a failed static section even with VALIDATED stored status', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({
      ...p, row: { ...p.row, validation_result_json: JSON.stringify({
        ...quality, completionManifest: { status: 'FAIL' },
      }) },
    });
    await expect(replaceValidatedFormativeScorm(makeParams())).rejects.toThrow(/validação automática/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('fails closed if the launch asset has disappeared from R2', async () => {
    mocks.head.mockResolvedValue(null);
    await expect(replaceValidatedFormativeScorm(makeParams())).rejects.toThrow(/não está disponível/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('cannot claim success if the CAS transaction loses a race', async () => {
    mocks.commit.mockResolvedValue(false);
    await expect(replaceValidatedFormativeScorm(makeParams())).rejects.toThrow(/mudou durante/);
  });

  it('blocks identity/validation failures other than the retired approval ceremony', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({
      ...p, checks: [...p.checks, { id: 'COURSE_IDENTITY', ok: false, detail: 'wrong' }],
    });
    await expect(replaceValidatedFormativeScorm(makeParams())).rejects.toThrow(/incompatível/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
