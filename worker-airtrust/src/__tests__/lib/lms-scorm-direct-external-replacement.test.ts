import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAlreadyActiveExternalReplacement, replaceValidatedExternalScorm } from '../../lib/lms/lms-scorm-direct-replacement';

const mocks = vi.hoisted(() => ({ evaluate: vi.fn(), commit: vi.fn(), head: vi.fn(), boundPolicy: vi.fn() }));
vi.mock('../../lib/lms-exams/exam-edition-binding', () => ({
  loadBoundExamAttemptPolicy: mocks.boundPolicy,
}));
const ATTEMPT_POLICY = { maxAttempts: 3, retryDelayMinutes: 0, timeLimitMinutes: null };
vi.mock('../../lib/lms/lms-scorm-formative-service', async (original) => ({
  ...(await original<typeof import('../../lib/lms/lms-scorm-formative-service')>()),
  evaluateFormativeActivation: mocks.evaluate,
}));
vi.mock('../../lib/lms/lms-scorm-package-activation', () => ({
  commitCertifiedScormActivation: mocks.commit,
}));

const SHA = 'f'.repeat(64);
const quality = {
  structural: { status: 'PASS', errors: [], warnings: [] },
  completionManifest: { status: 'PASS', errors: [], warnings: [] },
  diagnostics: { status: 'PASS', errors: [], warnings: [] },
  authoringReview: { externalExam: true, reviewed: false, privateRelease: false },
  certificationProfile: null,
  assessmentPolicy: null,
};
function plan(overrides: Record<string, unknown> = {}) {
  return {
    row: {
      id: 'candidate', status: 'VALIDATED', empresa_id: 6, curso_id: 84,
      package_sha256: SHA, r2_prefix: 'lms/scorm/6/84/_candidates/candidate/',
      launch_file: 'index.html', assessment_policy: null, certification_profile: null,
      validation_result_json: JSON.stringify(quality),
    },
    course: { id: 84, titulo: 'Atendimento e Rampa', tipoConteudo: 'scorm', currentPolicy: 'SCORED', masteryScore: 70 },
    active: { packageId: 'old', packageSha256: 'b'.repeat(64), policy: 'SCORED' },
    impact: { terminalToFreeze: 0, inProgress: 0, notStarted: 0 },
    checks: ['COURSE_IDENTITY', 'CANDIDATE_VALIDATED', 'NOT_ALREADY_ACTIVE']
      .map(id => ({ id, ok: true, detail: 'test' })),
    incomingPolicy: null,
    ...overrides,
  };
}
const params = (overrides: Record<string, unknown> = {}) => ({
  db: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
    }),
  } as unknown as D1Database,
  bucket: { head: mocks.head } as unknown as R2Bucket,
  empresaId: 6, cursoId: 84, packageId: 'candidate', userId: 42,
  confirm: { cursoId: 84, packageSha256: SHA, acknowledgeInProgress: 0 },
  examRuntimeEnabled: true,
  ...overrides,
});

describe('admin EXTERNAL content-only SCORM replacement', () => {
  beforeEach(() => {
    mocks.evaluate.mockReset().mockResolvedValue(plan());
    mocks.commit.mockReset().mockResolvedValue(true);
    mocks.head.mockReset().mockResolvedValue({ key: 'index.html' });
    mocks.boundPolicy.mockReset().mockResolvedValue(ATTEMPT_POLICY);
  });

  it('refuses to activate an EXTERNAL edition with no exam bound to its exact SHA (learners would be stuck)', async () => {
    mocks.boundPolicy.mockResolvedValue(null);
    await expect(replaceValidatedExternalScorm(params())).rejects.toMatchObject({
      statusCode: 409, code: 'SCORM_EXTERNAL_EXAM_NOT_BOUND',
    });
    expect(mocks.boundPolicy).toHaveBeenCalledWith(expect.anything(),
      { empresaId: 6, cursoId: 84, packageSha256: SHA });
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('refuses to activate an EXTERNAL edition when the learner exam runtime is disabled for the tenant', async () => {
    await expect(replaceValidatedExternalScorm(params({ examRuntimeEnabled: false }))).rejects.toMatchObject({
      statusCode: 409, code: 'SCORM_EXTERNAL_EXAM_RUNTIME_DISABLED',
    });
    expect(mocks.boundPolicy).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('fails closed when the binding lookup errors', async () => {
    mocks.boundPolicy.mockRejectedValue(new Error('D1_UNAVAILABLE'));
    await expect(replaceValidatedExternalScorm(params())).rejects.toThrow('D1_UNAVAILABLE');
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('does not require an AirTrust exam for scored-in-SCO editions', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({ ...p, row: {
      ...p.row, validation_result_json: JSON.stringify({
        ...quality, authoringReview: { externalExam: false, reviewed: true, privateRelease: false },
      }),
    } });
    mocks.boundPolicy.mockResolvedValue(null);
    const result = await replaceValidatedExternalScorm(params({ examRuntimeEnabled: false }), 'SCORM');
    expect(result).toEqual(expect.objectContaining({ examMode: 'SCORM', status: 'ACTIVE' }));
    expect(mocks.boundPolicy).not.toHaveBeenCalled();
  });

  it('activates the exact validated SHA without signed external attestation and retains SCORED exam policy', async () => {
    const result = await replaceValidatedExternalScorm(params());
    expect(result).toEqual(expect.objectContaining({
      status: 'ACTIVE', assessmentPolicy: 'SCORED', examMode: 'EXTERNAL',
      packageSha256: SHA, validationMode: 'SERVER_STATIC_GATE',
    }));
    expect(mocks.head).toHaveBeenCalledWith('lms/scorm/6/84/_candidates/candidate/index.html');
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 6, cursoId: 84, packageSha256: SHA,
      policy: { incoming: 'SCORED' },
      observed: { activePackageId: 'old', coursePolicy: 'SCORED' },
    }));
  });

  it('does not allow unauthenticated actors', async () => {
    await expect(replaceValidatedExternalScorm(params({ userId: null }))).rejects.toThrow(/administrador/);
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('requires the exact tenant-scoped course and SHA confirmation even if policy does not change', async () => {
    await expect(replaceValidatedExternalScorm(params({
      confirm: { cursoId: 85, packageSha256: SHA },
    }))).rejects.toThrow(/SHA-256/);
    expect(mocks.commit).not.toHaveBeenCalled();
    await expect(replaceValidatedExternalScorm(params({
      confirm: { cursoId: 84, packageSha256: 'a'.repeat(64) },
    }))).rejects.toThrow(/SHA-256/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('rejects private DO_NOT_ACTIVATE packages even when static status is PASS', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({ ...p, row: {
      ...p.row, validation_result_json: JSON.stringify({
        ...quality, authoringReview: { ...quality.authoringReview, privateRelease: true },
      }),
    } });
    await expect(replaceValidatedExternalScorm(params())).rejects.toThrow(/validação do conteúdo/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('does not accept a self-asserted EXTERNAL manifest without the server-derived review marker', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({ ...p, row: {
      ...p.row, validation_result_json: JSON.stringify({
        ...quality, authoringReview: { externalExam: false, reviewed: true, privateRelease: false },
      }),
    } });
    await expect(replaceValidatedExternalScorm(params())).rejects.toThrow(/validação do conteúdo/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('blocks static failures and preserves the current edition', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({ ...p, row: {
      ...p.row, validation_result_json: JSON.stringify({
        ...quality, diagnostics: { status: 'FAIL' },
      }),
    } });
    await expect(replaceValidatedExternalScorm(params())).rejects.toThrow(/validação do conteúdo/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('keeps scored exam enforcement: refuses courses without a positive threshold', async () => {
    mocks.evaluate.mockResolvedValue(plan({ course: {
      id: 84, titulo: 'AA', tipoConteudo: 'scorm', currentPolicy: 'SCORED', masteryScore: 0,
    } }));
    await expect(replaceValidatedExternalScorm(params())).rejects.toThrow(/nota mínima positiva/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('preserves the course when R2 launch readback is missing', async () => {
    mocks.head.mockResolvedValue(null);
    await expect(replaceValidatedExternalScorm(params())).rejects.toThrow(/não está disponível/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('does not activate after a failed server preflight', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({ ...p,
      checks: [...p.checks, { id: 'COURSE_IDENTITY', ok: false, detail: 'different tenant' }],
    });
    await expect(replaceValidatedExternalScorm(params())).rejects.toThrow(/incompatível/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('preserves the ACTIVE pointer when a competing edition wins CAS', async () => {
    mocks.commit.mockResolvedValue(false);
    await expect(replaceValidatedExternalScorm(params())).rejects.toThrow(/mudou durante/);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it('readback does not claim active if its exact SHA, pointer, audit or asset is absent', async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
      }),
    } as unknown as D1Database;
    expect(await readAlreadyActiveExternalReplacement({
      db, bucket: params().bucket, empresaId: 6, cursoId: 84,
      packageId: 'candidate', packageSha256: SHA,
    })).toBeNull();
  });

  it('directly activates a valid scored-in-SCO edition without a separate homologation ceremony', async () => {
    const previous = plan();
    const scored = { ...quality, authoringReview: { ...quality.authoringReview, externalExam: false } };
    mocks.evaluate.mockResolvedValue({
      ...previous, row: { ...previous.row, validation_result_json: JSON.stringify(scored) },
    });
    const result = await replaceValidatedExternalScorm(params(), 'SCORM');
    expect(result).toMatchObject({
      status: 'ACTIVE', assessmentPolicy: 'SCORED', examMode: 'SCORM',
      validationMode: 'SERVER_STATIC_GATE',
    });
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({
      policy: { incoming: 'SCORED' }, publishCourse: true,
    }));
  });

  it('keeps scored-in-SCO activation separate from external exam declarations', async () => {
    await expect(replaceValidatedExternalScorm(params(), 'SCORM'))
      .rejects.toThrow(/validação do conteúdo/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('refuses a scored-in-SCO ZIP marked private even when its structure is valid', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({
      ...p, row: { ...p.row, validation_result_json: JSON.stringify({
        ...quality, authoringReview: { externalExam: false, privateRelease: true, reviewed: false },
      }) },
    });
    await expect(replaceValidatedExternalScorm(params(), 'SCORM'))
      .rejects.toThrow(/validação do conteúdo/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('does not allow a scored-in-SCO package to use the EXTERNAL content route', async () => {
    const p = plan();
    mocks.evaluate.mockResolvedValue({ ...p, row: {
      ...p.row, certification_profile: 'FORMATIVE_NO_EXAM_V1',
    } });
    await expect(replaceValidatedExternalScorm(params())).rejects.toThrow(/validação do conteúdo/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('allows explicitly-formative EXTERNAL study only with zero enrollments', async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ n: 0 }) }),
      }),
    } as unknown as D1Database;
    const result = await replaceValidatedExternalScorm(params({
      db, confirm: { cursoId: 84, packageSha256: SHA, incomingExternalPolicy: 'FORMATIVE' },
    }));
    expect(result).toMatchObject({
      status: 'ACTIVE', assessmentPolicy: 'FORMATIVE', examMode: 'EXTERNAL',
    });
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({
      policy: { incoming: 'FORMATIVE', requireNoEnrollments: true },
      observed: { coursePolicy: 'SCORED', activePackageId: 'old' },
    }));
  });

  it('refuses an external-to-formative policy change with existing enrollments', async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ n: 1 }) }),
      }),
    } as unknown as D1Database;
    await expect(replaceValidatedExternalScorm(params({
      db, confirm: { cursoId: 84, packageSha256: SHA, incomingExternalPolicy: 'FORMATIVE' },
    }))).rejects.toThrow(/zero matrículas/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('keeps a future EXTERNAL replacement formative when course policy is formative', async () => {
    mocks.evaluate.mockResolvedValue(plan({ course: {
      id: 84, titulo: 'LOSA', tipoConteudo: 'scorm', currentPolicy: 'FORMATIVE', masteryScore: null,
    } }));
    const result = await replaceValidatedExternalScorm(params());
    expect(result).toMatchObject({ assessmentPolicy: 'FORMATIVE', examMode: 'EXTERNAL' });
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({
      policy: { incoming: 'FORMATIVE' },
    }));
  });

  it('never allows a scored-in-SCO package to claim formative external semantics', async () => {
    await expect(replaceValidatedExternalScorm(params({
      confirm: { cursoId: 84, packageSha256: SHA, incomingExternalPolicy: 'FORMATIVE' },
    }), 'SCORM')).rejects.toThrow(/Somente conteúdo/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('enforces the zero-enrollment guard for a same-policy FORMATIVE -> FORMATIVE release', async () => {
    mocks.evaluate.mockResolvedValue(plan({ course: {
      id: 84, titulo: 'LOSA', tipoConteudo: 'scorm', currentPolicy: 'FORMATIVE', masteryScore: null,
    } }));
    const db = {
      prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ n: 0 }),
      }) }),
    } as unknown as D1Database;
    const res = await replaceValidatedExternalScorm(params({
      db, confirm: { cursoId: 84, packageSha256: SHA,
        incomingExternalPolicy: 'FORMATIVE', requireNoEnrollments: true },
    }));
    expect(res).toMatchObject({ status: 'ACTIVE', assessmentPolicy: 'FORMATIVE', examMode: 'EXTERNAL' });
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({
      policy: { incoming: 'FORMATIVE', requireNoEnrollments: true },
      observed: { activePackageId: 'old', coursePolicy: 'FORMATIVE' },
    }));
  });

  it('refuses same-policy guarded release when any enrollment already exists', async () => {
    mocks.evaluate.mockResolvedValue(plan({ course: {
      id: 84, titulo: 'LOSA', tipoConteudo: 'scorm', currentPolicy: 'FORMATIVE', masteryScore: null,
    } }));
    const db = {
      prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ n: 1 }),
      }) }),
    } as unknown as D1Database;
    await expect(replaceValidatedExternalScorm(params({
      db, confirm: { cursoId: 84, packageSha256: SHA,
        incomingExternalPolicy: 'FORMATIVE', requireNoEnrollments: true },
    }))).rejects.toThrow(/zero matrículas/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('does not retry a guarded replacement rejected by transactional CAS after enrollment appears', async () => {
    mocks.evaluate.mockResolvedValue(plan({ course: {
      id: 84, titulo: 'LOSA', tipoConteudo: 'scorm', currentPolicy: 'FORMATIVE', masteryScore: null,
    } }));
    const db = {
      prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ n: 0 }),
      }) }),
    } as unknown as D1Database;
    mocks.commit.mockResolvedValue(false);
    await expect(replaceValidatedExternalScorm(params({
      db, confirm: { cursoId: 84, packageSha256: SHA,
        incomingExternalPolicy: 'FORMATIVE', requireNoEnrollments: true },
    }))).rejects.toThrow(/mudou durante/);
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({
      policy: { incoming: 'FORMATIVE', requireNoEnrollments: true },
    }));
  });

});
