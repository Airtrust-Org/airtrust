#!/usr/bin/env node
// source_reference: reviewed synthetic FRMS UX 30d tenant fixture #1426/#1430,
//   applied through staging run 38475335321; current FRMS QA blocked by missing
//   dedicated identity, not missing production data.
// operational_decision: stage a new isolated QA account only for tenant 999013;
//   require exact staging UUID/main/provenance, no user overwrite or cross-tenant grant.
// dry_run_required: default --inspect is SELECT-only; --apply requires the
//   governed staging workflow, confirmation and verified D1 recovery bookmark.
// rollback_plan_required: --rollback only disables the fixed QA account after
//   staging recovery bookmark; no production SQL, user, or tenant changes.
// Staging-only, exact synthetic FRMS tenant 999013. Never writes production,
// changes an existing identity, or prints credentials/SQL. Run only via the
// reviewed GitHub Actions workflow with D1 recovery bookmark first.
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../worker-airtrust/package.json', import.meta.url));
const bcrypt = require('bcryptjs');

export const DB_NAME = 'airtrust-db-staging-baseline-20260701';
export const DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
export const TENANT_ID = 999013;
export const QA_EMAIL = 'qa-frms-ux@staging.airtrust.invalid';
export const QA_EMPLOYEE_CODE = 'QA-FRMS-UX-01';
export const CONFIRM = 'AIRTRUST_STAGING_FRMS_UX_IDENTITY';
const e = value => "'" + String(value).replaceAll("'", "''") + "'";

export function buildProvisionSql(passwordHash) {
  if (!/^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)) {
    throw new Error('QA_PASSWORD_HASH_INVALID');
  }
  return `
INSERT INTO usuarios (email,password_hash,nome,perfil,funcionario_id,deleted_at,created_at,updated_at,active)
SELECT ${e(QA_EMAIL)},${e(passwordHash)},'QA FRMS UX', 'ADMIN',f.id,NULL,datetime('now'),datetime('now'),1
FROM funcionarios f JOIN empresas emp ON emp.id=f.empresa_id
WHERE emp.id=${TENANT_ID} AND emp.codigo='qa_frms_ux_30d'
  AND emp.ativo=1 AND emp.deleted_at IS NULL
  AND f.matricula=${e(QA_EMPLOYEE_CODE)} AND f.ativo=1 AND f.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM usuarios WHERE lower(trim(email))=${e(QA_EMAIL)});
INSERT INTO usuarios_empresas (usuario_id,empresa_id,role,is_primary,created_at)
SELECT u.id,${TENANT_ID},'admin',1,datetime('now') FROM usuarios u
JOIN funcionarios f ON f.id=u.funcionario_id AND f.empresa_id=${TENANT_ID}
WHERE lower(trim(u.email))=${e(QA_EMAIL)}
  AND f.matricula=${e(QA_EMPLOYEE_CODE)}
  AND NOT EXISTS (SELECT 1 FROM usuarios_empresas WHERE usuario_id=u.id);
`.trim();
}

export function buildRollbackSql() {
  return `
UPDATE usuarios SET active=0, deleted_at=COALESCE(deleted_at,datetime('now')),
  updated_at=datetime('now')
WHERE lower(trim(email))=${e(QA_EMAIL)}
  AND funcionario_id=(SELECT id FROM funcionarios WHERE empresa_id=${TENANT_ID}
    AND matricula=${e(QA_EMPLOYEE_CODE)} AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM usuarios_empresas ue
     WHERE ue.usuario_id=usuarios.id AND ue.empresa_id!=${TENANT_ID});
`.trim();
}

function wrangler(sql, { write = false } = {}) {
  const args=['wrangler','d1','execute',DB_NAME,'--remote','--json'];
  if (!write) args.push('--command',sql);
  let dir;
  try {
    if (write) {
      dir=mkdtempSync(join(tmpdir(),'airtrust-frms-qa-'));
      const file=join(dir,'staging-fixture.sql');
      writeFileSync(file,sql,{mode:0o600});
      args.push('--file',file);
    }
    const res=spawnSync('npx',args,{cwd:join(process.cwd(),'worker-airtrust'),
      encoding:'utf8',maxBuffer:1024*1024});
    if(res.status!==0)throw new Error('STAGING_QA_D1_OPERATION_FAILED');
    if(!write) {
      const parsed=JSON.parse(res.stdout);
      return (Array.isArray(parsed)?parsed[0]?.results:parsed.results)||[];
    }
  } finally {
    if(dir)rmSync(dir,{recursive:true,force:true});
  }
}

function preflight() {
  if(process.env.GITHUB_ACTIONS!=='true' || process.env.STAGING_D1_NAME!==DB_NAME ||
    process.env.STAGING_D1_ID!==DB_ID || !process.env.CLOUDFLARE_API_TOKEN ||
    !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('STAGING_ONLY_GOVERNED_WORKFLOW_REQUIRED');
  const rows=wrangler(`SELECT
    (SELECT COUNT(*) FROM empresas WHERE id=${TENANT_ID} AND codigo='qa_frms_ux_30d'
      AND ativo=1 AND deleted_at IS NULL) AS tenant,
    (SELECT COUNT(*) FROM funcionarios WHERE empresa_id=${TENANT_ID}
      AND matricula=${e(QA_EMPLOYEE_CODE)} AND ativo=1 AND deleted_at IS NULL) AS employee,
    (SELECT COUNT(*) FROM frms_profile_assignments WHERE empresa_id=${TENANT_ID}
      AND status='ACTIVE') AS assignment,
    (SELECT COUNT(*) FROM frms_config_parameters
      WHERE revision_id='qa-frms-ux-999013-helicopter-offshore-v1') AS params,
    (SELECT COUNT(*) FROM usuarios WHERE lower(trim(email))=${e(QA_EMAIL)}) AS users,
    (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
      WHERE lower(trim(u.email))=${e(QA_EMAIL)}) AS memberships,
    (SELECT COUNT(*) FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
      WHERE lower(trim(u.email))=${e(QA_EMAIL)} AND ue.empresa_id!=${TENANT_ID}) AS other_tenants`)[0];
  if(!rows || Number(rows.tenant)!==1 || Number(rows.employee)!==1 ||
      Number(rows.assignment)!==1 || Number(rows.params)!==128 ||
      Number(rows.other_tenants)!==0 || Number(rows.users)>1 ||
      Number(rows.memberships)>1) throw new Error('QA_FRMS_UX_PRECONDITIONS_FAILED');
  return {users:Number(rows.users),memberships:Number(rows.memberships)};
}

async function main() {
  const mode=process.argv[2]||'--inspect';
  if(!['--inspect','--apply','--rollback'].includes(mode)||process.argv.length>3)throw new Error('QA_MODE_INVALID');
  const before=preflight();
  if(mode==='--inspect') {
    console.log('FRMS_UX_IDENTITY_PREFLIGHT_PASS tenant=999013 present='+String(before.users===1&&before.memberships===1));
    return;
  }
  if(process.env.CONFIRM_STAGING_FRMS_UX_IDENTITY!==CONFIRM ||
     process.env.STAGING_QA_RECOVERY_VERIFIED!=='true') {
    throw new Error('QA_GOVERNANCE_CONFIRMATION_OR_RECOVERY_MISSING');
  }
  if(mode==='--apply') {
    if(before.users!==0 || before.memberships!==0)throw new Error('QA_IDENTITY_ALREADY_EXISTS_OR_PARTIAL');
    const password=process.env.STAGING_SMOKE_PASSWORD||'';
    if(!password)throw new Error('STAGING_SMOKE_PASSWORD_MISSING');
    wrangler(buildProvisionSql(bcrypt.hashSync(password,10)),{write:true});
    const after=preflight();
    if(after.users!==1||after.memberships!==1)throw new Error('QA_IDENTITY_POSTCONDITION_FAILED');
    console.log('FRMS_UX_SCOPED_IDENTITY_READY tenant=999013 role=admin production_writes=0');
  } else {
    if(before.users!==1||before.memberships!==1)throw new Error('QA_IDENTITY_ROLLBACK_PRECONDITION_FAILED');
    wrangler(buildRollbackSql(),{write:true});
    console.log('FRMS_UX_SCOPED_IDENTITY_DISABLED tenant=999013');
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(err=>{console.error('FRMS_UX_IDENTITY_FAILED:'+err.message);process.exitCode=1;});
