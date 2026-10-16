import { describe, expect, it } from 'vitest';
import { buildTrainingComplianceRosterPlan, type RosterCourse, type RosterEnrollment } from '../../services/training-compliance-roster-plan';
import type { TrainingComplianceSnapshot } from '../../routes/compliance-treinamentos';

const course: RosterCourse = { id:56, qualificacao_tipo_id:7 };
const otherCourse: RosterCourse = { id:57, qualificacao_tipo_id:8 };
type Requirement = TrainingComplianceSnapshot['people'][number]['requisitos'][number];

function requirement(status:string, opts:Record<string,unknown>={}) {
  return {
    obrigatoriedade:'OBRIGATORIA', qualificacao_tipo_id:7,
    status_compliance:status, modalidade_requerida:'EAD',
    evidencia_pendente_validacao:false,
    ...opts,
  } as Requirement;
}
function person(id:number, requests:Requirement[]) {
  return {id,requisitos:requests} as TrainingComplianceSnapshot['people'][number];
}
function snapshot(...people:ReturnType<typeof person>[]) {
  return {people} as Pick<TrainingComplianceSnapshot,'people'>;
}
function row(id:number, status='NAO_INICIADO', extra:Partial<RosterEnrollment>={}):RosterEnrollment {
  return {
    id, funcionario_id:101, curso_id:56, status,deleted_at:null,
    progresso_pct:0,data_inicio:null,data_conclusao:null,
    qualificacao_historico_id:null,has_scorm:0,has_xapi:0,
    has_history:0,has_diagnostics:0,has_cycle_evidence:0,...extra,
  };
}
const plan = (s:ReturnType<typeof snapshot>, courses:RosterCourse[]=[course], rows:RosterEnrollment[]=[], keep?:Set<number>) =>
  buildTrainingComplianceRosterPlan(s,courses,rows,keep);

describe('Matrícula orientada por função e situação da qualificação',()=>{
  it('matricula empregado com requisito obrigatório sem qualquer histórico',()=>{
    const result=plan(snapshot(person(101,[requirement('NAO_REALIZADO')])));
    expect(result.enroll).toEqual([{funcionarioId:101,cursoId:56,tipoId:7,existingId:null}]);
  });
  it('matricula histórico vencido mas não quem permanece conforme ou vencendo',()=>{
    const result=plan(snapshot(
      person(101,[requirement('VENCIDO')]),
      person(102,[requirement('CONFORME')]),
      person(103,[requirement('VENCENDO')]),
    ));
    expect(result.enroll.map(x=>x.funcionarioId)).toEqual([101]);
  });
  it('não matricula quem tem matrícula em andamento ou não iniciada',()=>{
    const result=plan(snapshot(person(101,[requirement('NAO_REALIZADO')])),[course],[row(10,'EM_ANDAMENTO')]);
    expect(result.enroll).toHaveLength(0);
  });
  it('não usa ausência de nome para inferir designação, perfil ou modalidade',()=>{
    const result=plan(snapshot(
      person(101,[requirement('NAO_REALIZADO',{evidencia_pendente_validacao:true})]),
      person(102,[requirement('NAO_REALIZADO',{modalidade_requerida:'PRESENCIAL'})]),
      person(103,[requirement('NAO_REALIZADO',{obrigatoriedade:'NAO_APLICA'})]),
    ));
    expect(result.enroll).toHaveLength(0);
    expect(result.skippedPendingEvidence).toBe(1);
    expect(result.skippedManualModality).toBe(1);
  });
  it('recusa vínculo ambíguo de curso com mesma qualificação',()=>{
    const result=plan(snapshot(person(101,[requirement('VENCIDO')])),[course,{id:77,qualificacao_tipo_id:7}]);
    expect(result.enroll).toHaveLength(0);
    expect(result.skippedAmbiguousCourses).toBe(1);
  });
  it('retira matrícula nunca iniciada de pessoa com treinamento válido',()=>{
    const result=plan(snapshot(person(101,[requirement('CONFORME')])),[course],[row(12)]);
    expect(result.remove).toEqual([{matriculaId:12,funcionarioId:101,cursoId:56,motivo:'EVIDENCIA_VALIDA'}]);
  });
  it('retira matrícula de cargo sem requisito, sem apagar histórico ou progresso',()=>{
    const result=plan(snapshot(person(101,[])),[course],[row(12),row(13,'CONCLUIDO'),row(14,'NAO_INICIADO',{has_scorm:1}),row(15,'NAO_INICIADO',{data_inicio:'2026-10-10'})]);
    expect(result.remove.map(r=>r.matriculaId)).toEqual([12]);
    expect(result.protectedCount).toBe(2);
  });
  it('preserva decisão explícita para matrícula avulsa e linha já cancelada',()=>{
    const result=plan(snapshot(person(101,[])),[course],[row(12),row(13,'CANCELADO')],new Set([12]));
    expect(result.remove).toHaveLength(0);
  });
  it('não limpa matrícula quando qualificação está vencida/sem realização',()=>{
    const result=plan(snapshot(person(101,[requirement('VENCIDO')])),[course],[row(12)]);
    expect(result.remove).toHaveLength(0);
    expect(result.enroll).toHaveLength(0);
  });
  it('prioriza apenas cursos do mapeamento e ignora cursos desconhecidos',()=>{
    const result=plan(snapshot(person(101,[])),[otherCourse],[row(30)]);
    expect(result.remove).toHaveLength(0);
    expect(result.protectedCount).toBe(1);
  });
});
