import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExamSqliteD1 } from './exam-sqlite-d1';
import { EXAM_PLAN_SCHEMA, type ExamPlan } from '../../lib/lms-exams/question-bank-domain';
import {
  createAdminQuestionDraft, publishAdminQuestion, reviewAdminQuestion,
} from '../../services/lms-exams/question-bank-store';
import { bindExamToEdition, publishExamPlan } from '../../services/lms-exams/exam-attempt-store';

export const PKG = 'a'.repeat(64);
export const PREFIX = 'lms/scorm/6/26/v2/';
export const LEARNER_USER = 500;
export const OTHER_USER = 501;
export const ledger = (viewed: number[]) => JSON.stringify({
  'cmi.core.lesson_location': '4/4', 'airtrust.total_slides': 4, 'airtrust.viewed_slides': viewed,
});
const change = (name: string) => readFileSync(resolve(process.cwd(), 'schema-v2/changes', name), 'utf8');
const admin = (id: number) => ({ empresaId: 6, userId: id, tenantRole: 'admin', cursoId: 26 });

export function externalBucket(mode = 'EXTERNAL'): R2Bucket {
  const manifest = { packageVersion: 'PKG-V2', content: { requiredSlides: ['s1', 's2', 's3', 's4'] }, assessment: { mode } };
  return { get: async () => ({ size: 500, text: async () => JSON.stringify(manifest) }) } as unknown as R2Bucket;
}

/** Real SQLite with the LMS tables the gate reads plus DDL 0571/0572. */
export function lmsExamDb(opts: { viewed?: number[]; bind?: boolean } = {}) {
  const db = new ExamSqliteD1();
  db.exec(`
    CREATE TABLE usuarios(id INTEGER PRIMARY KEY, funcionario_id INTEGER, deleted_at TEXT);
    CREATE TABLE funcionarios(id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT, ativo INTEGER, status TEXT);
    CREATE TABLE lms_cursos(id INTEGER, empresa_id INTEGER, deleted_at TEXT, tipo_conteudo TEXT,
      scorm_package_r2_prefix TEXT, scorm_mastery_score REAL, scorm_assessment_policy TEXT,
      PRIMARY KEY(empresa_id,id));
    CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      funcionario_id INTEGER, status TEXT, deleted_at TEXT, progresso_pct REAL);
    CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      matricula_id INTEGER, ciclo_atual INTEGER, status TEXT, deleted_at TEXT, assessment_policy TEXT);
    CREATE TABLE lms_scorm_package_versions(id TEXT PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      package_sha256 TEXT, status TEXT, r2_prefix TEXT);
    CREATE TABLE lms_progresso_scorm(matricula_id INTEGER, empresa_id INTEGER, lesson_status TEXT,
      completion_status TEXT, success_status TEXT, cmi_json TEXT, suspend_data TEXT,
      score_raw REAL, score_min REAL, score_max REAL, score_scaled REAL);
    INSERT INTO funcionarios VALUES(70,6,NULL,1,'ATIVO'),(71,6,NULL,1,'ATIVO');
    INSERT INTO usuarios VALUES(${LEARNER_USER},70,NULL),(${OTHER_USER},71,NULL),(502,NULL,NULL);
    INSERT INTO lms_cursos VALUES(26,6,NULL,'scorm','${PREFIX}',NULL,'FORMATIVE');
    INSERT INTO lms_matriculas VALUES(10,6,26,70,'EM_ANDAMENTO',NULL,99);
    INSERT INTO lms_matricula_ciclos VALUES(1,6,26,10,1,'EM_ANDAMENTO',NULL,NULL);
    INSERT INTO lms_scorm_package_versions VALUES('p1',6,26,'${PKG}','VALIDATED','${PREFIX}');
  `);
  db.database.prepare(
    "INSERT INTO lms_progresso_scorm VALUES(10,6,'completed','completed',NULL,?,NULL,NULL,NULL,NULL,NULL)"
  ).run(ledger(opts.viewed ?? [1, 2, 3, 4]));
  db.exec(change('0571_lms_exam_question_bank.sql'));
  db.exec(change('0572_lms_exam_attempts.sql'));
  return db;
}

export const SYNTHETIC_JWT_SECRET = 'synthetic-jwt-secret-for-tests-only-0123456789';
export const ADMIN_USER = 1;
export const TENANT_B_ADMIN = 800;

/**
 * Tables the REAL auth + tenant middleware read (usuarios_empresas, empresas,
 * token_blocklist). Synthetic identities only: 500/501 = learners (tenant 6),
 * 1 = admin (tenant 6), 800 = admin of tenant B (7).
 */
export function addRealAuthTables(db: ExamSqliteD1): void {
  db.exec(`
    ALTER TABLE usuarios ADD COLUMN perfil TEXT;
    ALTER TABLE usuarios ADD COLUMN ativo INTEGER DEFAULT 1;
    CREATE TABLE empresas(id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, plano TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE usuarios_empresas(usuario_id INTEGER, empresa_id INTEGER, role TEXT, is_primary INTEGER DEFAULT 1,
      PRIMARY KEY(usuario_id, empresa_id));
    CREATE TABLE token_blocklist(jti TEXT PRIMARY KEY, expires_at TEXT);
    INSERT INTO empresas VALUES(6,'sint-a','Empresa Sintetica A','pro',1,NULL),(7,'sint-b','Empresa Sintetica B','pro',1,NULL);
    INSERT INTO usuarios(id,funcionario_id,deleted_at,perfil,ativo) VALUES(${ADMIN_USER},NULL,NULL,'ADMIN',1),(${TENANT_B_ADMIN},NULL,NULL,'ADMIN',1);
    INSERT INTO usuarios_empresas VALUES(${LEARNER_USER},6,'ALUNO',1),(${OTHER_USER},6,'ALUNO',1),
      (${ADMIN_USER},6,'ADMIN',1),(${TENANT_B_ADMIN},7,'ADMIN',1);
  `);
}

/** Publishes 10 questions (q1..q10, o1 correct), one plan and the edition binding. */
export async function publishExam(db: ExamSqliteD1, bind = true): Promise<ExamPlan> {
  const refs = [];
  for (let n = 1; n <= 10; n++) {
    const id = 'q' + n;
    await createAdminQuestionDraft(db.asD1(), admin(1), id, {
      moduleId: 'm1', topicId: 'safety', sourceUnitId: 'u' + n, sourceSha256: PKG,
      prompt: 'Pergunta ' + n + '?', choices: [{ id: 'o1', text: 'Certa' }, { id: 'o2', text: 'Errada' }],
      correctChoiceId: 'o1', explanation: 'SEGREDO-' + n,
    });
    await reviewAdminQuestion(db.asD1(), admin(2), id, 1, 1);
    const q = (await publishAdminQuestion(db.asD1(), admin(3), id, 1, 1)).revision;
    refs.push({ questionId: id, revision: 1, contentSha256: q.contentSha256! });
  }
  const plan: ExamPlan = {
    schema: EXAM_PLAN_SCHEMA, tenantId: 6, courseId: 26, examId: 'exam1', version: 1,
    trainingSourceSha256: PKG, trainingEditionSha256: 'b'.repeat(64),
    acceptedQuestionSourceSha256: [PKG], consultationAllowed: true,
    sections: [{ moduleId: 'm1', minScorePct: 70, questions: refs }],
  };
  await publishExamPlan(db.asD1(), admin(1), plan);
  if (bind) {
    await bindExamToEdition(db.asD1(), admin(1), {
      cursoId: 26, examId: 'exam1', version: 1, packageSha256: PKG,
      statutoryAssessmentRequired: true, approvalNote: 'Aprovado após revisão editorial',
    });
  }
  return plan;
}
