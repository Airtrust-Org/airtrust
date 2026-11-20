import { describe, expect, it } from 'vitest';
import { loadBoundExamAttemptPolicy } from '../../lib/lms-exams/exam-edition-binding';
import { PKG, lmsExamDb, publishExam } from '../helpers/exam-lms-fixture';

const edition = { empresaId: 6, cursoId: 26, packageSha256: PKG };

describe('contrato único "edição EXTERNAL tem prova utilizável"', () => {
  it('plano publicado e vinculado ao SHA exato devolve a política de tentativas', async () => {
    const db = lmsExamDb(); const plan = await publishExam(db);
    expect(await loadBoundExamAttemptPolicy(db.asD1(), edition)).toEqual(plan.attemptPolicy);
  });

  it('plano publicado sem vínculo à edição não conta como prova', async () => {
    const db = lmsExamDb(); await publishExam(db, false);
    expect(await loadBoundExamAttemptPolicy(db.asD1(), edition)).toBeNull();
  });

  it('vínculo de outro SHA, outro curso ou outro tenant não conta', async () => {
    const db = lmsExamDb(); await publishExam(db);
    const d1 = db.asD1();
    expect(await loadBoundExamAttemptPolicy(d1, { ...edition, packageSha256: 'b'.repeat(64) })).toBeNull();
    expect(await loadBoundExamAttemptPolicy(d1, { ...edition, cursoId: 27 })).toBeNull();
    expect(await loadBoundExamAttemptPolicy(d1, { ...edition, empresaId: 7 })).toBeNull();
  });

  it('falha do D1 propaga (fail-closed), nunca vira "prova pronta"', async () => {
    const broken = { prepare: () => { throw new Error('D1_UNAVAILABLE'); } } as unknown as D1Database;
    await expect(loadBoundExamAttemptPolicy(broken, edition)).rejects.toThrow('D1_UNAVAILABLE');
  });
});
