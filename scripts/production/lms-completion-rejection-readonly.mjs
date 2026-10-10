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

/** Contract inventory of active published LMS courses which require a qualification. */
const CATEGORY_SQL = `SELECT c.id AS course_id, c.qualificacao_tipo_id AS type_id,
  qt.categoria_id AS type_category_id,
  qc.codigo AS category_code,
  CASE WHEN qt.id IS NULL THEN 'TYPE_NOT_FOUND'
       WHEN COALESCE(qt.ativo, 0) <> 1 THEN 'TYPE_INACTIVE'
       WHEN qt.categoria_id IS NULL THEN 'TYPE_WITHOUT_CATEGORY'
       WHEN qc.id IS NULL THEN 'CATEGORY_NOT_FOUND'
       WHEN COALESCE(qc.ativo, 0) <> 1 THEN 'CATEGORY_INACTIVE'
       WHEN COALESCE(qc.lms_integrada, 0) <> 1 THEN 'CATEGORY_NOT_INTEGRATED'
       ELSE 'VALID' END AS state
  FROM lms_cursos c
  LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id
    AND qt.empresa_id = c.empresa_id AND qt.deleted_at IS NULL
  LEFT JOIN qualificacoes_categorias qc ON qc.id = qt.categoria_id
    AND qc.empresa_id = c.empresa_id AND qc.deleted_at IS NULL
  WHERE c.empresa_id = 6
    AND c.ativo = 1 AND c.publicado = 1 AND c.deleted_at IS NULL
    AND c.gerar_qualificacao_ao_concluir = 1
    AND c.tipo_conteudo = 'scorm'
  ORDER BY c.id LIMIT 250`;

const CANONICAL_CATEGORY_SQL = `SELECT id, codigo, ativo, lms_integrada
  FROM qualificacoes_categorias
  WHERE empresa_id = 6 AND deleted_at IS NULL AND COALESCE(lms_integrada, 0) = 1
  ORDER BY id LIMIT 10`;

// Production schema has historically lacked the 0457 flag. Match the
// runtime's exact legacy EAD-code compatibility instead of presuming a
// migration file was applied to production.
const CATEGORY_COLUMN_SUPPORT_SQL = `SELECT COUNT(*) AS total
  FROM pragma_table_info('qualificacoes_categorias')
 WHERE name = 'lms_integrada'`;

const CATEGORY_SQL_LEGACY = CATEGORY_SQL.replace(
  'COALESCE(qc.lms_integrada, 0) <> 1',
  "UPPER(TRIM(COALESCE(qc.codigo, ''))) <> 'EAD'",
);

const CANONICAL_CATEGORY_SQL_LEGACY = `SELECT id, codigo, ativo, 1 AS lms_integrada
  FROM qualificacoes_categorias
  WHERE empresa_id = 6 AND deleted_at IS NULL
    AND UPPER(TRIM(codigo)) = 'EAD'
  ORDER BY id LIMIT 10`;

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


function safeCategoryCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z0-9_-]{1,32}$/.test(code) ? code : null;
}

export function summarizeCategoryMappings(rows, canonicalRows) {
  ensure(Array.isArray(rows) && rows.length <= 250, 'COURSE_MAPPING_ROWS_INVALID');
  ensure(Array.isArray(canonicalRows) && canonicalRows.length <= 10, 'CANONICAL_CATEGORY_ROWS_INVALID');
  const allowed = new Set(['TYPE_NOT_FOUND', 'TYPE_INACTIVE', 'TYPE_WITHOUT_CATEGORY',
    'CATEGORY_NOT_FOUND', 'CATEGORY_INACTIVE', 'CATEGORY_NOT_INTEGRATED', 'VALID']);
  const seen = new Set();
  const courseStates = rows.map((row) => {
    const courseId = Number(row?.course_id);
    const typeId = row?.type_id == null ? null : Number(row.type_id);
    const categoryId = row?.type_category_id == null ? null : Number(row.type_category_id);
    const state = String(row?.state);
    ensure(Number.isSafeInteger(courseId) && courseId > 0 && !seen.has(courseId), 'COURSE_ID_INVALID');
    ensure(allowed.has(state), 'CATEGORY_STATE_INVALID');
    ensure(typeId == null || Number.isSafeInteger(typeId) && typeId > 0, 'QUALIFICATION_TYPE_ID_INVALID');
    ensure(categoryId == null || Number.isSafeInteger(categoryId) && categoryId > 0, 'CATEGORY_ID_INVALID');
    seen.add(courseId);
    return { course_id: courseId, type_id: typeId, category_id: categoryId,
      category_code: safeCategoryCode(row.category_code), state };
  });
  const canonical = canonicalRows.map(row => ({
    id: Number(row.id), code: safeCategoryCode(row.codigo),
    active: Number(row.ativo) === 1, integrated: Number(row.lms_integrada) === 1,
  }));
  ensure(canonical.every(x=>Number.isSafeInteger(x.id) && x.id > 0 && x.integrated), 'CANONICAL_CATEGORY_INVALID');
  return { evaluated: courseStates.length, invalid: courseStates.filter(x => x.state !== 'VALID').length,
    canonical_categories: canonical, mismatches: courseStates.filter(x => x.state !== 'VALID' || x.course_id === 71),
    writes: 0, contains_personal_data: false };
}

function query(sql) {
  ensure([SQL, CATEGORY_SQL, CANONICAL_CATEGORY_SQL, CATEGORY_SQL_LEGACY, CANONICAL_CATEGORY_SQL_LEGACY, CATEGORY_COLUMN_SUPPORT_SQL].includes(sql), 'UNREVIEWED_SQL_REJECTED');
  ensure(/^SELECT\b/i.test(sql), 'NON_SELECT_SQL');
  ensure(!/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|ATTACH|DETACH|PRAGMA|REPLACE|VACUUM)\b/i.test(sql.replace(/'[^']*'/g, "''")), 'SQL_MUTATION_NOT_ALLOWED');
  ensure(!sql.includes(';'), 'MULTI_STATEMENT_REJECTED');
  const child = spawnSync('npx',
    ['wrangler','d1','execute','airtrust-db','--env','production','--remote','--json','--command',sql],
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
  const output = summarizeFailures(query(SQL));
  const support = query(CATEGORY_COLUMN_SUPPORT_SQL);
  ensure(support.length === 1 && [0, 1].includes(Number(support[0]?.total)), 'CATEGORY_SCHEMA_SUPPORT_UNEXPECTED');
  const hasFlag = Number(support[0].total) === 1;
  output.qualification_category_contract = summarizeCategoryMappings(
    query(hasFlag ? CATEGORY_SQL : CATEGORY_SQL_LEGACY),
    query(hasFlag ? CANONICAL_CATEGORY_SQL : CANONICAL_CATEGORY_SQL_LEGACY),
  );
  output.qualification_category_contract.schema_mode = hasFlag ? 'explicit' : 'legacy-code-compat';
  process.stdout.write(JSON.stringify(output) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(String(error?.message ?? 'REJECTION_AUDIT_FAILED').slice(0,100)); process.exitCode=1; });
}
