import { describe, expect, it } from 'vitest';
import { buildTrainingComplianceRosterPlan, selectTrainingComplianceRosterBatch, type RosterCourse, type RosterEnrollment } from '../../services/training-compliance-roster-plan';
import type { TrainingComplianceSnapshot } from '../../routes/compliance-treinamentos';

const course: RosterCourse = { id:56, qualificacao_tipo_id:7, ativo:1, publicado:1 };
const otherCourse: RosterCourse = { id:57, qualificacao_tipo_id:8, ativo:1, publicado:1 };
type Requirement = TrainingComplianceSnapshot['people'][number]['requisitos'][number];

function requirement(status:string, opts:Record<string,unknown>={}) {
  return {
    obrigatoriedade:'OBRIGATORIA', qualificacao_tipo_id:7, regra_id:1,
    status_compliance:status, modalidade_requerida:'EAD', auto_matricular_ead:1,
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
    expect(result.enroll).toEqual([{funcionarioId:101,cursoId:56,tipoId:7,existingId:null,regraId:1}]);
  });
  it('falha fechado sem opt-in explícito (0/NULL/ausente), modalidade e curso publicados',()=>{
    const s = snapshot(
      person(101,[requirement('NAO_REALIZADO',{auto_matricular_ead:0})]),
      person(102,[requirement('NAO_REALIZADO',{auto_matricular_ead:null})]),
      person(103,[requirement('NAO_REALIZADO',{auto_matricular_ead:undefined})]),
      person(104,[requirement('NAO_REALIZADO',{modalidade_requerida:null})]),
      person(105,[requirement('NAO_REALIZADO',{modalidade_requerida:'PRESENCIAL'})]),
    );
    expect(plan(s).enroll).toHaveLength(0);
    expect(plan(s).skippedPolicyOptOut).toBe(3);
    expect(plan(s).skippedManualModality).toBe(2);
    expect(plan(snapshot(person(101,[requirement('NAO_REALIZADO')])),[{...course,publicado:undefined}]).enroll).toHaveLength(0);
    expect(plan(snapshot(person(101,[requirement('NAO_REALIZADO')])),[{...course,ativo:0}]).enroll).toHaveLength(0);
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
    const result=plan(snapshot(person(101,[requirement('VENCIDO')])),[course,{id:77,qualificacao_tipo_id:7,ativo:1,publicado:1}]);
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
  it('não toma decisão destrutiva quando o mesmo tipo exige dois perfis',()=>{
    const result=plan(snapshot(person(101,[
      requirement('CONFORME',{perfil_competencia:'PERFIL_1'}),
      requirement('NAO_REALIZADO',{perfil_competencia:'PERFIL_2'}),
    ])),[course],[row(12)]);
    expect(result.enroll).toHaveLength(0);
    expect(result.remove).toHaveLength(0);
    expect(result.protectedCount).toBe(1);
  });
  it('não limpa matrícula quando qualificação está vencida/sem realização',()=>{
    const result=plan(snapshot(person(101,[requirement('VENCIDO')])),[course],[row(12)]);
    expect(result.remove).toHaveLength(0);
    expect(result.enroll).toHaveLength(0);
  });
  it('retira matrícula sem requisito mesmo em curso despublicado, mas não cria nova',()=>{
    const archived={...course,publicado:0};
    const outdated=plan(snapshot(person(101,[])),[archived],[row(30)]);
    expect(outdated.remove.map(r=>r.matriculaId)).toEqual([30]);
    expect(plan(snapshot(person(101,[requirement('VENCIDO')])),[archived]).enroll).toHaveLength(0);
  });
  it('prioriza apenas cursos do mapeamento e ignora cursos desconhecidos',()=>{
    const result=plan(snapshot(person(101,[])),[otherCourse],[row(30)]);
    expect(result.remove).toHaveLength(0);
    expect(result.protectedCount).toBe(1);
  });
});

describe('Cursor persistente do roster: justiça, limites e idempotência do plano', () => {
  it('não deixa uma linha insegura no início impedir os próximos lotes', () => {
    const full = plan(snapshot(person(101, [])), [course],
      Array.from({ length: 11 }, (_, index) => row(20 + index)));
    const first = selectTrainingComplianceRosterBatch(full, null, 3);
    const second = selectTrainingComplianceRosterBatch(full, first.cursorAfter, 3);
    const third = selectTrainingComplianceRosterBatch(full, second.cursorAfter, 3);
    expect(first.batch.remove.map(x => x.matriculaId)).toEqual([20, 21, 22]);
    expect(second.batch.remove.map(x => x.matriculaId)).toEqual([23, 24, 25]);
    expect(third.batch.remove.map(x => x.matriculaId)).toEqual([26, 27, 28]);
    expect(first.totalActions).toBe(11);
    expect(first.batch.enroll).toHaveLength(0);
  });

  it('continua com cursor mesmo quando ações anteriores já saíram do snapshot', () => {
    const original = plan(snapshot(person(101, [])), [course], [row(10), row(20), row(30)]);
    const first = selectTrainingComplianceRosterBatch(original, null, 2);
    const after = plan(snapshot(person(101, [])), [course], [row(30), row(40)]);
    const next = selectTrainingComplianceRosterBatch(after, first.cursorAfter, 1);
    expect(first.batch.remove.map(x => x.matriculaId)).toEqual([10, 20]);
    expect(next.batch.remove.map(x => x.matriculaId)).toEqual([30]);
    expect(selectTrainingComplianceRosterBatch(after, next.cursorAfter, 1).batch.remove[0].matriculaId).toBe(40);
  });

  it('percorre matrícula e remoção sem ultrapassar o limite nem alterar o plano original', () => {
    const full = plan(snapshot(person(101, []), ...Array.from({length: 8}, (_,i) =>
      person(102+i,[requirement('NAO_REALIZADO')]))), [course], [row(10), row(11)]);
    const before = JSON.stringify(full);
    let cursor: string | null = null;
    const selected = new Set<string>();
    for (let attempt = 0; attempt < 5; attempt++) {
      const batch = selectTrainingComplianceRosterBatch(full, cursor, 2);
      for (const a of batch.batch.remove) selected.add(`R:${a.matriculaId}`);
      for (const a of batch.batch.enroll) selected.add(`E:${a.funcionarioId}`);
      expect(batch.selectedCount).toBe(2);
      cursor = batch.cursorAfter;
    }
    expect(selected.size).toBe(10);
    expect(JSON.stringify(full)).toBe(before);
  });

  it('cursor inválido falha seguro para o início e resultado vazio limpa cursor', () => {
    const full = plan(snapshot(person(101, [])), [course], [row(10)]);
    expect(selectTrainingComplianceRosterBatch(full, 'bad-cursor', 3).batch.remove[0].matriculaId).toBe(10);
    const empty = selectTrainingComplianceRosterBatch(plan(snapshot(person(101, []))), '0:0000000000000010', 3);
    expect(empty).toMatchObject({ cursorAfter:null, selectedCount:0, totalActions:0 });
  });
});
