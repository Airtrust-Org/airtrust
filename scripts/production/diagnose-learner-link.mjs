#!/usr/bin/env node
/** Production identity preflight. Never writes staff, user, roles or D1/R2. */
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {assertAllowedProductionBaseUrl,decodeJwtPayload,extractAccessToken,fetchJson,login,selectEmpresa} from '../smoke-auth-common.mjs';

const upper=v=>String(v||'').trim().toUpperCase();
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const matches=(name,needle)=>norm(name)===norm(needle)||norm(name).startsWith(norm(needle)+' ');
const active=f=>!!f&&((f.ativo!==undefined&&f.ativo!==null)?Number(f.ativo)===1:upper(f.status)==='ATIVO')&&(!f.status||upper(f.status)==='ATIVO');

export function assessLearnerIdentity({users,staff,access,permissions,tenantId,target}){
  const allUsers=(users||[]).filter(u=>Number(u.empresa_id)===tenantId&&matches(u.nome,target));
  const found=allUsers.filter(u=>Number(u.active)===1);
  const user=found.length===1?found[0]:null;
  const employees=(staff||[]).filter(f=>Number(f.empresa_id)===tenantId);
  const byEmail=user?employees.filter(f=>norm(f.email)&&norm(f.email)===norm(user.email)):[];
  const byName=employees.filter(f=>matches(f.nome,target));
  const linkedId=Number(user?.funcionario_id||0);
  const linked=linkedId>0?employees.find(f=>Number(f.id)===linkedId):null;
  const candidateId=byEmail.length===1?Number(byEmail[0].id):0;
  const conflictingLinks=candidateId>0?(users||[]).filter(u=>Number(u.empresa_id)===tenantId&&Number(u.active)===1&&
    Number(u.id)!==Number(user?.id)&&Number(u.funcionario_id)===candidateId).length:0;
  const denied=(permissions||[]).some(p=>p.permissao==='funcionarios.edit'&&upper(p.tipo)==='DENY');
  const recommendation=!user?'IDENTITY_REVIEW_REQUIRED':active(linked)?'LINK_VALID_CHECK_RBAC':
    linked?'LINKED_EMPLOYEE_INACTIVE':linkedId>0?'LINK_WRONG_TENANT_OR_DELETED':
    conflictingLinks>0?'LINK_CONFLICT_ALREADY_ASSIGNED':
    byEmail.length===1&&active(byEmail[0])?'LINK_CANDIDATE_VERIFY_AND_AUTHORIZE':'MANUAL_IDENTITY_REVIEW';
  return {tenant_id:tenantId,active_user_matches:found.length,user_has_employee_link:linkedId>0,
    linked_employee_in_tenant:!!linked,linked_employee_active:active(linked),
    employee_email_matches:byEmail.length,employee_name_matches:byName.length,
    other_active_users_linked_to_email_candidate:conflictingLinks,
    unique_active_email_match:byEmail.length===1&&active(byEmail[0])&&conflictingLinks===0,
    account_role:user?upper(user.perfil):'UNRESOLVED',enterprise_role:upper(access?.role),
    explicit_profiles:[...new Set((access?.perfis||[]).map(upper))].sort(),
    employee_edit_explicit_deny:denied,recommendation};
}

async function main(){
  const base=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL||'https://api.airtrust.online');
  const expected=String(process.env.EXPECTED_PRODUCTION_SHA||'').toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(expected))throw Error('EXPECTED_PRODUCTION_SHA_INVALID');
  if(Number(process.env.TARGET_TENANT_ID)!==6||norm(process.env.TARGET_NAME)!=='yngrid')throw Error('TARGET_NOT_ALLOWLISTED');
  const version=await fetchJson(base+'/api/version');
  if(version.status!==200||version.json?.data?.sourceSha!==expected||version.json?.data?.environment!=='production')throw Error('PRODUCTION_SHA_DRIFT');
  const email=String(process.env.PROD_EMAIL||''),password=String(process.env.PROD_PASSWORD||'');
  if(!email||!password)throw Error('CREDENTIALS_MISSING');
  let token=extractAccessToken(await login(base,email,password)),claims=decodeJwtPayload(token);
  if(Number(claims?.empresa_id)!==6){
    const s=await selectEmpresa(base,token,6);
    if(s.status!==200||s.json?.success!==true)throw Error('TENANT_SELECT_FAILED');
    token=extractAccessToken(s.json);claims=decodeJwtPayload(token);
  }
  if(Number(claims?.empresa_id)!==6||!['ADMIN','ADMINISTRADOR'].includes(upper(claims?.role)))throw Error('ADMIN_TENANT_SESSION_REQUIRED');
  async function get(path, allowInaccessibleLink=false){
    if(!/^\/api\/(?:admin\/usuarios|funcionarios|empresas\/usuarios\/)/.test(path))throw Error('READ_PATH_BLOCKED');
    const r=await fetchJson(base+path,{headers:{Authorization:'Bearer '+token}});
    if(allowInaccessibleLink && (r.status===403||r.status===404))return null;
    if(r.status!==200||r.json?.success!==true)throw Error('READONLY_HTTP_'+r.status);
    return r.json.data;
  }
  const users=await get('/api/admin/usuarios');
  if(!Array.isArray(users))throw Error('USER_LIST_INVALID');
  const candidates=users.filter(u=>Number(u.empresa_id)===6&&Number(u.active)===1&&matches(u.nome,'Yngrid'));
  if(candidates.length!==1)throw Error('USER_NOT_UNIQUE');
  const user=candidates[0],staffMap=new Map();
  for(const lookup of ['Yngrid',user.email].filter(Boolean)){
    const result=await get('/api/funcionarios?search='+encodeURIComponent(lookup)+'&limit=100');
    if(!Array.isArray(result))throw Error('STAFF_LIST_INVALID');
    for(const f of result)staffMap.set(Number(f.id),{...f,empresa_id:6});
  }
  const employeeId=Number(user.funcionario_id||0);
  if(employeeId>0&&!staffMap.has(employeeId)){
    const f=await get('/api/funcionarios/'+employeeId,true);
    if(Number(f?.id)===employeeId)staffMap.set(employeeId,{...f,empresa_id:6});
  }
  const access=await get('/api/empresas/usuarios/'+Number(user.id)+'/acessos');
  const enterpriseAccess=(access?.acessos||[]).filter(a=>Number(a.empresa_id)===6);
  if(enterpriseAccess.length!==1)throw Error('ACCESS_NOT_UNIQUE');
  const permissions=await get('/api/admin/usuarios/'+Number(user.id)+'/permissoes');
  if(!Array.isArray(permissions))throw Error('PERMISSION_LIST_INVALID');
  const report=assessLearnerIdentity({users,staff:[...staffMap.values()],access:enterpriseAccess[0],permissions,tenantId:6,target:'Yngrid'});
  const output={...report,source_sha:process.env.GITHUB_SHA,production_sha:expected,mode:'read-only',pii_emitted:false,user_or_employee_mutated:false};
  const file=String(process.env.IDENTITY_RESULT_FILE||'');
  if(!file)throw Error('RESULT_FILE_REQUIRED');
  writeFileSync(file,JSON.stringify(output,null,2)+'\n',{mode:0o600});
  process.stdout.write('IDENTITY_READONLY_PRECHECK_PASS\n');
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  main().catch(e=>{const code=String(e?.message||'UNKNOWN').replace(/[^A-Z0-9_]/g,'_').slice(0,64);
    process.stderr.write('IDENTITY_READONLY_PRECHECK_FAILED='+code+'\n');process.exitCode=1;});
}
