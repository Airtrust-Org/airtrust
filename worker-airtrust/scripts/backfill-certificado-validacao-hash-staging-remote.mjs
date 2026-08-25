#!/usr/bin/env node
/**
 * Staging-only adapter for the governed 0470 validation-hash backfill.
 *
 * The staging database contains one durable synthetic QA certificate fixture
 * used by the domain/RBAC certificate smoke. It is intentionally test data,
 * not historical operational certificate data. The fixture can temporarily
 * lack canonical certificate-hash source fields between QA cycles, so it must
 * not participate in the historical backfill acceptance counts.
 *
 * Safety properties:
 * - staging only; no production target is accepted here;
 * - excludes only the exact known synthetic fixture marker + empresa_id;
 * - only SELECT statements are rewritten; UPDATE statements pass unchanged;
 * - the underlying governed executor still owns confirmation, collision,
 *   idempotency and recovery-point enforcement.
 */
import process from 'node:process';
import path from 'node:path';
import {
  BackfillRefusedError,
  defaultExecRemote,
  runBackfill,
} from './backfill-certificado-validacao-hash-remote.mjs';

export const STAGING_QA_CERT_FIXTURE_EMPRESA_ID = 999006;
export const STAGING_QA_CERT_FIXTURE_MARKER = 'QA_CERT_DOMAIN_E2E_999006';

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function excludeKnownStagingQaFixtureSql(sql) {
  const text = String(sql || '');
  if (!/^\s*SELECT\b/i.test(text)) return text;
  if (!/\bFROM\s+qualificacoes_historico\s+h\b/i.test(text)) return text;

  const orderAnchor = /\n\s*ORDER BY h\.id ASC/i;
  if (!orderAnchor.test(text)) {
    throw new BackfillRefusedError(
      'STAGING_QA_FIXTURE_FILTER_REFUSED: SELECT shape changed; review required.',
    );
  }

  const exclusion = `\n      AND NOT (h.empresa_id = ${STAGING_QA_CERT_FIXTURE_EMPRESA_ID}\n        AND h.observacoes = ${sqlLiteral(STAGING_QA_CERT_FIXTURE_MARKER)})`;
  return text.replace(orderAnchor, `${exclusion}\n    ORDER BY h.id ASC`);
}

export function createStagingFilteredExecRemote(execRemote = defaultExecRemote) {
  return ({ databaseName, sql }) =>
    execRemote({ databaseName, sql: excludeKnownStagingQaFixtureSql(sql) });
}

export async function runStagingBackfill({
  releaseSha,
  apply = false,
  confirm,
  empresaId,
  batchSize,
  recoveryPointConfirmed = false,
  execRemote = defaultExecRemote,
}) {
  return runBackfill({
    targetName: 'staging',
    releaseSha,
    apply,
    confirm,
    empresaId,
    batchSize,
    recoveryPointConfirmed,
    execRemote: createStagingFilteredExecRemote(execRemote),
  });
}

function parseArgs(argv) {
  const args = { apply: false, recoveryPointConfirmed: false };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--recovery-point-confirmed') args.recoveryPointConfirmed = true;
    else if (arg.startsWith('--release-sha=')) args.releaseSha = arg.slice('--release-sha='.length);
    else if (arg.startsWith('--confirm=')) args.confirm = arg.slice('--confirm='.length);
    else if (arg.startsWith('--empresa-id=')) args.empresaId = arg.slice('--empresa-id='.length);
    else if (arg.startsWith('--batch-size=')) args.batchSize = Number(arg.slice('--batch-size='.length));
    else {
      throw new BackfillRefusedError(`argumento não permitido no adaptador staging: ${arg}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runStagingBackfill(args);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMainModule) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
