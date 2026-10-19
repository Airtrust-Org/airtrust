#!/usr/bin/env node
/**
 * Read-only physical readiness inventory for Player3 synthetic QA.
 *
 * source_reference: worker-airtrust/schema-v2/changes/0558_lms_native_v1_evidence.sql,
 *   0559_lms_player3_module_attempts.sql, 0561_native_catalog_activation.sql,
 *   0562_player3_canonical_terminal.sql, scripts/staging/seed-qa-examiner-training.mjs.
 * operational_decision: inspect only the exact known disposable staging tenant;
 *   aggregate counts, never export identities or mutate legacy enrollment data.
 * dry_run_required: default emits a safe capability summary without connecting.
 * rollback_plan_required: read-only SELECT has no write/rollback; fail if D1
 *   metadata reports any mutation; all future publication requires governed
 *   staging workflow, D1 recovery and R2 private-artifact provenance.
 */
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

export const STAGING_D1='airtrust-db-staging-baseline-20260701';
export const STAGING_UUID='bf9963f4-eb12-439b-a830-20bbf577ac22';
export const QA_CODE='qa_examiner_training';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const SQL=`SELECT
(SELECT COUNT(*) FROM empresas e WHERE e.codigo='qa_examiner_training'
  AND e.deleted_at IS NULL) AS qa_tenants,
(SELECT COUNT(*) FROM funcionarios f JOIN empresas e ON e.id=f.empresa_id
  WHERE e.codigo='qa_examiner_training' AND f.deleted_at IS NULL
  AND f.ativo=1) AS qa_active_employees,
(SELECT COUNT(DISTINCT u.id) FROM usuarios u
  JOIN usuarios_empresas ue ON ue.usuario_id=u.id
  JOIN empresas e ON e.id=ue.empresa_id
  JOIN funcionarios f ON f.id=u.funcionario_id AND f.empresa_id=e.id
  WHERE e.codigo='qa_examiner_training' AND u.deleted_at IS NULL
  AND f.deleted_at IS NULL AND f.ativo=1) AS qa_learner_users,
(SELECT COUNT(*) FROM lms_cursos c JOIN empresas e ON e.id=c.empresa_id
  WHERE e.codigo='qa_examiner_training' AND c.deleted_at IS NULL) AS qa_courses,
(SELECT COUNT(*) FROM lms_native_catalog_activation a
  JOIN empresas e ON e.id=a.empresa_id
  WHERE e.codigo='qa_examiner_training') AS qa_markers,
(SELECT COUNT(*) FROM lms_native_edicoes ed
  JOIN empresas e ON e.id=ed.empresa_id
  WHERE e.codigo='qa_examiner_training'
  AND ed.status='PUBLISHED') AS qa_published_editions,
(SELECT COUNT(*) FROM lms_player3_politicas p
  JOIN empresas e ON e.id=p.empresa_id
  WHERE e.codigo='qa_examiner_training'
  AND p.estado='APPROVED') AS qa_approved_policies,
(SELECT COUNT(*) FROM lms_native_matricula_edicoes b
  JOIN empresas e ON e.id=b.empresa_id
  WHERE e.codigo='qa_examiner_training') AS qa_pinned_enrollments,
(SELECT COUNT(*) FROM lms_matriculas m JOIN empresas e ON e.id=m.empresa_id
  WHERE e.codigo='qa_examiner_training' AND m.deleted_at IS NULL)
  AS qa_all_active_enrollments,
(SELECT COUNT(*) FROM airtrust_schema_changes_v2
  WHERE change_id='lms-native-catalog-activation-0561') AS applied_0561,
(SELECT COUNT(*) FROM airtrust_schema_changes_v2
  WHERE change_id='lms-player3-canonical-terminal-0562') AS applied_0562;`;

const expected = Object.freeze([
 'qa_tenants','qa_active_employees','qa_learner_users','qa_courses',
 'qa_markers','qa_published_editions','qa_approved_policies',
 'qa_pinned_enrollments','qa_all_active_enrollments','applied_0561','applied_0562',
]);

export function assertReadOnlyQuery(sql=SQL){
  const normalized=sql.trim();
  if(!/^SELECT\s/i.test(normalized) ||
      normalized.split(';').filter(s=>s.trim()).length!==1 ||
      /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b/i.test(normalized))
    throw new Error('PLAYER3_READONLY_QUERY_GUARD');
  return true;
}

export function validateStagingConfig(toml){
  const section=toml.match(/\[env\.staging\]([\s\S]*?)(?=\n\[\[env\.staging\.d1_databases\]\])/);
  const binding=toml.match(/\[\[env\.staging\.d1_databases\]\]([\s\S]*?)(?=\n\[)/);
  if(!section || !/ENVIRONMENT\s*=\s*"staging"/.test(section[1]) ||
     !binding || !binding[1].includes('database_name = "'+STAGING_D1+'"') ||
     !binding[1].includes('database_id = "'+STAGING_UUID+'"')){
    throw new Error('PLAYER3_STAGING_D1_BINDING_NOT_PINNED');
  }
}

export function summarize(result){
  if(!Array.isArray(result)||result.length!==1 ||
      result[0]?.success!==true || result[0]?.meta?.changed_db!==false ||
      result[0]?.meta?.rows_written!==0 ||
      !Array.isArray(result[0].results)||result[0].results.length!==1){
    throw new Error('PLAYER3_READONLY_DB_RESPONSE_INVALID');
  }
  const row=result[0].results[0];
  if(!row || typeof row!=='object' || expected.some(k=>
    !Number.isSafeInteger(row[k])||row[k]<0)){
    throw new Error('PLAYER3_READONLY_AGGREGATE_INVALID');
  }
  const blockers=[];
  if(row.qa_tenants!==1)blockers.push('EXACT_QA_TENANT_NOT_UNIQUE');
  if(row.applied_0561!==1 || row.applied_0562!==1)
    blockers.push('STAGING_SCHEMAS_NOT_APPLIED_ONCE');
  if(row.qa_learner_users<2)blockers.push('QA_LEARNERS_INSUFFICIENT');
  if(row.qa_courses<1)blockers.push('NO_SYNTHETIC_COURSE');
  if(row.qa_markers<1)blockers.push('NO_NATIVE_ACTIVATION');
  if(row.qa_published_editions<1)blockers.push('NO_PUBLISHED_NATIVE_EDITION');
  if(row.qa_approved_policies<1)blockers.push('NO_APPROVED_PRIVATE_GRADING_POLICY');
  if(row.qa_pinned_enrollments<2)blockers.push('NO_INDEPENDENT_NATIVE_ENROLLMENTS');
  return Object.freeze({
    ok: blockers.length===0, inspection:'READ_ONLY_STAGING_D1',
    scope:'qa_examiner_training',counts:Object.fromEntries(
      expected.map(key=>[key,row[key]])),blockers,
    contentOriginVerified:false,tenantFlagsVerified:false,
    sixBrowserJourneysVerified:false,certificatePdfVerified:false,
  });
}

if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    assertReadOnlyQuery();
    validateStagingConfig(readFileSync(resolve(root,'worker-airtrust/wrangler.toml'),'utf8'));
    if(!process.argv.includes('--inspect')){
      process.stdout.write(JSON.stringify({ok:false,inspection:'DRY_RUN',
        target:STAGING_D1,qaTenant:QA_CODE,remoteQueries:0,remoteWrites:0})+'\n');
    }else{
      if(process.env.CONFIRM_STAGING_PLAYER3_READONLY!=='AIRTRUST_STAGING_PLAYER3_READONLY'){
        throw new Error('PLAYER3_EXPLICIT_READONLY_CONFIRMATION_REQUIRED');
      }
      const wrangler=resolve(root,'worker-airtrust/node_modules/.bin/wrangler');
      const done=spawnSync(wrangler,['d1','execute',STAGING_D1,
        '--env','staging','--remote','--json','--command='+SQL],{
        cwd:resolve(root,'worker-airtrust'),encoding:'utf8',timeout:45000,
        maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
      if(done.error || done.status!==0)
        throw new Error('PLAYER3_STAGING_READONLY_QUERY_FAILED');
      const output=summarize(JSON.parse(done.stdout));
      process.stdout.write(JSON.stringify(output)+'\n');
      if(!output.ok)process.exitCode=2;
    }
  }catch(e){
    process.stderr.write((e instanceof Error?e.message:'PLAYER3_READONLY_ERROR')+'\n');
    process.exitCode=1;
  }
}
