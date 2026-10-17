#!/usr/bin/env node
// Authenticated production read-only proof of two administrative credits and preserved legacy history.
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { login, extractAccessToken, fetchJson, assertAllowedProductionBaseUrl }
  from '../smoke-auth-common.mjs';

const fail = (code) => { throw new Error('GATEKEEPER14_API_POSTCHECK_' + code); };
const ensure = (value, code) => { if (!value) fail(code); };
ensure(process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REF === 'refs/heads/main', 'GITHUB_MAIN_ONLY');
const sha = String(process.env.GITHUB_SHA || '');
ensure(/^[a-f0-9]{40}$/.test(sha), 'SHA_INVALID');
const report = JSON.parse(readFileSync(process.env.GATEKEEPER_APPLY_REPORT || '', 'utf8'));
ensure(report.mode === 'apply' && report.mutation_executed === true &&
  report.postconditions_verified === true && report.source_sha === sha,
  'APPLY_REPORT_NOT_VERIFIED');

const api = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
const email = String(process.env.PROD_SMOKE_EMAIL || '').trim();
const password = String(process.env.PROD_SMOKE_PASSWORD || '');
ensure(Boolean(email && password), 'PROD_AUTH_REQUIRED');
let token = extractAccessToken(await login(api,email,password));
async function get(path) {
  ensure(path.startsWith('/api/'), 'BAD_API_PATH');
  const response = await fetchJson(api + path,{headers:{Authorization:'Bearer '+token}});
  ensure(response.status === 200,'HTTP_'+response.status);
  return response.json;
}
const companies = await get('/api/auth/empresas');
ensure(Array.isArray(companies?.data?.empresas) &&
  companies.data.empresas.some(x=>Number(x.id)===6), 'TENANT_FORBIDDEN');
if (Number(companies?.data?.empresaAtualId) !== 6) {
  const response = await fetchJson(api+'/api/auth/select-empresa',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({empresaId:6}),
  });
  ensure(response.status===200,'TENANT_SELECT_FAILED');
  token=String(response.json?.data?.accessToken||'');
  ensure(Boolean(token),'TENANT_TOKEN_INVALID');
}
const active = await get('/api/empresas/minha');
ensure(Number(active?.data?.id)===6,'TENANT_MISMATCH');
async function courseRows(id) {
  let rows=[]; let expected=null;
  for(let page=1;page<=5;page++){
    const response=await get('/api/lms/matriculas/curso/'+id+'?page='+page+'&limit=200');
    ensure(Array.isArray(response?.data),'COURSE_ROWS_INVALID');
    expected=Number(response?.pagination?.total);
    ensure(Number.isInteger(expected)&&expected>=0,'COURSE_TOTAL_INVALID');
    rows=rows.concat(response.data);
    if(rows.length>=expected){ensure(rows.length===expected,'PAGINATION_DRIFT');break;}
    ensure(response.data.length>0&&page<5,'PAGINATION_INCOMPLETE');
  }
  return rows;
}
const original=await courseRows(14);
const prior=original.filter(x=>[23,24].includes(Number(x.id)));
ensure(prior.length===2 && prior.every(x=>String(x.status).toUpperCase()==='CONCLUIDO' &&
  Number(x.progresso_pct)===100),'OLD_GATEKEEPER_COMPLETION_CHANGED');
const employees=new Set(prior.map(x=>Number(x.funcionario_id)));
ensure(employees.size===2,'SOURCE_PERSONNEL_CHANGED');
const updated=await courseRows(73);
ensure(updated.length===2,'FDM73_POPULATION_CHANGED');
ensure(updated.every(x=>employees.has(Number(x.funcionario_id)) &&
  String(x.status).toUpperCase()==='CONCLUIDO' &&
  Number(x.progresso_pct)===100),'FDM73_CREDIT_NOT_VISIBLE');
process.stdout.write(JSON.stringify({
  source_sha:sha,empresa_id:6,course_14_preserved_concluded:2,
  course_73_administrative_completed:2,api_postconditions_verified:true,
  contains_personal_data:false
})+'\n');
