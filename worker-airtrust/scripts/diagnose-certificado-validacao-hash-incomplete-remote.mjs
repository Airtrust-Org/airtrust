#!/usr/bin/env node
/**
 * Read-only, staging-only diagnostic for historical certificate rows that the
 * governed 0470 validation-hash backfill classifies as incomplete.
 *
 * Safety properties:
 * - staging D1 target is hardcoded; production is not accepted as input;
 * - SQL is fixed in source and asserted read-only before execution;
 * - output contains only internal ids and boolean missing-field flags;
 * - CPF, certificate number, qualification code and completion date values
 *   are never selected or printed;
 * - no INSERT/UPDATE/DELETE/DDL path exists in this executor.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const STAGING_DATABASE_NAME = 'airtrust-db-staging-baseline-20260701';
export const STAGING_DATABASE_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/;

export class DiagnosticRefusedError extends Error {}

export function assertReleaseSha(releaseSha) {
  if (!releaseSha || !RELEASE_SHA_PATTERN.test(releaseSha)) {
    throw new DiagnosticRefusedError('--release-sha deve ser um SHA de 40 caracteres hex.');
  }
  return releaseSha;
}

export function buildDiagnosticSql() {
  return `SELECT
      h.id AS id,
      h.empresa_id AS empresa_id,
      h.funcionario_id AS funcionario_id,
      CASE WHEN f.id IS NULL THEN 1 ELSE 0 END AS funcionario_ausente_ou_excluido,
      CASE WHEN f.cpf IS NULL OR TRIM(f.cpf) = '' THEN 1 ELSE 0 END AS cpf_missing,
      CASE WHEN h.qualificacao_codigo IS NULL OR TRIM(h.qualificacao_codigo) = '' THEN 1 ELSE 0 END AS qualificacao_codigo_missing,
      CASE WHEN h.data_conclusao IS NULL OR TRIM(h.data_conclusao) = '' THEN 1 ELSE 0 END AS data_conclusao_missing,
      CASE WHEN h.numero_certificado IS NULL OR TRIM(h.numero_certificado) = '' THEN 1 ELSE 0 END AS numero_certificado_missing
    FROM qualificacoes_historico h
    LEFT JOIN funcionarios f
      ON f.id = h.funcionario_id
     AND f.deleted_at IS NULL
    WHERE h.deleted_at IS NULL
      AND h.certificado_arquivo_id IS NOT NULL
      AND h.numero_certificado IS NOT NULL
      AND (
           f.cpf IS NULL OR TRIM(f.cpf) = ''
        OR h.qualificacao_codigo IS NULL OR TRIM(h.qualificacao_codigo) = ''
        OR h.data_conclusao IS NULL OR TRIM(h.data_conclusao) = ''
        OR TRIM(h.numero_certificado) = ''
      )
    ORDER BY h.id ASC;`;
}

export function assertReadOnlySql(sql) {
  const normalized = String(sql || '').trim();
  if (!/^SELECT\b/i.test(normalized)) {
    throw new DiagnosticRefusedError('diagnóstico recusado: somente SELECT é permitido');
  }
  if (/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|PRAGMA|ATTACH|DETACH)\b/i.test(normalized)) {
    throw new DiagnosticRefusedError('diagnóstico recusado: SQL contém operação não read-only');
  }
  return normalized;
}

export function sanitizeDiagnosticRow(row) {
  return {
    id: Number(row.id),
    empresa_id: Number(row.empresa_id),
    funcionario_id: row.funcionario_id === null ? null : Number(row.funcionario_id),
    funcionario_ausente_ou_excluido: Number(row.funcionario_ausente_ou_excluido) === 1,
    cpf_missing: Number(row.cpf_missing) === 1,
    qualificacao_codigo_missing: Number(row.qualificacao_codigo_missing) === 1,
    data_conclusao_missing: Number(row.data_conclusao_missing) === 1,
    numero_certificado_missing: Number(row.numero_certificado_missing) === 1,
  };
}

export function defaultExecRemote({ sql }) {
  const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', STAGING_DATABASE_NAME, '--remote', '--json', '--command', assertReadOnlySql(sql)],
    {
      cwd: workerDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const parsed = JSON.parse(output);
  return parsed?.[0]?.results ?? [];
}

export function runDiagnostic({ releaseSha, execRemote = defaultExecRemote }) {
  assertReleaseSha(releaseSha);
  const sql = buildDiagnosticSql();
  assertReadOnlySql(sql);
  const rawRows = execRemote({ sql });
  if (!Array.isArray(rawRows)) {
    throw new DiagnosticRefusedError('resposta D1 inválida para diagnóstico');
  }
  const rows = rawRows.map(sanitizeDiagnosticRow);
  return {
    target: 'staging',
    databaseId: STAGING_DATABASE_ID,
    releaseSha,
    readOnly: true,
    incompleteCount: rows.length,
    rows,
  };
}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg.startsWith('--release-sha=')) args.releaseSha = arg.slice('--release-sha='.length);
    else throw new DiagnosticRefusedError(`argumento não permitido: ${arg}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runDiagnostic({ releaseSha: args.releaseSha });
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
