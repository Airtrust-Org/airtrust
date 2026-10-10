#!/usr/bin/env node
// Verify every canonical job present in the real staging fixture; never mutate D1.
// Production independently requires all 28 models and full function counts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CANONICAL_SQL = resolve(ROOT, 'worker-airtrust/schema-v2/changes/0545_training_compliance_canonical_pdf_alignment.sql');
const STAGING_DB = 'airtrust-db-staging-baseline-20260701';

export function canonicalPairs(sql) {
  const pairs = [...sql.matchAll(/\('([^']+)','([^']+)'\)/g)].map(([, code, name]) => ({ code, name }));
  const expected = { 'NR-11': 2, 'NR-12': 2, 'NR-20': 4, 'NR-26': 18, 'NR-35': 2, FOD: 20, PPSP: 20 };
  for (const [code, count] of Object.entries(expected)) {
    if (pairs.filter(p => p.code === code).length !== count) throw Error('CANONICAL_SQL_PAIRS_MISMATCH:' + code);
  }
  if (pairs.length !== 68) throw Error('CANONICAL_SQL_UNEXPECTED_PAIR_COUNT:' + pairs.length);
  return pairs;
}

export function coverageSQL(pairs) {
  const values = pairs.map(p =>
    "('" + p.code.replaceAll("'", "''") + "','" + p.name.replaceAll("'", "''") + "')"
  ).join(',\n');
  return [
    'WITH target(codigo,cargo) AS (VALUES ' + values + '),',
    'applicable AS (',
    ' SELECT t.codigo,qt.id AS qualification_id,f.id AS function_id',
    ' FROM target t',
    ' JOIN qualificacoes_tipos qt ON qt.empresa_id=6 AND qt.codigo=t.codigo AND qt.ativo=1 AND qt.deleted_at IS NULL',
    ' JOIN funcoes f ON f.empresa_id=6 AND f.nome=t.cargo AND f.ativo=1 AND f.deleted_at IS NULL',
    '),',
    'coverage AS (',
    ' SELECT a.codigo, (SELECT COUNT(*) FROM treinamento_requisitos tr',
    '   WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=a.qualification_id',
    "   AND tr.funcao_id=a.function_id AND tr.escopo='FUNCAO'",
    "   AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL) AS links",
    ' FROM applicable a',
    ')',
    'SELECT COUNT(*) AS covered_pairs,',
    ' COALESCE(SUM(CASE WHEN links<>1 THEN 1 ELSE 0 END),0) AS missing_or_duplicate,',
    ' COUNT(DISTINCT codigo) AS covered_courses FROM coverage;'
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || args[0] !== '--target=' + STAGING_DB) throw Error('STAGING_DB_TARGET_REQUIRED');
    const query = coverageSQL(canonicalPairs(readFileSync(CANONICAL_SQL, 'utf8')));
    const r = spawnSync('npx',
      ['wrangler','d1','execute',STAGING_DB,'--env','staging','--remote','--json','--command',query],
      { cwd: resolve(ROOT, 'worker-airtrust'), encoding: 'utf8', env: process.env, timeout: 90000 }
    );
    if (r.status !== 0) throw Error('STAGING_READONLY_QUERY_FAILED:' + String(r.stderr).slice(0, 500));
    const row = JSON.parse(r.stdout)?.[0]?.results?.[0];
    if (!row || Number(row.covered_pairs) < 30 ||
        Number(row.covered_courses) !== 7 ||
        Number(row.missing_or_duplicate) !== 0)
      throw Error('STAGING_0545_CANONICAL_ROLE_COVERAGE_FAILED:' + JSON.stringify(row));
    console.log('TRAINING_COMPLIANCE_0545_STAGING_APPLICABLE_ROLES=PASS:' + row.covered_pairs);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
