#!/usr/bin/env node
/**
 * Strict production D1 READ-ONLY investigation for incident LMS enrollment #859.
 * Queries are static and tenant scoped. Never outputs names, emails, tokens,
 * employee numbers, or secrets. NO SQL write or auto-link. Not a repair runner.
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const CASE = Object.freeze({ empresa_id: 6, curso_id: 67, matricula_id: 859 });
const EXPECTED = String(process.env.EXPECTED_PRODUCTION_SHA ?? '').trim().toLowerCase();

export const QUERIES = Object.freeze({
  enrollment: `
SELECT m.id AS enrollment_id, m.curso_id, m.empresa_id,
       m.funcionario_id AS employee_id,
       CASE WHEN m.deleted_at IS NULL THEN 1 ELSE 0 END AS enrollment_not_deleted,
       m.status AS enrollment_status,
       CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END AS employee_exists,
       f.empresa_id AS employee_company_id,
       f.ativo AS employee_active,
       f.status AS employee_status,
       CASE WHEN f.deleted_at IS NULL THEN 1 ELSE 0 END AS employee_not_deleted,
       (SELECT COUNT(*) FROM usuarios u WHERE u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL)
         AS linked_user_count,
       (SELECT COUNT(*) FROM usuarios u
          JOIN usuarios_empresas ue ON ue.usuario_id=u.id AND ue.empresa_id=m.empresa_id
         WHERE u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL)
         AS linked_tenant_user_count,
       (SELECT COUNT(*) FROM usuarios u
          JOIN usuarios_empresas ue ON ue.usuario_id=u.id AND ue.empresa_id=m.empresa_id
         WHERE f.email IS NOT NULL AND TRIM(f.email) <> ''
           AND LOWER(TRIM(u.email))=LOWER(TRIM(f.email)) AND u.deleted_at IS NULL)
         AS exact_employee_email_account_count
FROM lms_matriculas m
LEFT JOIN funcionarios f ON f.id=m.funcionario_id
WHERE m.id=859 AND m.curso_id=67 AND m.empresa_id=6
LIMIT 1`,
  candidates: `
SELECT u.id AS user_id, u.funcionario_id AS current_linked_employee_id,
       u.active AS user_active,
       CASE WHEN u.deleted_at IS NULL THEN 1 ELSE 0 END AS user_not_deleted,
       ue.empresa_id AS membership_company_id,
       CASE WHEN u.funcionario_id=f.id THEN 1 ELSE 0 END AS already_linked,
       CASE WHEN f.email IS NOT NULL AND TRIM(f.email)<>''
         AND LOWER(TRIM(u.email))=LOWER(TRIM(f.email)) THEN 1 ELSE 0 END AS exact_email_match,
       CASE WHEN LOWER(TRIM(u.nome))=LOWER(TRIM(f.nome)) THEN 1 ELSE 0 END AS exact_name_match
FROM lms_matriculas m
JOIN funcionarios f ON f.id=m.funcionario_id
JOIN usuarios u ON u.deleted_at IS NULL
JOIN usuarios_empresas ue ON ue.usuario_id=u.id AND ue.empresa_id=6
WHERE m.id=859 AND m.curso_id=67 AND m.empresa_id=6
  AND (u.funcionario_id=f.id
       OR (f.email IS NOT NULL AND TRIM(f.email)<>''
         AND LOWER(TRIM(u.email))=LOWER(TRIM(f.email)))
       OR LOWER(TRIM(u.nome))=LOWER(TRIM(f.nome)))
ORDER BY already_linked DESC,exact_email_match DESC,exact_name_match DESC,u.id
LIMIT 12`,
  cohort: `
SELECT COUNT(*) AS enrollment_total,
       SUM(CASE WHEN NOT EXISTS(
         SELECT 1 FROM usuarios u
         JOIN usuarios_empresas ue ON ue.usuario_id=u.id AND ue.empresa_id=6
         WHERE u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL
       ) THEN 1 ELSE 0 END) AS no_tenant_user_link,
       SUM(CASE WHEN f.id IS NULL OR f.deleted_at IS NOT NULL
         OR COALESCE(f.ativo,1)<>1 OR UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))<>'ATIVO'
         THEN 1 ELSE 0 END) AS employee_not_eligible
FROM lms_matriculas m
LEFT JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=6
WHERE m.empresa_id=6 AND m.curso_id=67 AND m.deleted_at IS NULL
  AND m.status <> 'CANCELADO'`,
});

export function normalizeResults(parsed) {
  if (!Array.isArray(parsed) || parsed.length !== 1 ||
      !parsed[0] || !Array.isArray(parsed[0].results) ||
      parsed[0].success !== true) throw Error('D1_READONLY_RESPONSE_INVALID');
  return parsed[0].results;
}

export function evaluateEvidence(enrollment, candidates, cohort) {
  if (!enrollment || Number(enrollment.enrollment_id)!==CASE.matricula_id ||
      Number(enrollment.curso_id)!==CASE.curso_id ||
      Number(enrollment.empresa_id)!==CASE.empresa_id) throw Error('CASE_NOT_FOUND_OR_WRONG_TENANT');
  const linked=Number(enrollment.linked_tenant_user_count);
  const active=Number(enrollment.employee_active)===1 &&
    Number(enrollment.employee_not_deleted)===1 &&
    String(enrollment.employee_status ?? 'ATIVO').trim().toUpperCase()==='ATIVO' &&
    Number(enrollment.employee_company_id)===CASE.empresa_id;
  const safeCandidates=candidates.map(c=>({
    user_id:Number(c.user_id),
    current_linked_employee_id: c.current_linked_employee_id == null ? null : Number(c.current_linked_employee_id),
    user_active:Number(c.user_active)===1,
    membership_company_id:Number(c.membership_company_id),
    already_linked:Number(c.already_linked)===1,
    exact_email_match:Number(c.exact_email_match)===1,
    exact_name_match:Number(c.exact_name_match)===1,
  }));
  return {
    case:CASE,
    enrollment:{ employee_id:Number(enrollment.employee_id),
      status:String(enrollment.enrollment_status),not_deleted:Number(enrollment.enrollment_not_deleted)===1,
      employee_eligible:active,linked_user_count:Number(enrollment.linked_user_count),
      linked_tenant_user_count:linked,exact_employee_email_account_count:Number(enrollment.exact_employee_email_account_count)},
    candidates:safeCandidates,
    cohort:{enrollment_total:Number(cohort?.enrollment_total),no_tenant_user_link:Number(cohort?.no_tenant_user_link),
      employee_not_eligible:Number(cohort?.employee_not_eligible)},
    diagnosis:!active?'EMPLOYEE_INELIGIBLE':
      linked===0?'NO_LINKED_TENANT_ACCOUNT':
      linked>1?'MULTIPLE_LINKED_ACCOUNTS':'LINKED_ACCOUNT_EXISTS_CHECK_LOGIN_ID',
    writes_executed:false,identity_autolink_executed:false,
  };
}

export async function run() {
  if (!/^[0-9a-f]{40}$/.test(EXPECTED)) throw Error('PINNED_PRODUCTION_SHA_REQUIRED');
  const response=await fetch('https://api.airtrust.online/api/version',
    {headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('PRODUCTION_VERSION_UNAVAILABLE');
  const body=await response.json();const data=body?.data??body;
  if (String(data?.sourceSha??'').toLowerCase()!==EXPECTED) throw Error('PRODUCTION_SHA_CHANGED');
  const rows={};
  for(const [key,sql] of Object.entries(QUERIES)){
    if(!/^SELECT\\s/i.test(sql.trim()) ||
       /\\b(?:UPDATE|INSERT|DELETE|ALTER|DROP|REPLACE|ATTACH|DETACH|PRAGMA|CREATE)\\b/i.test(sql))
      throw Error('READONLY_SQL_GUARD_'+key);
    let output;
    try {
      output=execFileSync('npx',['wrangler','d1','execute','airtrust-db','--env','production',
        '--remote','--json','--command',sql],{cwd:'worker-airtrust',encoding:'utf8',timeout:30000,
        maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
    } catch { throw Error('D1_READONLY_QUERY_FAILED_'+key); }
    let parsed;
    try { parsed=JSON.parse(output); } catch {throw Error('D1_READONLY_JSON_INVALID_'+key);}
    rows[key]=normalizeResults(parsed);
  }
  if(rows.enrollment.length!==1 || rows.cohort.length!==1) throw Error('D1_READONLY_CARDINALITY_MISMATCH');
  console.log(JSON.stringify(evaluateEvidence(rows.enrollment[0],rows.candidates,rows.cohort[0])));
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  run().catch(e=>{console.error('READONLY_DIAGNOSTIC_FAILED:',e.message);process.exitCode=1;});
}
