#!/usr/bin/env node
// Fixed CV/FRMS staging diagnostic: SELECT/PRAGMA only; no crew or clinical values.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DB='airtrust-db-staging-baseline-20260701';
const DB_ID='bf9963f4-eb12-439b-a830-20bbf577ac22';
const PROD_ID='7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const columns={
 cv_voos:['id','prefixo','status','data_programacao','horario_previsto_partida','aeronave_id','empresa_id','deleted_at'],
 aeronaves:['id','modelo','empresa_id','deleted_at'],
 cv_voo_tripulantes:['voo_id','funcionario_id','funcao','empresa_id','deleted_at'],
 funcionarios:['id','nome','empresa_id','deleted_at'],
 escala_voo_diaria:['data','pic_id','sic_id','hora_apresentacao','hora_corte_motor','hora_pouso_real','hora_pouso_previsto','aeronave_prefixo','aeronave_modelo','empresa_id','deleted_at'],
 frms_fadiga_checkin:['data_checkin','funcionario_id','hora_checkin','submitted_at','jornada_inicio_prevista','kss_score','horas_sono','qualidade_sono','wake_time','score_fadiga','nivel_fadiga','status_operacional','computed_risk_level','empresa_id','deleted_at'],
 frms_fatorizacao_jornada:['jornada_id','effectiveness_pct','effectiveness_nivel','effectiveness_componentes_json','dia_periodo_embarcado','total_dias_periodo','deleted_at','created_at'],
 frms_jornada:['id','data','tripulante_id','deleted_at'],
 frms_acumulo_rolling:['data_referencia','tripulante_id','hv_dia_min','hv_mes_calendario_min','hv_28_dias_min','hv_365_dias_min','hv_ano_calendario_min','repouso_anterior_min','repouso_suficiente','deleted_at'],
 escala_alocacoes:['funcionario_id','data_inicio','data_fim','quinzena_id','aeronave_id','situacao_tipo','status','deleted_at'],
 escalas_quinzenas:['id','empresa_id','data_inicio','data_fim','numero','deleted_at'],
 frms_escala_quinzenal:['tripulante_id','data_inicio_embarque','data_fim_embarque','status_ciclo','deleted_at']
};
// Phase-2 coverage: source dependencies reached by the real FRMS snapshot but
// not exercised by the initial 0463/0464 and rolling-column diagnostic.
// Only schema names are emitted; no crew, clinical or operational rows.
Object.assign(columns,{
 cv_voos:[...columns.cv_voos,'sigvoos_flight_report_id','sigvoos_flight_number','origem_id','destino_id','origem_importacao','campos_editados_json','sigvoos_importado_em'],
 cv_voo_tripulantes:[...columns.cv_voo_tripulantes,'id','etapa_id','sigvoos_staff_id','funcao_origem','horario_apresentacao','horario_dispensa'],
 cv_voo_etapas:['id','empresa_id','deleted_at','sigvoos_leg_number','origem_icao','destino_icao','horario_motor_ligado','horario_decolagem','horario_pouso','horario_motor_desligado','tempo_total','tempo_navegacao','tempo_ifr','tempo_noturno','pousos_diurnos','pousos_noturnos','starts','pax','combustivel_inicio','combustivel_fim','origem_dados','metadata_sigvoos_json','sigvoos_importado_em','numero_etapa'],
 cv_aeroportos:['id','codigo_icao','codigo','empresa_id','deleted_at'],
 cv_conflitos_integracao:['empresa_id','status','deleted_at','entidade_tipo','entidade_id','campo','justificativa'],
 cv_sigvoos_staging:['empresa_id','deleted_at','cv_tripulante_id','import_status','erro_msg','processado_em'],
 frms_jornada:[...columns.frms_jornada,'hora_apresentacao','hora_termino','hora_corte_motor','hora_ultimo_pouso','horas_voo_minutos','duracao_jornada_minutos','hora_primeiro_acionamento','hora_primeira_decolagem','origem'],
 treinamentos_participantes:['treinamento_id','funcionario_id'],
 treinamentos_instrutores:['treinamento_id','funcionario_id'],
 treinamentos_planejados:['id','empresa_id','deleted_at','instrutor_id','data_prevista','data_inicio','data_fim','sessao_id','simulador_id','hora_inicio','hora_fim','titulo','codigo_turma','status'],
 treinamentos_dias:['id','empresa_id','deleted_at','treinamento_id','data','sessao_id','simulador_id','hora_inicio','hora_fim','status'],
 simulador_agendamentos:['id','empresa_id','deleted_at','funcionario_id','instrutor_id','checador_id','examinador_id','data','hora_inicio','hora_fim','nome','tipo_sessao','status'],
 sessoes_participantes:['sessao_id','funcionario_id','deleted_at'],
 frms_recovery_activity_day:['id','empresa_id','funcionario_id','deleted_at','reference_date','activity_type','notes','duty_start_time','duty_end_time'],
 frms_recovery_activity_segment:['id','empresa_id','funcionario_id','recovery_day_id','activity_type','start_time','end_time']
});
const probes={
 flights:"SELECT v.id,v.prefixo,v.status,v.data_programacao,v.horario_previsto_partida,v.aeronave_id,a.modelo FROM cv_voos v LEFT JOIN aeronaves a ON a.id=v.aeronave_id AND a.empresa_id=v.empresa_id AND a.deleted_at IS NULL WHERE v.empresa_id=0 AND v.data_programacao='1970-01-01' AND v.deleted_at IS NULL ORDER BY v.horario_previsto_partida,v.id LIMIT 0",
 crew:"SELECT t.funcionario_id,t.funcao,f.nome FROM cv_voo_tripulantes t JOIN funcionarios f ON f.id=t.funcionario_id AND f.empresa_id=t.empresa_id AND f.deleted_at IS NULL WHERE t.voo_id=0 AND t.empresa_id=0 AND t.deleted_at IS NULL LIMIT 0",
 checkin:"SELECT ch.data_checkin,ch.funcionario_id,ch.hora_checkin,ch.submitted_at,ch.jornada_inicio_prevista,ch.kss_score,ch.horas_sono,ch.qualidade_sono,ch.wake_time,ch.score_fadiga,ch.nivel_fadiga,ch.status_operacional,ch.computed_risk_level FROM frms_fadiga_checkin ch WHERE ch.empresa_id=0 AND ch.deleted_at IS NULL LIMIT 0",
 rolling:"SELECT ar.data_referencia,ar.tripulante_id,ar.hv_dia_min,ar.hv_mes_calendario_min,ar.hv_28_dias_min,ar.hv_365_dias_min,ar.hv_ano_calendario_min,ar.repouso_anterior_min,ar.repouso_suficiente FROM frms_acumulo_rolling ar WHERE ar.deleted_at IS NULL LIMIT 0",
 effectiveness:"SELECT fj.effectiveness_pct,fj.effectiveness_nivel,fj.effectiveness_componentes_json,fj.dia_periodo_embarcado,fj.total_dias_periodo,j.data,j.tripulante_id FROM frms_fatorizacao_jornada fj JOIN frms_jornada j ON j.id=fj.jornada_id WHERE fj.deleted_at IS NULL AND j.deleted_at IS NULL LIMIT 0",
 mission:"SELECT ea.funcionario_id,ea.data_inicio,ea.data_fim,ea.quinzena_id,ea.aeronave_id,ea.situacao_tipo,ea.status,eq.numero FROM escala_alocacoes ea LEFT JOIN escalas_quinzenas eq ON eq.id=ea.quinzena_id AND eq.deleted_at IS NULL WHERE ea.deleted_at IS NULL LIMIT 0"
};
// Compile-only equivalents of the previously untested operational-source joins.
// The fixed impossible tenant/date and LIMIT 0 prohibit row materialization.
Object.assign(probes,{
 cv_jornadas_source:"SELECT t.id,t.etapa_id,t.sigvoos_staff_id,t.funcao_origem,t.horario_apresentacao,t.horario_dispensa,v.sigvoos_flight_report_id,v.sigvoos_flight_number,v.origem_importacao,v.campos_editados_json,e.sigvoos_leg_number,e.origem_icao,e.destino_icao,e.horario_motor_ligado,e.horario_decolagem,e.horario_pouso,e.horario_motor_desligado,e.tempo_total,e.tempo_navegacao,e.tempo_ifr,e.tempo_noturno,e.pousos_diurnos,e.pousos_noturnos,e.starts,e.pax,e.combustivel_inicio,e.combustivel_fim,e.origem_dados,e.metadata_sigvoos_json,ao.codigo_icao,ad.codigo_icao,c.campo,c.justificativa,s.import_status,s.erro_msg FROM cv_voo_tripulantes t JOIN cv_voos v ON v.id=t.voo_id AND v.empresa_id=t.empresa_id LEFT JOIN cv_voo_etapas e ON e.id=t.etapa_id AND e.empresa_id=t.empresa_id LEFT JOIN cv_aeroportos ao ON ao.id=v.origem_id AND ao.empresa_id=v.empresa_id LEFT JOIN cv_aeroportos ad ON ad.id=v.destino_id AND ad.empresa_id=v.empresa_id LEFT JOIN cv_conflitos_integracao c ON c.empresa_id=t.empresa_id AND c.entidade_id=t.id LEFT JOIN cv_sigvoos_staging s ON s.empresa_id=t.empresa_id AND s.cv_tripulante_id=t.id WHERE t.empresa_id=0 AND v.data_programacao='1970-01-01' LIMIT 0",
 legacy_jornadas_source:"SELECT j.hora_apresentacao,j.hora_termino,j.hora_corte_motor,j.hora_ultimo_pouso,j.horas_voo_minutos,j.duracao_jornada_minutos,j.hora_primeiro_acionamento,j.hora_primeira_decolagem,j.origem FROM frms_jornada j JOIN funcionarios f ON f.id=CAST(j.tripulante_id AS INTEGER) WHERE f.empresa_id=0 AND j.data='1970-01-01' LIMIT 0",
 training_activity_source:"SELECT td.data,td.sessao_id,td.simulador_id,t.titulo,t.codigo_turma,t.status,p.funcionario_id FROM treinamentos_dias td JOIN treinamentos_planejados t ON t.id=td.treinamento_id JOIN treinamentos_participantes p ON p.treinamento_id=t.id WHERE td.empresa_id=0 AND td.data='1970-01-01' LIMIT 0",
 simulator_activity_source:"SELECT sa.data,sa.hora_inicio,sa.hora_fim,sa.nome,sa.tipo_sessao,sp.funcionario_id FROM simulador_agendamentos sa JOIN sessoes_participantes sp ON sp.sessao_id=sa.id WHERE sa.empresa_id=0 AND sa.data='1970-01-01' LIMIT 0",
 recovery_activity_source:"SELECT rd.reference_date,rd.notes,rd.duty_start_time,rd.duty_end_time,rs.activity_type,rs.start_time,rs.end_time FROM frms_recovery_activity_day rd JOIN frms_recovery_activity_segment rs ON rs.recovery_day_id=rd.id AND rs.empresa_id=rd.empresa_id WHERE rd.empresa_id=0 AND rd.reference_date='1970-01-01' LIMIT 0"
});
function readOnly(sql) {
 const s=String(sql).trim();
 if(!/^(SELECT|PRAGMA)\b/i.test(s)||s.includes(';')||/\b(INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(s)) throw Error('READ_ONLY_SQL_BLOCKED');
 return s;
}
function query(sql) {
 const p=spawnSync('npx',['wrangler','d1','execute',DB,'--remote','--json','--command',readOnly(sql)],{cwd:path.join(root,'worker-airtrust'),encoding:'utf8',maxBuffer:4*1024*1024});
 if(p.status!==0) throw Error('D1_QUERY_FAILED');
 let json;try{json=JSON.parse(p.stdout);}catch{const start=p.stdout.search(/[\[{]/);if(start<0)throw Error('D1_JSON_INVALID');try{json=JSON.parse(p.stdout.slice(start));}catch{throw Error('D1_JSON_INVALID');}}
 const first=Array.isArray(json)?json[0]:json;
 if(first?.success===false) throw Error('D1_QUERY_REJECTED');
 return first?.results||[];
}
async function main(){
 if(process.env.STAGING_D1_NAME!==DB||process.env.STAGING_D1_ID!==DB_ID||process.env.STAGING_D1_ID===PROD_ID||!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID) throw Error('STAGING_ONLY_GUARD');
 const sha=String(process.env.EXPECTED_DEPLOYED_SHA||'').toLowerCase();
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('EXPECTED_SHA_INVALID');
 const response=await fetch('https://airtrust-api-staging.airtrust.workers.dev/api/version',{headers:{'Cache-Control':'no-store'}});
 if(!response.ok)throw Error('WORKER_UNREACHABLE');
 const v=await response.json();
 if(v?.data?.sourceSha!==sha||v?.data?.environment!=='staging')throw Error('WORKER_SHA_MISMATCH');
 const missing=[];
 for(const [table,required] of Object.entries(columns)){
  const actual=new Set(query('PRAGMA table_info('+table+')').map(x=>String(x.name)));
  if(actual.size===0)missing.push(table+':TABLE_MISSING');
  else for(const col of required)if(!actual.has(col))missing.push(table+'.'+col);
 }
 const compile={};
 for(const [name,sql] of Object.entries(probes)){try{query(sql);compile[name]='PASS';}catch{compile[name]='FAIL';}}
 let qaFlights={state:'NOT_CHECKED',counts:[]};
 if(compile.flights==='PASS')try{
  const rows=query("SELECT empresa_id,COUNT(*) AS total FROM cv_voos WHERE empresa_id IN (999006,999013) AND data_programacao='2026-10-27' AND deleted_at IS NULL GROUP BY empresa_id");
  qaFlights={state:'READABLE',counts:[999006,999013].map(id=>({tenantLabel:id===999006?'qa_examiner_training':'qa_frms_ux',total:Number(rows.find(x=>Number(x.empresa_id)===id)?.total||0)}))};
 }catch{qaFlights={state:'QUERY_FAILED',counts:[]};}
 const schemaOk=missing.length===0&&Object.values(compile).every(x=>x==='PASS')&&qaFlights.state==='READABLE';
 const verdict=schemaOk?'SCHEMA_ONLY_PASS':'SCHEMA_FAIL';
 const fixtureState=qaFlights.state!=='READABLE'?'UNKNOWN':qaFlights.counts.some(x=>x.total>0)?'SYNTHETIC_FLIGHTS_PRESENT':'NO_SYNTHETIC_FLIGHTS_ON_DATE';
 console.log(JSON.stringify({date:'2026-10-27',sha,readOnly:true,writes:0,missingColumns:missing,compileProbes:compile,qaFlights,fixtureState,verdict},null,2));
 if(!schemaOk)process.exitCode=1;
}
main().catch(e=>{console.error('CV_FRMS_STAGING_DIAGNOSTIC_FAILED:'+String(e?.message||'UNKNOWN').replace(/[^A-Z0-9_]/gi,'_').slice(0,60));process.exitCode=1;});
