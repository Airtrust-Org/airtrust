/**
 * SERVER-ONLY bridge: private R2 evidence -> verified snapshot -> atomic gate.
 *
 * No HTTP route calls this service. The returned SQL assertion must be the
 * first statement inside a future, GOVERNED canonical-completion D1.batch,
 * followed by canonical qualification/history/audit statements in that SAME
 * transaction. This module does not change enrollment, issue certificates,
 * or enable the terminal writer; Schema V2 currently prohibits completion.
 */
import type { Env } from '../types';
import { canProvisionNative } from './lms-native-enrollment-provisioner';
import {
  preflightNativeCanonicalCompletion,
  type NativeCompletionPreflight,
} from './lms-native-canonical-completion-preflight';
import {
  buildNativeTerminalTransactionGuard,
  type NativeTerminalAnchor,
} from './lms-native-terminal-transaction-guard';

type Ready = Extract<NativeCompletionPreflight, { ready: true }>;
type TerminalRow = {
  binding_id: number; edicao_id: number;
  tentativa_id: number; tentativa_numero: number;
  answers_sha256: string; score_pct: number | null;
  assessment_satisfied: number;
};
export type NativeTerminalPreparation =
  | { ready: false; reason: string }
  | { ready: true; canonical: Ready['canonical'];
      atomicGuard: ReturnType<typeof buildNativeTerminalTransactionGuard> };
const SHA=/^[a-f0-9]{64}$/;

const VERIFY_SQL=[
  'SELECT b.id AS binding_id,ed.id AS edicao_id,att.id AS tentativa_id,',
  'att.tentativa_numero,att.answers_sha256,att.score_pct,att.assessment_satisfied',
  'FROM lms_matriculas m',
  'JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id',
  'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
  "AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1 AND cy.status='EM_ANDAMENTO'",
  'AND cy.deleted_at IS NULL',
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  "AND c.tipo_conteudo='scorm' AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL",
  'JOIN lms_native_catalog_activation a ON a.curso_id=c.id AND a.empresa_id=c.empresa_id',
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id',
  'AND u.active=1 AND u.deleted_at IS NULL',
  'JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id',
  "AND f.ativo=1 AND f.deleted_at IS NULL AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'",
  'JOIN lms_native_matricula_edicoes b ON b.matricula_id=m.id',
  'AND b.ciclo_id=cy.id AND b.curso_id=m.curso_id AND b.empresa_id=m.empresa_id',
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id AND ed.curso_id=b.curso_id',
  "AND ed.empresa_id=b.empresa_id AND ed.status='PUBLISHED'",
  'JOIN lms_native_tentativas att ON att.vinculo_id=b.id',
  'WHERE m.id=? AND m.empresa_id=? AND m.funcionario_id=? AND m.curso_id=?',
  "AND m.status='EM_ANDAMENTO' AND m.deleted_at IS NULL",
  'AND cy.id=? AND ed.artifact_sha256=?',
  'AND att.tentativa_numero=? AND att.assessment_satisfied=1',
  'AND NOT EXISTS(SELECT 1 FROM lms_native_tentativas newer',
  'WHERE newer.vinculo_id=b.id AND newer.tentativa_numero>att.tentativa_numero)',
  'LIMIT 1',
].join(' ');

/**
 * The identity inputs here originate from authenticated Worker context, not
 * from a browser-supplied completion grade, employee, cycle or edition.
 */
export async function prepareNativeTerminalGuard(params: {
  env: Env; empresaId: number; matriculaId: number; actorUserId: number;
}): Promise<NativeTerminalPreparation> {
  const { env, empresaId, matriculaId, actorUserId }=params;
  if (![empresaId,matriculaId,actorUserId].every(
    id=>Number.isSafeInteger(id)&&id>0,
  ) || !canProvisionNative(env,empresaId)) {
    return { ready:false, reason:'NATIVE_TERMINAL_PREPARATION_NOT_ENABLED' };
  }
  const pre=await preflightNativeCanonicalCompletion(params);
  if (!pre.ready) return { ready:false, reason:pre.reason };
  const p=pre.canonical, proof=p.evidenceSnapshot;
  let row:TerminalRow|null;
  try {
    row=await env.DB.prepare(VERIFY_SQL).bind(
      actorUserId,matriculaId,empresaId,p.funcionarioId,p.cursoId,
      p.cicloId,p.editionHash,proof.latestAttemptNumber,
    ).first<TerminalRow>();
  } catch {
    return {ready:false,reason:'NATIVE_TERMINAL_EVIDENCE_LOOKUP_FAILED'};
  }
  if (!row || !Number.isSafeInteger(row.binding_id) || row.binding_id<=0 ||
      !Number.isSafeInteger(row.edicao_id) || row.edicao_id<=0 ||
      !Number.isSafeInteger(row.tentativa_id) || row.tentativa_id<=0 ||
      row.tentativa_numero !== proof.latestAttemptNumber ||
      !SHA.test(row.answers_sha256) ||
      row.assessment_satisfied !== 1 || row.score_pct !== proof.scorePct) {
    return {ready:false,reason:'NATIVE_TERMINAL_EVIDENCE_CHANGED'};
  }
  const anchor:NativeTerminalAnchor={
    empresaId,matriculaId,cicloId:p.cicloId,cursoId:p.cursoId,
    actorUserId,funcionarioId:p.funcionarioId,edicaoId:row.edicao_id,
    editionHash:p.editionHash,bindingId:row.binding_id,
    latestAttemptId:row.tentativa_id,
    latestAttemptNumber:proof.latestAttemptNumber,
    answersHash:row.answers_sha256,scorePct:proof.scorePct,
    eventCount:proof.eventCount,distinctLessonCount:proof.distinctLessonCount,
    gerarQualificacaoAoConcluir:p.gerarQualificacaoAoConcluir,
    qualificacaoTipoId:p.gerarQualificacaoAoConcluir?p.qualificacaoTipoId:null,
    qualificacaoCategoriaId:p.gerarQualificacaoAoConcluir?p.qualificacaoCategoriaId:null,
  };
  return {ready:true,canonical:p,atomicGuard:buildNativeTerminalTransactionGuard(anchor)};
}
