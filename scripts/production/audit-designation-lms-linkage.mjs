#!/usr/bin/env node
// source_reference: prod Compliance/LMS tenant 6 2026-11-11.
// operational_decision: read-only catalog parity; no automatic opt-in for manual requirements.
// dry_run_required: true; rollback_plan_required: not applicable, no writes.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
export function classify(row) {
 const n=Number(row.course_count||0);
 const ead=['EAD','TREINAMENTO EAD'].includes(String(row.categoria||'').trim().toUpperCase());
 if(!ead) return 'MANUAL_OR_NON_EAD';
 if(n===0) return 'EAD_MISSING_COURSE';
 if(n!==1) return 'EAD_AMBIGUOUS_COURSE';
 if(Number(row.auto_matricular_ead||0)!==1 || row.modalidade_requerida!=='EAD') return 'EAD_AUTOMATION_DISABLED';
 return 'EAD_AUTOMATION_CONFIGURED';
}
export function summarize(rows) {
 const categories={},gaps=[];
 for(const row of rows) {
  const reason=classify(row);
  categories[reason]=(categories[reason]||0)+1;
  if(reason!=='EAD_AUTOMATION_CONFIGURED') gaps.push({rule_id:Number(row.rule_id),qualification_id:Number(row.qualificacao_tipo_id),condition_id:Number(row.condicao_id),reason});
 }
 return {rules_checked:rows.length,condition_rules:rows.filter(x=>x.condicao_id!==null).length,categories,gaps};
}
const query=[
 "SELECT tr.id rule_id,tr.qualificacao_tipo_id,tr.condicao_id,qt.categoria,tr.modalidade_requerida,tr.auto_matricular_ead,",
 "(SELECT COUNT(*) FROM lms_cursos lc WHERE lc.empresa_id=tr.empresa_id AND lc.qualificacao_tipo_id=tr.qualificacao_tipo_id AND lc.ativo=1 AND lc.publicado=1 AND lc.deleted_at IS NULL) course_count",
 "FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.empresa_id=tr.empresa_id AND qt.id=tr.qualificacao_tipo_id AND qt.ativo=1 AND qt.deleted_at IS NULL",
 "WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND tr.obrigatoriedade='OBRIGATORIA' ORDER BY tr.id"
].join(' ');
function read(){
 const r=spawnSync('npx',['wrangler','d1','execute','airtrust-db','--env','production','--remote','--json','--command',query],{cwd:new URL('../../worker-airtrust/',import.meta.url),encoding:'utf8',timeout:60000,maxBuffer:8000000});
 if(r.status!==0)throw Error('D1_READ_FAILED');
 let j;try{j=JSON.parse(r.stdout)}catch{throw Error('D1_JSON_INVALID')}
 const x=Array.isArray(j)?j[0]:j;
 if(!x?.success||!Array.isArray(x.results)||x.meta?.changed_db||x.meta?.rows_written)throw Error('D1_READONLY_GUARD');
 return x.results;
}
if(import.meta.url==='file://'+process.argv[1]){
 const report={scope:'tenant6_all_active_mandatory_rules',read_only:true,...summarize(read())};
 const txt=JSON.stringify(report,null,2)+'\n';
 if(process.env.AIRTRUST_AUDIT_REPORT)writeFileSync(process.env.AIRTRUST_AUDIT_REPORT,txt,{mode:0o600});
 else process.stdout.write(txt);
}
