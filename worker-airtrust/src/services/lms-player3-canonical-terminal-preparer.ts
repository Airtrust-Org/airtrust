/**
 * Player 3 server-only canonical terminal preparation.
 *
 * Collects ONLY immutable verified evidence: source-pinned R2 course, native
 * learning event ledger, private per-stage answers and authenticated D1 course
 * /qualification metadata. Returns a transaction-local SQL guard plus the
 * canonical metadata required by a FUTURE governed completion writer.
 *
 * No route calls this function; no D1/R2 writes or certificate issuance.
 * The guard must run as the FIRST statement in one canonical D1.batch.
 */
import type {Env} from '../types';
import {readNativeLearnerSession} from './lms-native-readiness-repository';
import {preparePlayer3VerifiedPassProofs} from './lms-player3-terminal-proof-preparer';
import {
  buildPlayer3TerminalTransactionGuard,
  type Player3TerminalAnchor,
} from './lms-player3-terminal-transaction-guard';
import {requireActiveQualificationCategoryById} from './qualification-category-contract';
import {nativeScopedSql} from './lms-native-catalog-legacy-guard';
import {NATIVE_ACTIVE_USER_CONDITION,NATIVE_ACTIVE_EMPLOYEE_JOIN}
  from './lms-native-active-learner-sql';
import {Player3StageWriteError} from './lms-player3-module-attempt-writer';
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;

type Metadata={
  funcionario_id:number;curso_titulo:string;
  gerar_qualificacao_ao_concluir:number;
  qualificacao_tipo_id:number|null;
  qualificacao_tipo_ativo_id:number|null;
  qualificacao_categoria_id:number|null;
  qualificacao_codigo:string|null;
  qualificacao_nome:string|null;
  qualificacao_categoria:string|null;
  qualificacao_validade:number|null;
  qualificacao_vencimento_fim_mes:number|null;
  qualificacao_historico_id:number|null;
};
const META_SQL=[
  'SELECT m.funcionario_id,c.titulo AS curso_titulo,',
  'c.gerar_qualificacao_ao_concluir,c.qualificacao_tipo_id,',
  'qt.id AS qualificacao_tipo_ativo_id,qt.categoria_id AS qualificacao_categoria_id,',
  'qt.codigo AS qualificacao_codigo,qt.nome AS qualificacao_nome,',
  'qt.categoria AS qualificacao_categoria,qt.validade AS qualificacao_validade,',
  'qt.vencimento_fim_mes AS qualificacao_vencimento_fim_mes,',
  'm.qualificacao_historico_id',
  'FROM lms_native_matricula_edicoes b',
  'JOIN lms_matriculas m ON m.id=b.matricula_id AND m.empresa_id=b.empresa_id',
  "AND m.curso_id=b.curso_id AND m.status='EM_ANDAMENTO' AND m.deleted_at IS NULL",
  'JOIN lms_matricula_ciclos cy ON cy.id=b.ciclo_id AND cy.matricula_id=m.id',
  'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
  'AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1',
  "AND cy.status='EM_ANDAMENTO' AND cy.deleted_at IS NULL",
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id AND ed.empresa_id=b.empresa_id',
  "AND ed.curso_id=b.curso_id AND ed.status='PUBLISHED'",
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  "AND c.tipo_conteudo='native' AND c.ativo=1 AND c.publicado=1",
  'AND c.deleted_at IS NULL',
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id',
  'AND u.deleted_at IS NULL',NATIVE_ACTIVE_USER_CONDITION,
  NATIVE_ACTIVE_EMPLOYEE_JOIN,
  'LEFT JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id',
  'AND qt.empresa_id=c.empresa_id AND qt.ativo=1 AND qt.deleted_at IS NULL',
  'WHERE b.id=? AND b.edicao_id=? AND b.empresa_id=?',
  'AND b.matricula_id=? AND b.ciclo_id=? AND b.curso_id=?',
  'AND ed.artifact_sha256=? LIMIT 1',
].join(' ');

export type Player3PreparedTerminal=Readonly<{
  ready:true;
  canonical:Readonly<{
    empresaId:number;matriculaId:number;cursoId:number;cicloId:number;
    funcionarioId:number;cursoTitulo:string;editionSha256:string;
    gerarQualificacaoAoConcluir:boolean;
    qualificacaoTipoId:number|null;
    qualificacaoCategoriaId:number|null;
    qualificacaoCodigo:string|null;
    qualificacaoNome:string|null;
    qualificacaoCategoria:string|null;
    validade:number|null;vencimentoFimMes:0|1|null;
    existingHistoricoId:number|null;
  }>;
  atomicGuard:Readonly<{sql:string;bindings:readonly (number|string)[]}>;
  terminalAnchor:Player3TerminalAnchor;
  /** No course status, qualification or certificate is written. */
  completionSupported:false;
}>;
function deny(code:string):never{throw new Player3StageWriteError(code);}
export async function preparePlayer3CanonicalTerminal(input:{
  env:Env;db:D1Database;bucket:R2Bucket;actorUserId:number;
  empresaId:number;matriculaId:number;
}):Promise<Player3PreparedTerminal>{
  const {empresaId,matriculaId,actorUserId,db,env}=input;
  if(![empresaId,matriculaId,actorUserId].every(positive)){
    deny('PLAYER3_TERMINAL_ACCESS_INVALID');
  }
  const prepared=await preparePlayer3VerifiedPassProofs(input);
  const {course,binding,officialStages}=prepared;
  if(course.mode!=='LEARN'||!positive(binding.vinculo_id)||
     !positive(binding.edicao_id)||!positive(binding.politica_id)){
    deny('PLAYER3_TERMINAL_EDITIONS_INVALID');
  }
  const scope={
    empresaId,matriculaId,cursoId:course.cursoId,
    cicloId:course.cicloId,artifactHash:course.editionHash,
  };
  const [lessons,metadata]=await Promise.all([
    readNativeLearnerSession({
      env,db,actorUserId,scope,artifact:course.artifact,
    }),
    db.prepare(nativeScopedSql(META_SQL,env,empresaId)).bind(
      actorUserId,binding.vinculo_id,binding.edicao_id,empresaId,
      matriculaId,course.cicloId,course.cursoId,course.editionHash,
    ).first<Metadata>(),
  ]);
  if(!metadata||!positive(metadata.funcionario_id)||
     !metadata.curso_titulo?.trim()||
     ![0,1].includes(metadata.gerar_qualificacao_ao_concluir)){
    deny('PLAYER3_TERMINAL_COURSE_MAPPING_CHANGED');
  }
  const required=course.artifact.units.filter(u=>u.kind==='lesson').map(u=>u.id);
  const seen=lessons.summary.seenLessonIds;
  if(!required.length||!Array.isArray(seen)||
     lessons.summary.mode!=='LEARN'||
     lessons.summary.editionHash!==course.editionHash||
     lessons.summary.cicloId!==course.cicloId||
     !Number.isSafeInteger(lessons.summary.nextSequence)||
     lessons.summary.nextSequence<required.length+1||
     new Set(required).size!==required.length||
     new Set(seen).size!==seen.length||
     seen.length!==required.length||
     required.some(id=>!seen.includes(id))){
    deny('PLAYER3_TERMINAL_CONTENT_INCOMPLETE');
  }
  const qualification=metadata.gerar_qualificacao_ao_concluir===1;
  if(qualification&&(!positive(metadata.qualificacao_tipo_id!)||
     metadata.qualificacao_tipo_ativo_id!==metadata.qualificacao_tipo_id||
     !String(metadata.qualificacao_codigo??metadata.qualificacao_nome??'').trim()||
     !positive(metadata.qualificacao_categoria_id!))){
    deny('PLAYER3_TERMINAL_QUALIFICATION_INVALID');
  }
  if(metadata.qualificacao_vencimento_fim_mes!==null&&qualification&&
     ![0,1].includes(metadata.qualificacao_vencimento_fim_mes)){
    deny('PLAYER3_TERMINAL_EXPIRATION_INVALID');
  }
  let categoryId:number|null=null,categoryName:string|null=null;
  let categoryCode:string|null=null;
  if(qualification){
    let c:Awaited<ReturnType<typeof requireActiveQualificationCategoryById>>;
    try{
      c=await requireActiveQualificationCategoryById(
        db,empresaId,metadata.qualificacao_categoria_id!,
      );
    }catch{throw new Player3StageWriteError('PLAYER3_TERMINAL_QUALIFICATION_INVALID');}
    if(!c||!c.lmsIntegrada||c.empresaId!==empresaId){
      deny('PLAYER3_TERMINAL_QUALIFICATION_INVALID');
    }
    categoryId=c.id;
    categoryName=c.nome;
    categoryCode=c.codigo;
  }
  const terminalAnchor:Player3TerminalAnchor={
    empresaId,matriculaId,cursoId:course.cursoId,cicloId:course.cicloId,
    funcionarioId:metadata.funcionario_id,actorUserId,
    bindingId:binding.vinculo_id,edicaoId:binding.edicao_id,
    politicaId:binding.politica_id,editionHash:course.editionHash,
    sourceHash:prepared.sourceHash,bankHash:prepared.bankHash,
    policyHash:prepared.policyHash,
    requiredLessonIds:required,
    officialStages,
    recordedEventCount:lessons.summary.nextSequence-1,
    gerarQualificacaoAoConcluir:qualification,
    qualificacaoTipoId:qualification?metadata.qualificacao_tipo_id:null,
    qualificacaoCategoriaId:categoryId,
  };
  const atomicGuard=buildPlayer3TerminalTransactionGuard(terminalAnchor,env);
  return{
    ready:true,completionSupported:false,atomicGuard,terminalAnchor,
    canonical:{
      empresaId,matriculaId,cursoId:course.cursoId,cicloId:course.cicloId,
      funcionarioId:metadata.funcionario_id,cursoTitulo:metadata.curso_titulo,
      editionSha256:course.editionHash,
      gerarQualificacaoAoConcluir:qualification,
      qualificacaoTipoId:qualification?metadata.qualificacao_tipo_id:null,
      qualificacaoCategoriaId:categoryId,
      qualificacaoCodigo:qualification?metadata.qualificacao_codigo:null,
      qualificacaoNome:qualification?metadata.qualificacao_nome:null,
      qualificacaoCategoria:categoryName,
      validade:qualification?metadata.qualificacao_validade:null,
      vencimentoFimMes:qualification?
        metadata.qualificacao_vencimento_fim_mes as 0|1|null:null,
      existingHistoricoId:qualification?metadata.qualificacao_historico_id:null,
    },
  };
}
