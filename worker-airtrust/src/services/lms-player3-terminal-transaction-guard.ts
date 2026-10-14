/**
 * Player3 transaction-local approval/content anchor for FUTURE governed
 * canonical completion. Not exposed by HTTP, never mutates D1 itself.
 *
 * The only caller permitted to construct this anchor is a server-only
 * terminal preflight that has validated ORIGINAL HTML5 content coverage and
 * regraded the pinned private bank. This SQL must be the FIRST statement in
 * the SAME D1.batch as the completion and qualification mutations.
 *
 * Schema V2 0552/0553 + catalog activation are prerequisites (not applied).
 */
import type {Env} from '../types';
import {nativeScopedSql} from './lms-native-catalog-legacy-guard';

export type Player3TerminalStageReceipt=Readonly<{
  stageId:string;
  attemptId:number;
  attemptNumber:number;
  answersHash:string;
  scorePct:number;
}>;
export type Player3TerminalAnchor=Readonly<{
  empresaId:number;matriculaId:number;cursoId:number;cicloId:number;
  funcionarioId:number;actorUserId:number;bindingId:number;edicaoId:number;
  politicaId:number;editionHash:string;sourceHash:string;
  bankHash:string;policyHash:string;
  requiredLessonIds:readonly string[];
  officialStages:readonly Player3TerminalStageReceipt[];
  recordedEventCount:number;
  gerarQualificacaoAoConcluir:boolean;
  qualificacaoTipoId:number|null;
  qualificacaoCategoriaId:number|null;
}>;
export class Player3TerminalGuardError extends Error{
  constructor(public readonly code:string){super(code);this.name='Player3TerminalGuardError';}
}
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const pos=(n:number)=>Number.isSafeInteger(n)&&n>0;

/**
 * json_each binds exactly the required content units and all official
 * stage receipts; it is NOT enough to count "42/42". Each stage's specific
 * immutable passed attempt ID + answer hash is compared inside the same
 * transaction as canonical completion, so no cross-cycle grade can pass.
 */
const SQL=[
  'SELECT json(CASE WHEN EXISTS (',
  'SELECT 1 FROM lms_matriculas m',
  'JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id',
  'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
  'AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1',
  "AND cy.status='EM_ANDAMENTO' AND cy.deleted_at IS NULL",
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  "AND c.tipo_conteudo='native' AND c.ativo=1 AND c.publicado=1",
  'AND c.deleted_at IS NULL',
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id',
  'AND u.active=1 AND u.deleted_at IS NULL',
  'JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id',
  "AND f.ativo=1 AND f.deleted_at IS NULL",
  "AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'",
  'JOIN lms_native_matricula_edicoes b ON b.matricula_id=m.id',
  'AND b.ciclo_id=cy.id AND b.empresa_id=m.empresa_id AND b.curso_id=m.curso_id',
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id',
  "AND ed.empresa_id=b.empresa_id AND ed.status='PUBLISHED'",
  'JOIN lms_player3_politicas p ON p.edicao_id=ed.id',
  "AND p.empresa_id=b.empresa_id AND p.curso_id=b.curso_id AND p.estado='APPROVED'",
  'WHERE m.id=? AND m.empresa_id=? AND m.curso_id=?',
  "AND m.status='EM_ANDAMENTO' AND m.deleted_at IS NULL",
  'AND m.funcionario_id=? AND cy.id=? AND b.id=? AND ed.id=?',
  'AND ed.artifact_sha256=? AND p.id=?',
  'AND p.source_sha256=? AND p.bank_sha256=? AND p.policy_sha256=?',
  'AND c.gerar_qualificacao_ao_concluir=?',
  'AND (?=0 OR c.qualificacao_tipo_id=?)',
  'AND (?=0 OR EXISTS (SELECT 1 FROM qualificacoes_tipos qt',
  'JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id',
  'AND qc.empresa_id=qt.empresa_id AND qc.ativo=1 AND qc.deleted_at IS NULL',
  'AND qc.lms_integrada=1',
  'WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id',
  'AND qt.ativo=1 AND qt.deleted_at IS NULL AND qc.id=?))',
  // Exact count of currently stored content evidence: a late content mutation
  // after server preflight must invalidate this transaction.
  'AND (SELECT COUNT(*) FROM lms_native_eventos e WHERE e.vinculo_id=b.id)=?',
  'AND (SELECT COUNT(DISTINCT e.unidade_id)',
  'FROM lms_native_eventos e WHERE e.vinculo_id=b.id)=?',
  'AND NOT EXISTS (SELECT 1 FROM json_each(?) unit',
  'WHERE NOT EXISTS(SELECT 1 FROM lms_native_eventos e',
  'WHERE e.vinculo_id=b.id AND e.unidade_id=unit.value))',
  // Every individually approved stage receipt is pinned, including attempt,
  // answer hash, grade, and policy. The array is server constructed.
  'AND NOT EXISTS(SELECT 1 FROM json_each(?) stage',
  'WHERE NOT EXISTS(SELECT 1 FROM lms_player3_tentativas_modulares t',
  'WHERE t.vinculo_id=b.id AND t.politica_id=p.id',
  "AND t.etapa_id=json_extract(stage.value,'$.stageId')",
  "AND t.id=json_extract(stage.value,'$.attemptId')",
  "AND t.tentativa_numero=json_extract(stage.value,'$.attemptNumber')",
  "AND t.answers_sha256=json_extract(stage.value,'$.answersHash')",
  "AND t.score_pct=json_extract(stage.value,'$.scorePct')",
  'AND t.passed=1))',
  // Prevent a missing or previously unknown official stage from silently
  // being omitted from the expected server-pinned stage list.
  'AND (SELECT COUNT(DISTINCT t.etapa_id)',
  'FROM lms_player3_tentativas_modulares t',
  'WHERE t.vinculo_id=b.id AND t.politica_id=p.id)=?',
  ") THEN 'null' ELSE 'PLAYER3_TERMINAL_EVIDENCE_CHANGED' END)",
].join(' ');

export function buildPlayer3TerminalTransactionGuard(
  anchor:Player3TerminalAnchor,env?:Env,
):Readonly<{sql:string;bindings:readonly (number|string)[]}>{
  const ids=[
    anchor.empresaId,anchor.matriculaId,anchor.cursoId,anchor.cicloId,
    anchor.funcionarioId,anchor.actorUserId,anchor.bindingId,
    anchor.edicaoId,anchor.politicaId,
  ];
  const stages=anchor.officialStages;
  const lessons=anchor.requiredLessonIds;
  if(!ids.every(pos)||
     ![anchor.editionHash,anchor.sourceHash,anchor.bankHash,anchor.policyHash].every(v=>SHA.test(v))||
     !Array.isArray(lessons)||lessons.length<1||lessons.length>500||
     lessons.some(v=>typeof v!=='string'||!ID.test(v))||
     new Set(lessons).size!==lessons.length||
     !Array.isArray(stages)||stages.length<1||stages.length>100||
     stages.some(s=>!s||!ID.test(s.stageId)||
       !pos(s.attemptId)||!pos(s.attemptNumber)||s.attemptNumber>500||
       !SHA.test(s.answersHash)||!Number.isInteger(s.scorePct)||
       s.scorePct<0||s.scorePct>100)||
     new Set(stages.map(s=>s.stageId)).size!==stages.length||
     !Number.isSafeInteger(anchor.recordedEventCount)||
     anchor.recordedEventCount<lessons.length||anchor.recordedEventCount>10000||
     typeof anchor.gerarQualificacaoAoConcluir!=='boolean'){
    throw new Player3TerminalGuardError('PLAYER3_TERMINAL_INVALID_ANCHOR');
  }
  const requires=anchor.gerarQualificacaoAoConcluir;
  if(requires?
     !pos(anchor.qualificacaoTipoId!)||!pos(anchor.qualificacaoCategoriaId!):
     anchor.qualificacaoTipoId!==null||anchor.qualificacaoCategoriaId!==null){
    throw new Player3TerminalGuardError('PLAYER3_TERMINAL_INVALID_QUALIFICATION');
  }
  const signedStages=stages.map(s=>({
    stageId:s.stageId,attemptId:s.attemptId,
    attemptNumber:s.attemptNumber,answersHash:s.answersHash,
    scorePct:s.scorePct,
  }));
  return {
    // Physical Native and the staged, explicitly activated SCORM catalog
    // share the SAME tenant-scoped evidence contract; external SCORM is never
    // treated as Native without a governed activation row.
    sql:nativeScopedSql(SQL,env,anchor.empresaId),
    bindings:[
      anchor.actorUserId,anchor.matriculaId,anchor.empresaId,
      anchor.cursoId,anchor.funcionarioId,anchor.cicloId,
      anchor.bindingId,anchor.edicaoId,anchor.editionHash,anchor.politicaId,
      anchor.sourceHash,anchor.bankHash,anchor.policyHash,
      Number(requires),Number(requires),anchor.qualificacaoTipoId??0,
      Number(requires),anchor.qualificacaoCategoriaId??0,
      anchor.recordedEventCount,lessons.length,JSON.stringify(lessons),
      JSON.stringify(signedStages),stages.length,
    ],
  };
}
