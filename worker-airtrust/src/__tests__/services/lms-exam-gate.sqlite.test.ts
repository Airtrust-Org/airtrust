import { describe, expect, it } from 'vitest';
import { loadExamGate } from '../../services/lms-exams/exam-gate';
import { startExamAttempt, saveExamResponse, submitExamAttempt } from '../../services/lms-exams/exam-attempt-store';
import {
  LEARNER_USER, OTHER_USER, PKG, externalBucket, lmsExamDb, publishExam,
} from '../helpers/exam-lms-fixture';

const ids = (userId = LEARNER_USER) => ({ empresaId: 6, userId, matriculaId: 10 });
const env = (db: ReturnType<typeof lmsExamDb>, mode = 'EXTERNAL') =>
  ({ DB: db.asD1(), BUCKET: externalBucket(mode) });

describe('gate do aluno para a prova', () => {
  it('só a titular da matrícula passa; não vinculado ou outra pessoa não enxerga a matrícula', async () => {
    const db = lmsExamDb(); await publishExam(db);
    await expect(loadExamGate(env(db), ids(OTHER_USER))).rejects.toThrow('EXAM_ENROLLMENT_NOT_FOUND');
    await expect(loadExamGate(env(db), ids(502))).rejects.toThrow('EXAM_LEARNER_NOT_LINKED');
    await expect(loadExamGate(env(db), { ...ids(), empresaId: 7 })).rejects.toThrow('EXAM_LEARNER_NOT_LINKED');
    await expect(loadExamGate(env(db), { ...ids(), matriculaId: 99 })).rejects.toThrow('EXAM_ENROLLMENT_NOT_FOUND');
  });
  it('sem vínculo da edição a prova não existe para o aluno', async () => {
    const db = lmsExamDb(); await publishExam(db, false);
    expect((await loadExamGate(env(db), ids())).state).toBe('NOT_AVAILABLE');
  });
  it('estudo incompleto: STUDY_PENDING com as pendências, sem liberar a prova', async () => {
    const db = lmsExamDb({ viewed: [1, 2] }); await publishExam(db);
    const g = await loadExamGate(env(db), ids());
    expect(g.state).toBe('STUDY_PENDING');
    expect(g.missing).toContain('manifest_required_units');
  });
  it('estudo completo com pacote EXTERNAL: READY', async () => {
    const db = lmsExamDb(); await publishExam(db);
    const g = await loadExamGate(env(db), ids());
    expect(g).toMatchObject({ state: 'READY', attemptsUsed: 0, missing: [] });
    expect(g.scope).toMatchObject({ cursoId: 26, matriculaId: 10, cicloId: 1, packageSha256: PKG });
  });
  it('pacote que não é EXTERNAL não abre prova mesmo com estudo completo', async () => {
    const db = lmsExamDb(); await publishExam(db);
    expect((await loadExamGate(env(db, 'NONE'), ids())).state).toBe('STUDY_PENDING');
  });
  it('aprovada vira PASSED (finalizar é o próximo passo) e concluída vira COMPLETED', async () => {
    const db = lmsExamDb(); await publishExam(db);
    const learner = { empresaId: 6, userId: LEARNER_USER };
    const g = await loadExamGate(env(db), ids());
    const a = await startExamAttempt(db.asD1(), learner, g.scope!, 'idem-00000001');
    for (let i = 1; i <= 10; i++) await saveExamResponse(db.asD1(), learner, a.attemptId, 'q' + i, 'o1');
    await submitExamAttempt(db.asD1(), learner, a.attemptId);
    const after = await loadExamGate(env(db), ids());
    expect(after).toMatchObject({ state: 'PASSED', attemptsUsed: 1 });
    expect(after.evidence?.attemptId).toBe(a.attemptId);
    db.exec("UPDATE lms_matriculas SET status='CONCLUIDO' WHERE id=10");
    expect((await loadExamGate(env(db), ids())).state).toBe('COMPLETED');
  });
});
