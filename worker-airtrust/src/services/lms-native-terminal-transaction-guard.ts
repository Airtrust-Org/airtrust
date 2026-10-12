/**
 * PREPARATION ONLY: fail-closed, transaction-local snapshot assertion for
 * the future Native -> canonical completion path.
 *
 * It is intentionally not mounted, not invoked by the existing SCORM
 * completion writer and NEVER issues completion/certificates. The future
 * governed terminal D1.batch must put this assertion BEFORE all canonical
 * mutation statements; any drift aborts the whole batch.
 *
 * Verified event/assessment content must first be recomputed by the Worker
 * against the private R2 artifact, not derived from browser-controlled data.
 */
export type NativeTerminalAnchor = Readonly<{
  empresaId: number; matriculaId: number; cicloId: number; cursoId: number;
  actorUserId: number; funcionarioId: number; edicaoId: number;
  editionHash: string; bindingId: number;
  latestAttemptId: number; latestAttemptNumber: number;
  answersHash: string; scorePct: number | null;
  eventCount: number; distinctLessonCount: number;
  gerarQualificacaoAoConcluir: boolean;
  qualificacaoTipoId: number | null; qualificacaoCategoriaId: number | null;
}>;
export class NativeTerminalGuardError extends Error {
  constructor(public readonly code: string) { super(code); this.name='NativeTerminalGuardError'; }
}
const SHA=/^[a-f0-9]{64}$/;

const SQL=[
  'SELECT json(CASE WHEN (SELECT COUNT(*)',
  'FROM lms_matriculas m',
  'JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id',
  'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
  'AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1',
  "AND cy.status='EM_ANDAMENTO' AND cy.deleted_at IS NULL",
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  "AND c.tipo_conteudo='scorm' AND c.ativo=1 AND c.publicado=1",
  'AND c.deleted_at IS NULL',
  'JOIN lms_native_catalog_activation activation',
  'ON activation.curso_id=c.id AND activation.empresa_id=c.empresa_id',
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id',
  'AND u.deleted_at IS NULL AND u.active=1',
  'JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id',
  "AND f.ativo=1 AND f.deleted_at IS NULL",
  "AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'",
  'JOIN lms_native_matricula_edicoes b ON b.matricula_id=m.id',
  'AND b.ciclo_id=cy.id AND b.empresa_id=m.empresa_id AND b.curso_id=m.curso_id',
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id',
  "AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id AND ed.status='PUBLISHED'",
  'JOIN lms_native_tentativas att ON att.vinculo_id=b.id',
  'WHERE m.id=? AND m.empresa_id=? AND m.curso_id=?',
  'AND m.funcionario_id=? AND m.deleted_at IS NULL',
  "AND m.status='EM_ANDAMENTO' AND m.data_conclusao IS NULL",
  'AND cy.id=? AND cy.data_conclusao IS NULL',
  'AND b.id=? AND ed.id=? AND ed.artifact_sha256=?',
  'AND att.id=? AND att.tentativa_numero=?',
  'AND att.answers_sha256=? AND att.assessment_satisfied=1',
  'AND att.score_pct IS ?',
  'AND (SELECT COUNT(*) FROM lms_native_eventos e WHERE e.vinculo_id=b.id)=?',
  'AND (SELECT COUNT(DISTINCT e.unidade_id) FROM lms_native_eventos e WHERE e.vinculo_id=b.id)=?',
  'AND NOT EXISTS (SELECT 1 FROM lms_native_tentativas newer',
  'WHERE newer.vinculo_id=b.id AND newer.tentativa_numero>att.tentativa_numero)',
  'AND c.gerar_qualificacao_ao_concluir=?',
  'AND COALESCE(c.qualificacao_tipo_id,0)=?',
  'AND (?=0 OR EXISTS (',
  'SELECT 1 FROM qualificacoes_tipos qt',
  'JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id',
  'AND qc.empresa_id=qt.empresa_id AND qc.ativo=1 AND qc.deleted_at IS NULL',
  'AND qc.lms_integrada=1',
  'WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id',
  'AND qt.ativo=1 AND qt.deleted_at IS NULL AND qc.id=?',
  '))',
  ")=1 THEN 'null' ELSE 'NATIVE_TERMINAL_STATE_CHANGED' END)",
].join(' ');

export function buildNativeTerminalTransactionGuard(
  anchor: NativeTerminalAnchor,
): Readonly<{ sql: string; bindings: readonly (number | string | null)[] }> {
  const ids=[
    anchor.empresaId, anchor.matriculaId, anchor.cicloId, anchor.cursoId,
    anchor.actorUserId, anchor.funcionarioId, anchor.edicaoId,
    anchor.bindingId, anchor.latestAttemptId, anchor.latestAttemptNumber,
  ];
  if (!ids.every(x => Number.isSafeInteger(x) && x > 0) ||
      !SHA.test(anchor.editionHash) || !SHA.test(anchor.answersHash) ||
      !Number.isSafeInteger(anchor.eventCount) || anchor.eventCount < 1 ||
      !Number.isSafeInteger(anchor.distinctLessonCount) ||
      anchor.distinctLessonCount < 1 ||
      anchor.distinctLessonCount > anchor.eventCount ||
      (anchor.scorePct !== null &&
        (typeof anchor.scorePct !== 'number' || !Number.isFinite(anchor.scorePct) ||
         anchor.scorePct < 0 || anchor.scorePct > 100)) ||
      typeof anchor.gerarQualificacaoAoConcluir !== 'boolean') {
    throw new NativeTerminalGuardError('NATIVE_TERMINAL_INVALID_ANCHOR');
  }
  const qualification=anchor.gerarQualificacaoAoConcluir;
  const typeId=anchor.qualificacaoTipoId, categoryId=anchor.qualificacaoCategoriaId;
  if (qualification ?
    !Number.isSafeInteger(typeId) || (typeId ?? 0) <= 0 ||
    !Number.isSafeInteger(categoryId) || (categoryId ?? 0) <= 0 :
    (typeId !== null || categoryId !== null)) {
    throw new NativeTerminalGuardError('NATIVE_TERMINAL_QUALIFICATION_ANCHOR_INVALID');
  }
  return { sql: SQL, bindings: [
    anchor.actorUserId, anchor.matriculaId, anchor.empresaId, anchor.cursoId,
    anchor.funcionarioId, anchor.cicloId, anchor.bindingId,
    anchor.edicaoId, anchor.editionHash,
    anchor.latestAttemptId, anchor.latestAttemptNumber,
    anchor.answersHash, anchor.scorePct,
    anchor.eventCount, anchor.distinctLessonCount,
    Number(qualification), typeId ?? 0, Number(qualification), categoryId ?? 0,
  ] };
}
