/**
 * Native -> canonical LMS completion PRE-FLIGHT (read only).
 *
 * This is not permission to set CONCLUIDO, update progress or mint a
 * qualification/certificate. The future canonical writer must re-check
 * readiness, current-cycle pin and course configuration ATOMICALLY in the
 * same governed D1 transaction as completeLmsMatricula. Until then the
 * 0551 review-only candidate blocks ungoverned Native completion.
 */
import type { Env } from '../types';
import type { VencimentoMode } from '../utils/qualificacoes-expiration';
import { canProvisionNative } from './lms-native-enrollment-provisioner';
import { NATIVE_ACTIVE_EMPLOYEE_JOIN, NATIVE_ACTIVE_USER_CONDITION } from './lms-native-active-learner-sql';
import type { NativeReadinessVerdict } from '../lib/lms/lms-native-evidence-domain';
import { loadNativePrivateCourse } from './lms-native-content-loader';
import { readNativeLearnerSession } from './lms-native-readiness-repository';
import { requireActiveQualificationCategoryById } from './qualification-category-contract';

export type NativeCompletionPreflight =
  | Readonly<{ ready: false; reason:
      | NativeReadinessVerdict['reason']
      | 'COURSE_OR_CYCLE_CHANGED' | 'QUALIFICATION_MAPPING_INCOMPLETE' }>
  | Readonly<{ ready: true; reason: 'READY';
      canonical: {
        empresaId: number;
        matriculaId: number;
        cicloId: number;
        cursoId: number;
        funcionarioId: number;
        editionHash: string;
        cursoTitulo: string;
        gerarQualificacaoAoConcluir: boolean;
        qualificacaoTipoId: number | null;
        qualificacaoCategoriaId: number | null;
        qualificacaoCategoriaCodigo: string | null;
        qualificacaoCodigo: string | null;
        qualificacaoNome: string | null;
        qualificacaoCategoria: string | null;
        validade: number | null;
        vencimentoFimMes: VencimentoMode | null;
        existingHistoricoId: number | null;
        /** Durable evidence snapshot verified against the private R2 key. */
        evidenceSnapshot: {
          eventCount: number;
          distinctLessonCount: number;
          latestAttemptNumber: number;
          scorePct: number | null;
        };
      } }>;

type CourseRow = {
  id: number; curso_id: number; funcionario_id: number;
  status: string; ciclo_id: number; artifact_sha256: string;
  titulo: string; gerar_qualificacao_ao_concluir: number;
  qualificacao_tipo_id: number | null;
  qualificacao_tipo_ativo_id: number | null;
  qualificacao_categoria_id: number | null;
  qualificacao_codigo: string | null;
  qualificacao_nome: string | null;
  qualificacao_categoria: string | null;
  qualificacao_validade: number | null;
  qualificacao_vencimento_fim_mes: number | null;
  qualificacao_historico_id: number | null;
};

/**
 * Must only be invoked from authenticated server code. Never accept
 * employee, target edition or quiz score from an HTTP request.
 */
export async function preflightNativeCanonicalCompletion(params: {
  env: Env; empresaId: number; matriculaId: number; actorUserId: number;
}): Promise<NativeCompletionPreflight> {
  const { env, empresaId, matriculaId, actorUserId } = params;
  if (![empresaId, matriculaId, actorUserId].every(
    id => Number.isSafeInteger(id) && id > 0,
  )) throw new Error('NATIVE_COMPLETION_INVALID_CONTEXT');

  if (!canProvisionNative(env, empresaId)) {
    throw new Error('NATIVE_COMPLETION_PREFLIGHT_NOT_ENABLED');
  }
  const verified = await loadNativePrivateCourse({
    env, db: env.DB, bucket: env.BUCKET,
    empresaId, matriculaId, actorUserId,
  });
  const scope = {
    empresaId, matriculaId, cursoId: verified.cursoId,
    cicloId: verified.cicloId, artifactHash: verified.editionHash,
  };
  const { summary, readiness } = await readNativeLearnerSession({
    env, db: env.DB, actorUserId, scope, artifact: verified.artifact,
  });
  if (!readiness.readyForCanonicalCompletion) {
    return { ready: false, reason: readiness.reason };
  }
  const attempt = summary.latestAttempt;
  if (summary.mode !== 'LEARN' ||
      !Number.isSafeInteger(summary.nextSequence) || summary.nextSequence < 2 ||
      !Number.isSafeInteger(summary.seenLessonIds.length) ||
      summary.seenLessonIds.length < 1 ||
      !attempt || !attempt.assessmentSatisfied ||
      !Number.isSafeInteger(attempt.attemptNumber) || attempt.attemptNumber < 1) {
    return { ready: false, reason: 'ASSESSMENT_EVIDENCE_MISSING' };
  }

  // Bind metadata to precisely the same authenticated employee, course,
  // cycle, immutable edition and allowed Native effective classification.
  // It is only a preflight; not a substitute for an atomic terminal gate.
  const sql = [
    'SELECT m.id,m.curso_id,m.funcionario_id,m.status,cy.id AS ciclo_id,',
    'ed.artifact_sha256,c.titulo,c.gerar_qualificacao_ao_concluir,',
    'c.qualificacao_tipo_id,qt.id AS qualificacao_tipo_ativo_id,',
    'qt.categoria_id AS qualificacao_categoria_id,qt.codigo AS qualificacao_codigo,',
    'qt.nome AS qualificacao_nome,qt.categoria AS qualificacao_categoria,',
    'qt.validade AS qualificacao_validade,qt.vencimento_fim_mes AS qualificacao_vencimento_fim_mes,',
    'm.qualificacao_historico_id',
    'FROM lms_matriculas m',
    'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
    'AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL',
    "AND c.tipo_conteudo='scorm'",
    'JOIN lms_native_catalog_activation a ON a.curso_id=c.id AND a.empresa_id=c.empresa_id',
    'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id',
    'AND u.deleted_at IS NULL',
    NATIVE_ACTIVE_USER_CONDITION,
    NATIVE_ACTIVE_EMPLOYEE_JOIN,
    'JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id',
    'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
    'AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1',
    "AND cy.status=m.status AND cy.deleted_at IS NULL",
    'JOIN lms_native_matricula_edicoes b ON b.matricula_id=m.id',
    'AND b.ciclo_id=cy.id AND b.empresa_id=m.empresa_id AND b.curso_id=m.curso_id',
    'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id',
    'AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id',
    "AND ed.status='PUBLISHED' AND ed.artifact_sha256=?",
    'LEFT JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id',
    'AND qt.empresa_id=c.empresa_id AND qt.deleted_at IS NULL AND qt.ativo=1',
    "WHERE m.id=? AND m.empresa_id=? AND m.curso_id=?",
    "AND m.deleted_at IS NULL AND m.status='EM_ANDAMENTO'",
    'LIMIT 1',
  ].join(' ');
  const row = await env.DB.prepare(sql).bind(
    actorUserId, verified.editionHash, matriculaId, empresaId, verified.cursoId,
  ).first<CourseRow>();
  if (!row || row.id !== matriculaId || row.curso_id !== verified.cursoId ||
      row.ciclo_id !== verified.cicloId ||
      row.artifact_sha256 !== verified.editionHash || row.status !== 'EM_ANDAMENTO' ||
      !Number.isSafeInteger(row.funcionario_id) || row.funcionario_id <= 0) {
    return { ready: false, reason: 'COURSE_OR_CYCLE_CHANGED' };
  }
  if (row.gerar_qualificacao_ao_concluir !== 0 &&
      row.gerar_qualificacao_ao_concluir !== 1) {
    return { ready: false, reason: 'QUALIFICATION_MAPPING_INCOMPLETE' };
  }
  const requireQualification = row.gerar_qualificacao_ao_concluir === 1;
  if (requireQualification && (
      !Number.isSafeInteger(row.qualificacao_tipo_id) ||
      (row.qualificacao_tipo_id ?? 0) <= 0 ||
      row.qualificacao_tipo_ativo_id !== row.qualificacao_tipo_id ||
      !String(row.qualificacao_codigo ?? row.qualificacao_nome ?? '').trim()
  )) {
    return { ready: false, reason: 'QUALIFICATION_MAPPING_INCOMPLETE' };
  }
  if (requireQualification && row.qualificacao_vencimento_fim_mes !== null &&
      row.qualificacao_vencimento_fim_mes !== 0 &&
      row.qualificacao_vencimento_fim_mes !== 1) {
    return { ready:false, reason:'QUALIFICATION_MAPPING_INCOMPLETE' };
  }
  if (!String(row.titulo ?? '').trim()) {
    return { ready: false, reason: 'COURSE_OR_CYCLE_CHANGED' };
  }
  // Use the same canonical active-category contract as the existing
  // qualification writer. A Native course must not acquire a certificate
  // via the separate SCORM compatibility-link exception.
  let categoriaId: number | null = null;
  let categoriaCodigo: string | null = null;
  let categoriaNome: string | null = null;
  if (requireQualification) {
    const id = row.qualificacao_categoria_id;
    if (!Number.isSafeInteger(id) || (id ?? 0) <= 0) {
      return { ready: false, reason: 'QUALIFICATION_MAPPING_INCOMPLETE' };
    }
    try {
      const category = await requireActiveQualificationCategoryById(env.DB, empresaId, id!);
      if (!category.lmsIntegrada || category.empresaId !== empresaId) {
        return { ready: false, reason: 'QUALIFICATION_MAPPING_INCOMPLETE' };
      }
      categoriaId = category.id;
      categoriaCodigo = category.codigo;
      categoriaNome = category.nome;
    } catch {
      return { ready: false, reason: 'QUALIFICATION_MAPPING_INCOMPLETE' };
    }
  }
  return {
    ready: true, reason: 'READY',
    canonical: {
      empresaId, matriculaId, cicloId: verified.cicloId,
      cursoId: verified.cursoId, funcionarioId: row.funcionario_id,
      editionHash: verified.editionHash, cursoTitulo: row.titulo,
      gerarQualificacaoAoConcluir: requireQualification,
      qualificacaoTipoId: row.qualificacao_tipo_id,
      qualificacaoCategoriaId: categoriaId,
      qualificacaoCategoriaCodigo: categoriaCodigo,
      qualificacaoCodigo: row.qualificacao_codigo,
      qualificacaoNome: row.qualificacao_nome,
      qualificacaoCategoria: categoriaNome,
      validade: row.qualificacao_validade,
      vencimentoFimMes: row.qualificacao_vencimento_fim_mes as VencimentoMode | null,
      existingHistoricoId: row.qualificacao_historico_id,
      evidenceSnapshot: {
        eventCount: summary.nextSequence - 1,
        distinctLessonCount: summary.seenLessonIds.length,
        latestAttemptNumber: attempt.attemptNumber,
        scorePct: attempt.scorePct,
      },
    },
  };
}
