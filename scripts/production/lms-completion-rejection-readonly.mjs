#!/usr/bin/env node
/**
 * Read-only tenant-6 LMS closing failure diagnostics.
 * SQL is fixed and SELECT-only. Never emit audit payloads, personal IDs,
 * learner names, SQL messages, tokens or history row identifiers.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SQL = `SELECT m.curso_id AS course_id, a.new_values AS audit_json
  FROM audit_logs a
  JOIN lms_matriculas m
    ON m.id = CAST(a.entity_id AS INTEGER)
   AND m.empresa_id = a.empresa_id
 WHERE a.empresa_id = 6
   AND a.action = 'LMS_QUALIFICATION_COMPLETION_FAILED'
   AND a.created_at >= datetime('now', '-10 days')
 ORDER BY a.id DESC LIMIT 300`;

function ensure(condition, code) {
  if (!condition) throw new Error(code);
}

export function classifyReason(reason) {
  const raw = typeof reason === 'string' ? reason.slice(0, 700) : '';
  const reasonText = raw.toUpperCase();
  if (!raw) return 'NO_INTERNAL_REASON';
  if (/STATUS INCOMPAT[IÍ]VEL PARA REUSO|REGISTRO COM STATUS|QUALIFICA[CÇ][AÃ]O_STATUS_INCOMPATIBLE/.test(reasonText)) return 'HISTORY_STATUS_INCOMPATIBLE';
  if (/SEM CATEGORIA_ID CAN[OÔ]NICO|SEM TIPO VINCULADO|SEM C[OÓ]DIGO DEFINIDO/.test(reasonText)) return 'QUALIFICATION_TYPE_MAPPING_INVALID';
  if (/N[AÃ]O EST[AÁ] INTEGRADA AO LMS|CATEGORIA DO TIPO/.test(reasonText)) return 'CATEGORY_CONFIG_INVALID';
    if (/UNIQUE CONSTRAINT FAILED|SQLITE_CONSTRAINT_UNIQUE/.test(reasonText)) return 'UNIQUE_CONSTRAINT';
  if (/FOREIGN KEY CONSTRAINT FAILED|SQLITE_CONSTRAINT_FOREIGNKEY/.test(reasonText)) return 'FOREIGN_KEY_CONSTRAINT';
  if (/NOT NULL CONSTRAINT FAILED/.test(reasonText)) return 'NOT_NULL_CONSTRAINT';
  if (/CHECK CONSTRAINT FAILED/.test(reasonText)) return 'CHECK_CONSTRAINT';
  if (/NO SUCH COLUMN/.test(reasonText)) return 'MISSING_COLUMN';
  if (/NO SUCH TABLE/.test(reasonText)) return 'MISSING_TABLE';
  if (/HAS NO COLUMN NAMED/.test(reasonText)) return 'INVALID_COLUMN';
  if (/QUALIFICATION_HISTORY_CATEGORY_INVALID|QUALIFICATION_CATEGORY_INVALID/.test(reasonText)) return 'CATEGORY_CONSTRAINT';
  if (/DATABASE IS LOCKED|SQLITE_BUSY/.test(reasonText)) return 'BUSY';
  if (/CONSTRAINT FAILED|SQLITE_CONSTRAINT/.test(reasonText)) return 'OTHER_CONSTRAINT';
  if (/TOO MANY SQL VARIABLES|SQLITE_RANGE/.test(reasonText)) return 'SQL_PARAMETERS';
  return 'OTHER_REDACTED';
}

export function summarizeFailures(rows) {
  ensure(Array.isArray(rows) && rows.length <= 300, 'RESULTS_TOO_LARGE');
  const counts = new Map();
  for (const row of rows) {
    const courseId = Number(row?.course_id);
    ensure(Number.isSafeInteger(courseId) && courseId > 0, 'COURSE_ID_INVALID');
    let data = {};
    try { data = JSON.parse(String(row?.audit_json ?? '{}')); } catch { /* classified as missing */ }
    const code = classifyReason(data?.reason);
    const key = courseId + ':' + code;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    audit_window_days: 10,
    events_scanned: rows.length,
    groups: Array.from(counts, ([key,count]) => {
      const [courseId, reason] = key.split(':');
      return { course_id: Number(courseId), reason, count };
    }).sort((a,b)=>a.course_id-b.course_id || a.reason.localeCompare(b.reason)),
    writes: 0,
    contains_personal_data: false,
  };
}

function query() {
  ensure(/^SELECT\b/i.test(SQL), 'NON_SELECT_SQL');
  ensure(!/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|ATTACH|DETACH|PRAGMA|REPLACE|VACUUM)\b/i.test(SQL.replace(/'[^']*'/g, "''")), 'SQL_MUTATION_NOT_ALLOWED');
  ensure(!SQL.includes(';'), 'MULTI_STATEMENT_REJECTED');
  const child = spawnSync('npx',
    ['wrangler','d1','execute','airtrust-db','--env','production','--remote','--json','--command',SQL],
    { cwd: new URL('../../worker-airtrust/', import.meta.url), env: process.env, encoding:'utf8', maxBuffer: 4*1024*1024 });
  ensure(child.status === 0, 'PRODUCTION_READONLY_D1_QUERY_FAILED');
  const decoded = JSON.parse(child.stdout || '[]');
  const first = Array.isArray(decoded) ? decoded[0] : decoded;
  ensure(Array.isArray(first?.results), 'D1_QUERY_SHAPE_INVALID');
  return first.results;
}

async function main() {
  ensure(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF === 'refs/heads/main', 'GITHUB_MAIN_ONLY');
  ensure(process.env.CONFIRMATION === 'AIRTRUST_PRODUCTION_LMS_COMPLETION_OUTCOMES_READONLY', 'CONFIRMATION_INVALID');
  ensure(process.env.TARGET_COMPANY_ID === '6', 'TENANT_INVALID');
  ensure(Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID), 'PRODUCTION_D1_CREDENTIALS_UNAVAILABLE');
  const output = summarizeFailures(query());
  process.stdout.write(JSON.stringify(output) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(String(error?.message ?? 'REJECTION_AUDIT_FAILED').slice(0,100)); process.exitCode=1; });
}
