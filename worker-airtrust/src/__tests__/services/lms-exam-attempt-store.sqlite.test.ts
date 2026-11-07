import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ExamSqliteD1 } from '../helpers/exam-sqlite-d1';
import {
  EXAM_PLAN_SCHEMA, type ExamPlan,
} from '../../lib/lms-exams/question-bank-domain';
import {
  createAdminQuestionDraft, publishAdminQuestion, reviewAdminQuestion,
} from '../../services/lms-exams/question-bank-store';
import {
  bindExamToEdition, findApprovedExamEvidence, publishExamPlan, saveExamResponse,
  startExamAttempt, submitExamAttempt,
} from '../../services/lms-exams/exam-attempt-store';

const change = (name: string) => readFileSync(
  resolve(process.cwd(), 'schema-v2/changes', name), 'utf8');
const PKG = 'a'.repeat(64);
const PREFIX = 'scorm/6/26/pkg-a/';
const admin = (id = 1) => ({ empresaId: 6, userId: id, tenantRole: 'admin' });
const learner = { empresaId: 6, userId: 500 };
const scope = { cursoId: 26, matriculaId: 10, cicloId: 1, packageSha256: PKG };
const content = (n: number) => ({
  moduleId: 'm1', topicId: 'safety', sourceUnitId: 'u' + n, sourceSha256: PKG,
  prompt: 'Pergunta ' + n + '?', choices: [{ id: 'o1', text: 'Certa' }, { id: 'o2', text: 'Errada' }],
  correctChoiceId: 'o1', explanation: 'SEGREDO-' + n,
});
let db: ExamSqliteD1;
let plan: ExamPlan;

async function publishedQuestion(n: number) {
  const id = 'q' + n;
  await createAdminQuestionDraft(db.asD1(), { ...admin(1), cursoId: 26 }, id, content(n));
  await reviewAdminQuestion(db.asD1(), { ...admin(2), cursoId: 26 }, id, 1, 1);
  const stored = await publishAdminQuestion(db.asD1(), { ...admin(3), cursoId: 26 }, id, 1, 1);
  return stored.revision;
}
async function ready(bind = true) {
  const questions = await Promise.all(Array.from({ length: 10 }, (_, i) => publishedQuestion(i + 1)));
  plan = {
    schema: EXAM_PLAN_SCHEMA, tenantId: 6, courseId: 26, examId: 'exam1', version: 1,
    trainingSourceSha256: PKG, trainingEditionSha256: 'b'.repeat(64),
    acceptedQuestionSourceSha256: [PKG], consultationAllowed: true,
    sections: [{ moduleId: 'm1', minScorePct: 70, questions: questions.map(q => ({
      questionId: q.questionId, revision: q.revision, contentSha256: q.contentSha256!,
    })) }],
  };
  await publishExamPlan(db.asD1(), admin(), plan);
  if (bind) {
    await bindExamToEdition(db.asD1(), admin(), {
      cursoId: 26, examId: 'exam1', version: 1, packageSha256: PKG,
      statutoryAssessmentRequired: true, approvalNote: 'Aprovado após revisão editorial',
    });
  }
}
async function answerAll(attemptId: string, correct: number, who = learner) {
  for (let i = 1; i <= 10; i++) {
    await saveExamResponse(db.asD1(), who, attemptId, 'q' + i, i <= correct ? 'o1' : 'o2');
  }
}
const evidence = (empresaId = 6) =>
  findApprovedExamEvidence(db.asD1(), { empresaId, matriculaId: 10, activePackagePrefix: PREFIX });

beforeEach(() => {
  db = new ExamSqliteD1();
  db.exec(`
    CREATE TABLE lms_cursos(id INTEGER, empresa_id INTEGER, deleted_at TEXT, PRIMARY KEY(empresa_id,id));
    CREATE TABLE lms_scorm_package_versions(id TEXT PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      package_sha256 TEXT, status TEXT, r2_prefix TEXT);
    CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      matricula_id INTEGER, ciclo_atual INTEGER, status TEXT, deleted_at TEXT);
    INSERT INTO lms_cursos(id,empresa_id) VALUES(26,6),(26,7);
    INSERT INTO lms_scorm_package_versions VALUES('p1',6,26,'${PKG}','VALIDATED','scorm/6/26/pkg-a');
    INSERT INTO lms_matricula_ciclos VALUES(1,6,26,10,1,'EM_ANDAMENTO',NULL);
  `);
  db.exec(change('0571_lms_exam_question_bank.sql'));
  db.exec(change('0572_lms_exam_attempts.sql'));
});

describe('publicação e vínculo da prova', () => {
  it('só admin publica; o plano precisa ser do tenant e de questões publicadas; versão não se repete', async () => {
    await ready(false);
    await expect(publishExamPlan(db.asD1(), { ...admin(), tenantRole: 'student' }, plan))
      .rejects.toThrow('EXAM_ADMIN_RBAC_REQUIRED');
    await expect(publishExamPlan(db.asD1(), { ...admin(), empresaId: 7 }, plan))
      .rejects.toThrow('EXAM_PLAN_TENANT_MISMATCH');
    await expect(publishExamPlan(db.asD1(), admin(), plan)).rejects.toThrow('EXAM_PLAN_ALREADY_PUBLISHED');
    await expect(publishExamPlan(db.asD1(), admin(), { ...plan, version: 2, sections: [{
      ...plan.sections[0], questions: [{ ...plan.sections[0].questions[0], revision: 9 }] }] }))
      .rejects.toThrow('EXAM_QUESTION_NOT_FOUND');
  });
  it('o vínculo exige a classificação regulatória explícita e o ZIP do plano', async () => {
    await ready(false);
    const base = { cursoId: 26, examId: 'exam1', version: 1, packageSha256: PKG,
      statutoryAssessmentRequired: true, approvalNote: 'Aprovado após revisão editorial' };
    await expect(bindExamToEdition(db.asD1(), admin(), { ...base, statutoryAssessmentRequired: null as never }))
      .rejects.toThrow('EXAM_STATUTORY_CLASSIFICATION_REQUIRED');
    await expect(bindExamToEdition(db.asD1(), admin(), { ...base, packageSha256: 'c'.repeat(64) }))
      .rejects.toThrow('EXAM_BINDING_PACKAGE_PLAN_MISMATCH');
    await bindExamToEdition(db.asD1(), admin(), base);
    await expect(bindExamToEdition(db.asD1(), admin(), base)).rejects.toThrow('EXAM_EDITION_ALREADY_BOUND');
  });
});

describe('tentativa do aluno', () => {
  it('sem vínculo da edição não inicia', async () => {
    await ready(false);
    await expect(startExamAttempt(db.asD1(), learner, scope, 'idem-00000001'))
      .rejects.toThrow('EXAM_NOT_BOUND_TO_EDITION');
  });
  it('é idempotente, retoma a aberta e nunca expõe gabarito', async () => {
    await ready();
    const a = await startExamAttempt(db.asD1(), learner, scope, 'idem-00000001');
    const again = await startExamAttempt(db.asD1(), learner, scope, 'idem-00000001');
    const resumed = await startExamAttempt(db.asD1(), learner, scope, 'idem-00000002');
    expect(again.attemptId).toBe(a.attemptId);
    expect(resumed.attemptId).toBe(a.attemptId);
    expect(a.attemptNo).toBe(1);
    expect(a.sections[0].questions).toHaveLength(10);
    expect(JSON.stringify(a)).not.toMatch(/correctChoiceId|explanation|SEGREDO|contentSha256/);
  });
  it('troca de edição dentro do ciclo não reutiliza tentativa antiga nem apaga histórico', async () => {
    await ready();
    const old = await startExamAttempt(db.asD1(), learner, scope, 'idem-source-0001');
    const nextScope = { ...scope, packageSha256: 'b'.repeat(64) };
    await expect(startExamAttempt(db.asD1(), learner, nextScope, 'idem-source-0002'))
      .rejects.toThrow('EXAM_ATTEMPT_EDITION_CHANGED');
    expect((await startExamAttempt(db.asD1(), learner, scope, 'idem-source-0003')).attemptId)
      .toBe(old.attemptId);
  });
  it('outro aluno ou outro tenant não lê, grava nem envia', async () => {
    await ready();
    const a = await startExamAttempt(db.asD1(), learner, scope, 'idem-00000001');
    const other = { empresaId: 6, userId: 501 };
    await expect(saveExamResponse(db.asD1(), other, a.attemptId, 'q1', 'o1')).rejects.toThrow('EXAM_ATTEMPT_FORBIDDEN');
    await expect(submitExamAttempt(db.asD1(), other, a.attemptId)).rejects.toThrow('EXAM_ATTEMPT_FORBIDDEN');
    await expect(submitExamAttempt(db.asD1(), { empresaId: 7, userId: 500 }, a.attemptId))
      .rejects.toThrow('EXAM_ATTEMPT_NOT_FOUND');
    await expect(startExamAttempt(db.asD1(), other, scope, 'idem-00000001')).rejects.toThrow('EXAM_ATTEMPT_FORBIDDEN');
  });
  it('recusa pergunta fora da prova e alternativa inexistente', async () => {
    await ready();
    const a = await startExamAttempt(db.asD1(), learner, scope, 'idem-00000001');
    await expect(saveExamResponse(db.asD1(), learner, a.attemptId, 'q99', 'o1')).rejects.toThrow('EXAM_ANSWER_INVALID');
    await expect(saveExamResponse(db.asD1(), learner, a.attemptId, 'q1', 'o9')).rejects.toThrow('EXAM_ANSWER_INVALID');
    await saveExamResponse(db.asD1(), learner, a.attemptId, 'q1', 'o2');
    await saveExamResponse(db.asD1(), learner, a.attemptId, 'q1', 'o1');
    expect((await startExamAttempt(db.asD1(), learner, scope, 'idem-00000001')).answers).toEqual({ q1: 'o1' });
  });
});

describe('correção e evidência para a conclusão', () => {
  it('6/10 reprova e não gera evidência; a nova tentativa 7/10 aprova uma única vez', async () => {
    await ready();
    const first = await startExamAttempt(db.asD1(), learner, scope, 'idem-00000001');
    await answerAll(first.attemptId, 6);
    const failed = await submitExamAttempt(db.asD1(), learner, first.attemptId);
    expect(failed.result).toMatchObject({ passed: false, answered: 10, unanswered: 0 });
    expect(JSON.stringify(failed)).not.toMatch(/correctChoiceId|explanation|SEGREDO/);
    expect(await evidence()).toBeNull();
    await expect(saveExamResponse(db.asD1(), learner, first.attemptId, 'q1', 'o1'))
      .rejects.toThrow('EXAM_ATTEMPT_SEALED');

    const second = await startExamAttempt(db.asD1(), learner, scope, 'idem-00000002');
    expect(second.attemptNo).toBe(2);
    await answerAll(second.attemptId, 7);
    const passed = await submitExamAttempt(db.asD1(), learner, second.attemptId);
    expect(passed.result?.passed).toBe(true);
    expect(await submitExamAttempt(db.asD1(), learner, second.attemptId)).toMatchObject({ result: { passed: true } });
    expect(await evidence()).toMatchObject({ attemptId: second.attemptId });
    await expect(startExamAttempt(db.asD1(), learner, scope, 'idem-00000003'))
      .rejects.toThrow('EXAM_ALREADY_PASSED');
  });
  it('questões em branco contam como erradas no envio', async () => {
    await ready();
    const a = await startExamAttempt(db.asD1(), learner, scope, 'idem-00000001');
    for (let i = 1; i <= 6; i++) await saveExamResponse(db.asD1(), learner, a.attemptId, 'q' + i, 'o1');
    const r = await submitExamAttempt(db.asD1(), learner, a.attemptId);
    expect(r.result).toMatchObject({ passed: false, answered: 6, unanswered: 4 });
    expect(await evidence()).toBeNull();
  });
  it('a evidência só vale no ciclo ativo, na edição servida e no tenant correto', async () => {
    await ready();
    const a = await startExamAttempt(db.asD1(), learner, scope, 'idem-00000001');
    await answerAll(a.attemptId, 10);
    await submitExamAttempt(db.asD1(), learner, a.attemptId);
    expect(await evidence()).not.toBeNull();
    expect(await evidence(7)).toBeNull();
    expect(await findApprovedExamEvidence(db.asD1(), { empresaId: 6, matriculaId: 10, activePackagePrefix: 'scorm/6/26/pkg-b/' })).toBeNull();
    expect(await findApprovedExamEvidence(db.asD1(), { empresaId: 6, matriculaId: 10, activePackagePrefix: null })).toBeNull();
    db.exec('UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=1');
    expect(await evidence()).toBeNull();
  });
  it('sem o schema 0572 a busca falha fechada (sem evidência) em vez de lançar', async () => {
    const bare = new ExamSqliteD1();
    expect(await findApprovedExamEvidence(bare.asD1(), { empresaId: 6, matriculaId: 10, activePackagePrefix: PREFIX })).toBeNull();
  });
});
