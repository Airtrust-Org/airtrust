import { describe, expect, it } from 'vitest';
import {
  evaluateManifestStudyCoverage,
  parseActiveCompletionManifest,
  readActiveCompletionManifest,
  type ActiveCompletionManifest,
} from '../../services/lms-completion-manifest-evidence';
import {
  evaluateScormClosureReadiness,
  type ScormCommitLike,
} from '../../services/lms-matricula-runtime-domain';
import {
  loadManifestEvidenceForEnrollment,
  loadScormManifestClosureEvidence,
  type ScormManifestClosureEvidence,
} from '../../services/lms-scorm-completion-context';

const IDS = ['s1', 's2', 's3', 's4'];
const manifest = (over: Partial<ActiveCompletionManifest> = {}): ActiveCompletionManifest => ({
  packageVersion: 'PKG-V2', requiredSlideIds: IDS, assessmentMode: 'SCORM', workerApprovalRequired: false, ...over,
});
const ledger = (viewed: number[], total = 4, loc = '4/4') => JSON.stringify({
  'cmi.core.lesson_location': loc, 'airtrust.total_slides': total, 'airtrust.viewed_slides': viewed,
});
const finalize: ScormCommitLike = {
  lesson_status: 'completed', completion_status: 'completed', commit_event: 'SCORM_USER_FINALIZE',
};
const evidenceFor = (m: ActiveCompletionManifest, cmi: string | null,
  suspend?: string | null): ScormManifestClosureEvidence => ({
  coverage: evaluateManifestStudyCoverage({ manifest: m, cmiJson: cmi, suspendData: suspend }),
});
const readiness = (manifestEv: ScormManifestClosureEvidence | null, cmi: string | null,
  commit: ScormCommitLike = finalize) => evaluateScormClosureReadiness({
  mode: 'commit', commit, wasCompleted: false, cmiJson: cmi, location: { current: 4, total: 4 },
  policy: 'FORMATIVE', masteryScore: null, scorePct: null, manifest: manifestEv,
});

describe('manifest do pacote ativo — parse', () => {
  it('aceita manifest válido e rejeita ids duplicados, vazios ou ausentes', () => {
    expect(parseActiveCompletionManifest({ packageVersion: 'V', content: { requiredSlides: IDS } }))
      .toMatchObject({ requiredSlideIds: IDS, assessmentMode: 'SCORM' });
    expect(parseActiveCompletionManifest({ content: { requiredSlides: ['a', 'a'] } })).toBeNull();
    expect(parseActiveCompletionManifest({ content: { requiredSlides: [] } })).toBeNull();
    expect(parseActiveCompletionManifest({ content: {} })).toBeNull();
    expect(parseActiveCompletionManifest(null)).toBeNull();
  });
  it('assessment.mode NONE/EXTERNAL é reconhecido; omitido continua SCORM (fail-closed)', () => {
    const mk = (assessment?: unknown) => parseActiveCompletionManifest({
      content: { requiredSlides: IDS }, ...(assessment ? { assessment } : {}),
    });
    expect(mk({ mode: 'NONE' })?.assessmentMode).toBe('NONE');
    expect(mk({ mode: 'external' })?.assessmentMode).toBe('EXTERNAL');
    expect(mk()?.assessmentMode).toBe('SCORM');
  });
});

describe('cobertura de estudo pelo manifest', () => {
  it('ledger completo do wrapper prova a cobertura', () => {
    expect(evaluateManifestStudyCoverage({ manifest: manifest(), cmiJson: ledger([1, 2, 3, 4]) }))
      .toMatchObject({ verified: true, source: 'WRAPPER_LEDGER', recorded: 4 });
  });
  it('bookmark N/N sozinho NUNCA prova telas anteriores', () => {
    expect(evaluateManifestStudyCoverage({ manifest: manifest(), cmiJson: ledger([4]) }))
      .toMatchObject({ verified: false, source: null, recorded: 1 });
    expect(evaluateManifestStudyCoverage({ manifest: manifest(), cmiJson: JSON.stringify({ 'cmi.core.lesson_location': '4/4' }) }))
      .toMatchObject({ verified: false });
  });
  it('estado do próprio pacote (suspend_data) prova, desde que fixado na versão ativa', () => {
    const ok = JSON.stringify({ p: 'PKG-V2', d: [0, 1, 2, 3], ids: IDS });
    expect(evaluateManifestStudyCoverage({ manifest: manifest(), cmiJson: null, suspendData: ok }))
      .toMatchObject({ verified: true, source: 'PACKAGE_STATE' });
    const oldEdition = JSON.stringify({ p: 'PKG-V1', d: [0, 1, 2, 3], ids: IDS });
    expect(evaluateManifestStudyCoverage({ manifest: manifest(), cmiJson: null, suspendData: oldEdition }).verified).toBe(false);
    const reordered = JSON.stringify({ p: 'PKG-V2', d: [0, 1, 2, 3], ids: ['s2', 's1', 's3', 's4'] });
    expect(evaluateManifestStudyCoverage({ manifest: manifest(), cmiJson: null, suspendData: reordered }).verified).toBe(false);
    const noIdentity = JSON.stringify({ p: 'PKG-V2', d: [0, 1, 2, 3] });
    expect(evaluateManifestStudyCoverage({ manifest: manifest({ packageVersion: null }), cmiJson: null, suspendData: noIdentity }).verified).toBe(false);
  });
  it('índices repetidos ou fora do intervalo não contam', () => {
    expect(evaluateManifestStudyCoverage({ manifest: manifest(), cmiJson: ledger([1, 1, 2, 3]) }).verified).toBe(false);
    expect(evaluateManifestStudyCoverage({ manifest: manifest(), cmiJson: ledger([1, 2, 3, 9]) }).verified).toBe(false);
  });
});

describe('prontidão de fechamento — o defeito do 99%/409', () => {
  const full = ledger([1, 2, 3, 4]);
  it('com manifest comprovando a cobertura, não exige mais distinct_slide_coverage', () => {
    const r = readiness(evidenceFor(manifest(), full), full);
    expect(r.missing).not.toContain('distinct_slide_coverage');
    expect(r.every_slide_verified).toBe(true);
  });
  it('pacote que emite só o próprio estado (sem airtrust.viewed_slides) fecha pelo manifest', () => {
    const suspend = JSON.stringify({ p: 'PKG-V2', d: [0, 1, 2, 3], ids: IDS });
    const cmi = JSON.stringify({ 'cmi.core.lesson_location': '4/4' });
    const ev = evidenceFor(manifest(), cmi, suspend);
    expect(readiness(ev, cmi).eligible_for_server_verification).toBe(true);
    // sem manifest, o mesmo pacote continua barrado (comportamento legado preservado)
    const legacy = readiness(null, cmi);
    expect(legacy.eligible_for_server_verification).toBe(false);
    expect(legacy.missing).toContain('distinct_slide_coverage');
  });
  it('cobertura incompleta no manifest continua bloqueando, com requisito nomeado', () => {
    const partial = ledger([1, 2, 3]);
    const r = readiness(evidenceFor(manifest(), partial), partial);
    expect(r.eligible_for_server_verification).toBe(false);
    expect(r.missing).toContain('manifest_required_units');
  });
  it('commit passivo (Finish/unload) nunca conclui: exige SCORM_USER_FINALIZE', () => {
    const r = readiness(evidenceFor(manifest(), full), full, { ...finalize, commit_event: 'SCORM_FINISH' });
    expect(r.eligible_for_server_verification).toBe(false);
    expect(r.missing).toContain('user_confirmation');
  });
});

describe('pacote sem prova (assessment.mode NONE/EXTERNAL): o curso é para concluir', () => {
  const full = ledger([1, 2, 3, 4]);
  it('estudo comprovado + confirmação do aluno conclui — não há nada mais a esperar', () => {
    for (const mode of ['NONE', 'EXTERNAL'] as const) {
      const r = readiness(evidenceFor(manifest({ assessmentMode: mode }), full), full);
      expect(r).toMatchObject({ eligible_for_server_verification: true,
        code: 'SCORM_READY_FOR_SERVER_VERIFICATION', missing: [] });
    }
  });
  it('não depende de status terminal nem de nota do pacote', () => {
    const r = readiness(evidenceFor(manifest({ assessmentMode: 'NONE' }), full), full,
      { commit_event: 'SCORM_USER_FINALIZE' });
    expect(r.eligible_for_server_verification).toBe(true);
  });
  it('continua exigindo cobertura de todas as telas do manifest', () => {
    const partial = ledger([1, 2]);
    const r = readiness(evidenceFor(manifest({ assessmentMode: 'NONE' }), partial), partial);
    expect(r).toMatchObject({ eligible_for_server_verification: false, code: 'PROGRESS_EVIDENCE_MISSING' });
    expect(r.missing).toContain('manifest_required_units');
  });
  it('continua exigindo a confirmação explícita do aluno (Finish passivo não conclui)', () => {
    const r = readiness(evidenceFor(manifest({ assessmentMode: 'NONE' }), full), full,
      { lesson_status: 'completed', commit_event: 'SCORM_FINISH' });
    expect(r).toMatchObject({ eligible_for_server_verification: false, code: 'SCORM_USER_CONFIRMATION_REQUIRED' });
  });
  it('reprovação explícita registrada pelo pacote ainda bloqueia', () => {
    const r = readiness(evidenceFor(manifest({ assessmentMode: 'NONE' }), full), full,
      { ...finalize, lesson_status: 'failed' });
    expect(r).toMatchObject({ eligible_for_server_verification: false, code: 'EXPLICIT_FAILURE' });
  });
  it('matrícula já concluída não é reprocessada', () => {
    const r = evaluateScormClosureReadiness({
      mode: 'commit', commit: finalize, wasCompleted: true, cmiJson: full, location: { current: 4, total: 4 },
      policy: 'SCORED', masteryScore: 80, scorePct: null,
      manifest: evidenceFor(manifest({ assessmentMode: 'NONE' }), full),
    });
    expect(r.code).toBe('SCORM_ALREADY_COMPLETED');
  });
});

const fakeBucket = (value: unknown, throws = false) => ({
  get: async () => {
    if (throws) throw new Error('r2 down');
    return value == null ? null : { size: 500, text: async () => JSON.stringify(value) };
  },
}) as unknown as R2Bucket;
const rawManifest = { packageVersion: 'PKG-V2', content: { requiredSlides: IDS }, assessment: { mode: 'NONE' } };
const PREFIX = 'lms/scorm/7/9/v2/';
const params = (bucket: R2Bucket) => ({ bucket, empresaId: 7, cursoId: 9, matriculaId: 1, activePrefix: PREFIX,
  contentType: 'scorm', cmiJson: ledger([1, 2, 3, 4]) });

describe('carregamento do contexto (R2 somente leitura)', () => {
  it('carrega a cobertura do manifest do pacote ativo, somente leitura', async () => {
    const ev = await loadScormManifestClosureEvidence(params(fakeBucket(rawManifest)));
    expect(ev?.coverage).toMatchObject({ verified: true, assessment_mode: 'NONE', source: 'WRAPPER_LEDGER' });
  });
  it('prefixo de outro tenant/curso, conteúdo não-SCORM ou R2 fora do ar => sem evidência (legado estrito)', async () => {
    expect(await loadScormManifestClosureEvidence({ ...params(fakeBucket(rawManifest)), activePrefix: 'lms/scorm/8/9/v2/' })).toBeNull();
    expect(await loadScormManifestClosureEvidence({ ...params(fakeBucket(rawManifest)), activePrefix: 'lms/scorm/7/9/../1/' })).toBeNull();
    expect(await loadScormManifestClosureEvidence({ ...params(fakeBucket(rawManifest)), contentType: 'pdf' })).toBeNull();
    expect(await loadScormManifestClosureEvidence(params(fakeBucket(rawManifest, true)))).toBeNull();
    expect(await readActiveCompletionManifest({ bucket: fakeBucket(rawManifest), empresaId: 7, cursoId: 9, activePrefix: PREFIX })).not.toBeNull();
  });
  it('wrapper de rota nunca lança e ignora linha inválida', async () => {
    const row = { id: 1, curso_id: 9, scorm_package_r2_prefix: PREFIX, tipo_conteudo: 'scorm' };
    expect((await loadManifestEvidenceForEnrollment(fakeBucket(rawManifest), row, 7, ledger([1, 2, 3, 4])))?.coverage.verified).toBe(true);
    expect(await loadManifestEvidenceForEnrollment(fakeBucket(rawManifest, true), row, 7, null)).toBeNull();
    expect(await loadManifestEvidenceForEnrollment(fakeBucket(rawManifest), { id: 'x', curso_id: 9 }, 7, null)).toBeNull();
    expect(await loadManifestEvidenceForEnrollment(undefined, row, 7, null)).toBeNull();
  });
});
