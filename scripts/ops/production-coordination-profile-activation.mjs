#!/usr/bin/env node
// One-shot tenant-specific role assignment via the production application API.
// Never print credentials, JWTs, emails, names or user IDs.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { appendFileSync } from 'node:fs';
import { assertAllowedProductionBaseUrl, login, extractAccessToken, decodeJwtPayload, fetchJson } from '../smoke-auth-common.mjs';
const TARGET_HASH = '5f350409f9e32f4ae2bbea949af26cbcd5aa72386887c6012caa62373daf5df7';
const TENANT_ID = 6;
const ROLE = 'COORDENACAO_VOO';
export function findTarget(rows, hash=TARGET_HASH) {
  if (!Array.isArray(rows)) throw new Error('USERS_NOT_ARRAY');
  const matches=rows.filter(r=>Number(r.empresa_id)===TENANT_ID && createHash('sha256').update(String(r.email||'').trim().toLowerCase()).digest('hex')===hash);
  if(matches.length!==1) throw new Error('TARGET_MISSING_OR_AMBIGUOUS');
  if(Number(matches[0].active)!==1 || !Number.isSafeInteger(Number(matches[0].id)) || Number(matches[0].id)<=0) throw new Error('TARGET_INACTIVE_OR_INVALID');
  return matches[0];
}
export function validateActor({tenant,role,liveSha,expectedSha,mode}) {
  if(mode!=='inspect' && mode!=='apply') throw new Error('INVALID_OPERATION');
  if(!/^[0-9a-f]{40}$/.test(expectedSha)||liveSha!==expectedSha) throw new Error('LIVE_SHA_MISMATCH');
  if(Number(tenant)!==TENANT_ID) throw new Error('TENANT_MISMATCH');
  if(!['ADMIN','ADMINISTRADOR'].includes(String(role||'').toUpperCase())) throw new Error('PLATFORM_ADMIN_REQUIRED');
}
async function authAdmin(base){
  for(const [email,password] of [
    [process.env.QA_EXAMINER_ADMIN_EMAIL,process.env.QA_EXAMINER_ADMIN_PASSWORD],
    [process.env.PROD_SMOKE_EMAIL,process.env.PROD_SMOKE_PASSWORD]
  ]){
    if(!email||!password)continue;
    try {
      const result=await login(base,email,password);
      const token=extractAccessToken(result);
      const claims=decodeJwtPayload(token);
      if(Number(claims.empresa_id)!==TENANT_ID)continue;
      const me=await fetchJson(base+'/api/auth/me',{headers:{Authorization:'Bearer '+token}});
      if(me.status!==200 || !['ADMIN','ADMINISTRADOR'].includes(String(me.json?.data?.role||'').toUpperCase()))continue;
      return {token,tenant:Number(claims.empresa_id),role:me.json.data.role};
    } catch { /* Never log credential or target-identifying details */ }
  }
  throw new Error('PLATFORM_ADMIN_PRODUCTION_CREDENTIALS_UNAVAILABLE');
}
async function main(){
  const base=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL);
  const expectedSha=String(process.env.EXPECTED_WORKER_SHA||'');
  const mode=String(process.env.OPERATION_MODE||'');
  const version=await fetchJson(base+'/api/version');
  if(version.status!==200 || version.json?.success!==true)throw new Error('PRODUCTION_VERSION_UNAVAILABLE');
  const liveSha=String(version.json?.data?.sourceSha||'');
  if(!/^[0-9a-f]{40}$/.test(expectedSha)||liveSha!==expectedSha)throw new Error('LIVE_SHA_MISMATCH');
  const admin=await authAdmin(base);
  validateActor({tenant:admin.tenant,role:admin.role,liveSha,expectedSha,mode});
  const url=base+'/api/admin/usuarios', headers={Authorization:'Bearer '+admin.token};
  const beforeResponse=await fetchJson(url,{headers});
  if(beforeResponse.status!==200||beforeResponse.json?.success!==true)throw new Error('ADMIN_LIST_HTTP_'+beforeResponse.status);
  const target=findTarget(beforeResponse.json.data);
  const before=String(target.perfil||'').toUpperCase();
  if(mode==='apply' && before!==ROLE){
    const updated=await fetchJson(base+'/api/admin/usuarios/'+Number(target.id),{
      method:'PUT',
      headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({perfil:ROLE})
    });
    if(updated.status!==200||updated.json?.success!==true)throw new Error('ADMIN_ROLE_UPDATE_HTTP_'+updated.status);
  }
  const afterResponse=await fetchJson(url,{headers});
  if(afterResponse.status!==200||afterResponse.json?.success!==true)throw new Error('VERIFY_LIST_HTTP_'+afterResponse.status);
  const after=String(findTarget(afterResponse.json.data).perfil||'').toUpperCase();
  if(mode==='apply' && after!==ROLE)throw new Error('ROLE_NOT_PERSISTED');
  const output={mode,tenant:TENANT_ID,live_worker_sha_verified:true,role_before:before,role_after:after,
    assigned_and_verified:after===ROLE,api_writes:mode==='apply'&&before!==ROLE?1:0,pii_logged:false};
  process.stdout.write(JSON.stringify(output)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '\n## Flight coordination role\n\n- tenant: 6\n- mode: '+mode+'\n- before: '+before+'\n- after: '+after+
    '\n- verified: '+(after===ROLE?'PASS':'PENDING')+'\n- account identifiers/secrets emitted: no\n');
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  main().catch(error=>{console.error('[flight-coordination] '+String(error?.message||'UNKNOWN_ERROR').replace(/\s+/g,' ').slice(0,100));process.exitCode=1;});
}
