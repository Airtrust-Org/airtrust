#!/usr/bin/env node
// source_reference: AirTrust issue #1279, UI course cards #71/#72/#73 and governed FDM13 D1 transfer.
// operational_decision: after administrative credit, corroborate destination enrollments through the real authenticated LMS API.
// dry_run_required: run only after successful reviewed production apply; read-only GET plus tenant selection.
// rollback_plan_required: on mismatch stop release and use recorded D1 Time Travel recovery decision; never auto-restore.
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { login, extractAccessToken, fetchJson, assertAllowedProductionBaseUrl } from '../smoke-auth-common.mjs';

const API=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL||'https://api.airtrust.online');
const SHA=String(process.env.GITHUB_SHA||'');
const fail=(why)=>{throw Error('FDM13_API_POSTCHECK_'+why)};
const ensure=(ok,code)=>{if(!ok)fail(code)};
ensure(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF==='refs/heads/main','MAIN_ONLY');
ensure(/^[0-9a-f]{40}$/.test(SHA),'SHA_INVALID');
const report=JSON.parse(readFileSync(process.env.FDM13_APPLY_REPORT||'', 'utf8'));
ensure(report.mode==='apply'&&report.mutation_executed===true&&report.postconditions_verified===true,'D1_APPLY_NOT_VERIFIED');
ensure(report.source_sha===SHA&&report.empresa_id===6,'D1_APPLY_SCOPE_MISMATCH');
ensure(report.post_transferred===21&&report.post_pending===0,'POST_TRANSFER_NOT_COMPLETE');

async function get(token,path){
 ensure(path.startsWith('/api/'),'ROUTE_NOT_API');
 const response=await fetchJson(API+path,{headers:{Authorization:'Bearer '+token}});
 ensure(response.status===200,'HTTP_'+response.status+'_'+path.split('?')[0]);
 return response.json;
}
let token=extractAccessToken(await login(API,String(process.env.PROD_SMOKE_EMAIL||'').trim(),String(process.env.PROD_SMOKE_PASSWORD||'')));
ensure(Boolean(token),'AUTH_MISSING');
const companies=await get(token,'/api/auth/empresas');
ensure(Array.isArray(companies?.data?.empresas)&&companies.data.empresas.some(e=>Number(e.id)===6),'TENANT_FORBIDDEN');
if(Number(companies?.data?.empresaAtualId)!==6){
 const response=await fetchJson(API+'/api/auth/select-empresa',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({empresaId:6})});
 ensure(response.status===200,'TENANT_SELECT_FAILED');
 token=String(response.json?.data?.accessToken||'');
 ensure(Boolean(token),'SELECTED_TOKEN_MISSING');
}
const active=await get(token,'/api/empresas/minha');
ensure(Number(active?.data?.id)===6,'TENANT_MISMATCH');
const counts={};
for(const id of [71,72]){
 let total=0,complete=0;
 for(let page=1;page<=5;page++){
  const response=await get(token,'/api/lms/matriculas/curso/'+id+'?page='+page+'&limit=200');
  ensure(Array.isArray(response?.data),'ENROLLMENTS_INVALID_'+id);
  const n=Number(response?.pagination?.total);
  ensure(Number.isInteger(n)&&n>=0,'PAGINATION_INVALID_'+id);
  total+=response.data.length;
  complete+=response.data.filter(m=>String(m.status).toUpperCase()==='CONCLUIDO').length;
  if(total>=n){ensure(total===n,'PAGINATION_DRIFT_'+id);break}
  ensure(response.data.length>0&&page<5,'PAGINATION_INCOMPLETE_'+id);
 }
 counts[id]={enrolled:total,completed:complete};
}
ensure(counts[71].enrolled===11,'TRIPULACAO_UI_COUNT_INCORRECT');
ensure(counts[72].enrolled===10,'MANUTENCAO_UI_COUNT_INCORRECT');
ensure(counts[71].completed+counts[72].completed===report.credited_at_99,'COMPLETION_UI_COUNT_INCORRECT');
process.stdout.write(JSON.stringify({schema_version:1,source_sha:SHA,tenant:6,
  mode:'api-read-only',course_71:counts[71],course_72:counts[72],
  api_postconditions_verified:true,contains_personal_data:false})+'\n');
