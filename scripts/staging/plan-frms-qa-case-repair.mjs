#!/usr/bin/env node
// source_reference: AirTrust #1426, readonly D1 run #39076290801, PRs #1550/#1561/#1562.
// operational_decision: only plan the eight fixed QA D1 changes, never execute.
// dry_run_required: pure function; no network, filesystem write, D1 or subprocess.
// rollback_plan_required: protected row preimages, D1 Time Travel and CAS compensation.
import { expectedQaCases, LEGACY_CASE_BASELINE } from './inspect-frms-ux-cases.mjs';

export const TENANT=999013;
export const DB_UUID='bf9963f4-eb12-439b-a830-20bbf577ac22';
export const OLD_MARKER='CENARIO SINTETICO - SEM VALIDADE OPERACIONAL';
export const NEW_MARKER='CENARIO SINTETICO - FONTE SIMULADA SEM VALIDADE OPERACIONAL';
const MESSAGE='QA SINTETICO: revisar contexto e registrar providencia';
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const date=x=>{
  if(!/^2026-(09|10)-[0-3][0-9]$/.test(x) || !Number.isFinite(Date.parse(x+'T00:00:00Z')))
    throw Error('QA_DATE_INVALID');
  return x;
};

export function buildQaRepairPlan(days){
  const targets=expectedQaCases(days);
  if(targets.length!==4||LEGACY_CASE_BASELINE.length!==4)throw Error('QA_SCOPE_INVALID');
  const cases=[], journeySql=[], alertSql=[],ids=new Set(),journeys=new Set();
  for(let i=0;i<4;i++){
    const w=targets[i],o=LEGACY_CASE_BASELINE[i];
    if(w.id!==o.id || w.kind!==o.kind ||
       !/^qa-frms-ux-case-[1-4]$/.test(w.id) ||
       !/^QA-FRMS-UX-0[12]$/.test(w.matricula) ||
       !/^QA-FRMS-UX-(0[1-9]|1[0-4])$/.test(o.owner) || ids.has(w.id))
      throw Error('QA_CASE_IDENTITY_DRIFT');
    ids.add(w.id);
    const newDay=date(w.date),oldDay=date(o.day);
    const jid='qa-frms-ux-j-'+newDay+'-'+w.matricula;
    if(journeys.has(jid))throw Error('QA_TARGET_JOURNEY_DUPLICATE');
    journeys.add(jid);
    const person=(crew)=>"(SELECT f.id FROM funcionarios f WHERE f.empresa_id="+TENANT+
      " AND f.matricula="+quote(crew)+
      " AND f.deleted_at IS NULL AND f.ativo=1 AND f.status='ATIVO')";
    const jScope="j.id="+quote(jid)+" AND j.empresa_id="+TENANT+
      " AND j.tripulante_id="+person(w.matricula)+" AND j.data="+quote(newDay)+
      " AND j.deleted_at IS NULL AND j.registrado_por='QA_FRMS_UX'"+
      " AND j.duracao_jornada_minutos>0";
    journeySql.push("UPDATE frms_jornada AS j SET origem='SIGVOOS',observacao="+quote(NEW_MARKER)+
      ",updated_at=datetime('now') WHERE "+jScope+
      " AND j.origem='MANUAL' AND j.observacao="+quote(OLD_MARKER));
    const duration="(SELECT j.duracao_jornada_minutos FROM frms_jornada j WHERE "+
      jScope+" AND j.origem='SIGVOOS' AND j.observacao="+quote(NEW_MARKER)+")";
    alertSql.push("UPDATE frms_alerta AS a SET tripulante_id="+person(w.matricula)+
      ",jornada_id="+quote(jid)+",valor_atual_min="+duration+
      ",created_at="+quote(newDay+' 10:00:00')+",updated_at=datetime('now')"+
      " WHERE a.id="+quote(w.id)+" AND a.deleted_at IS NULL"+
      " AND a.tripulante_id="+person(o.owner)+" AND a.jornada_id IS NULL"+
      " AND a.tipo_limite="+quote(o.kind)+" AND a.nivel="+quote(o.level)+
      " AND a.created_at="+quote(oldDay+' 10:00:00')+
      " AND a.valor_atual_min=620 AND a.valor_limite_min=540"+
      " AND a.mensagem="+quote(MESSAGE)+
      " AND a.resolvido=0 AND a.resolvido_em IS NULL AND a.resolvido_por IS NULL"+
      " AND a.visualizado=0 AND a.visualizado_em IS NULL"+
      " AND a.notas_resolucao IS NULL AND "+duration+">0");
    cases.push({id:w.id,journeyId:jid,newDay,oldDay,type:w.kind});
  }
  return {mode:'PREPARE_ONLY',tenantId:TENANT,dbUuid:DB_UUID,
    cases,statements:[...journeySql,...alertSql],expectedChanges:8,
    approved:false,requiresAuthorizedWorkflow:true};
}
