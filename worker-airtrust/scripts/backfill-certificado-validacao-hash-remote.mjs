#!/usr/bin/env node
/**
 * Governed, idempotent REMOTE backfill of qualificacoes_historico.validacao_hash
 * against a real (staging or production) D1 database via `wrangler d1 execute
 * --remote`.
 *
 * This is deliberately a separate executor from
 * `backfill-certificado-validacao-hash.mjs` (which only ever touches a local
 * sqlite file via the `sqlite3` CLI and remains unmodified/still used for
 * local dev). This script never shells out to `sqlite3`; it only talks to D1
 * through `wrangler d1 execute --remote`.
 *
 * Canonical hash rule: reuses the exact same algorithm as
 * `worker-airtrust/src/utils/certificate-validation-hash.ts`
 * (`generateCertificateValidationHash`) — re-derived here byte-for-byte using
 * Node's `crypto` because the production code uses WebCrypto (`crypto.subtle`),
 * which is not available synchronously. Any change to the production hash
 * function must be mirrored here or the collision/idempotency tests below
 * will start failing (see the test file), which is the intended tripwire.
 *
 * Safety properties (see PR description / CLAUDE.md governance requirements):
 *  - default is dry-run; --apply is required to write anything
 *  - target must be exactly "staging" or "production", mapped to a hardcoded
 *    D1 database name/id — never accepted as free text
 *  - --release-sha must be a 40-hex-char SHA and is recorded in the report
 *  - idempotent: already-hashed rows are skipped and reported as alreadyHashed
 *  - every UPDATE is scoped by id AND empresa_id
 *  - batched SELECT+UPDATE via wrangler d1 execute --remote
 *  - incomplete source rows (missing cpf/qualificacao_codigo/data_conclusao/
 *    numero_certificado) are detected and never hashed
 *  - hash collisions across the *entire* run are detected; if any collision
 *    is found, the whole run refuses to write ANY row (fail-closed)
 *  - --apply requires --confirm with a target-specific confirmation string
 *  - production is wired through but this script does not get invoked against
 *    production by any automation in this change — staging-first only
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

export const STAGING_TARGET = 'staging';
export const PRODUCTION_TARGET = 'production';

export const ALLOWED_TARGETS = Object.freeze({
  [STAGING_TARGET]: Object.freeze({
    databaseName: 'airtrust-db-staging-baseline-20260701',
    databaseId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
    confirmPhrase: 'CONFIRM_STAGING_BACKFILL_VALIDACAO_HASH',
  }),
  [PRODUCTION_TARGET]: Object.freeze({
    databaseName: 'airtrust-db',
    databaseId: '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
    confirmPhrase: 'CONFIRM_PRODUCTION_BACKFILL_VALIDACAO_HASH',
  }),
});

export const CERTIFICATE_SCAN_BATCH_SIZE = 250;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/;

export class BackfillRefusedError extends Error {}

export function resolveTarget(targetName) {
  const resolved = ALLOWED_TARGETS[targetName];
  if (!resolved) {
    throw new BackfillRefusedError(
      `alvo inválido '${targetName}'; use --target=staging ou --target=production`,
    );
  }
  return { name: targetName, ...resolved };
}

export function assertReleaseSha(releaseSha) {
  if (!releaseSha || !RELEASE_SHA_PATTERN.test(releaseSha)) {
    throw new BackfillRefusedError('--release-sha deve ser um SHA de 40 caracteres hex.');
  }
  return releaseSha;
}

export function assertConfirmation({ targetName, apply, confirm }) {
  if (!apply) return;
  const target = resolveTarget(targetName);
  if (confirm !== target.confirmPhrase) {
    throw new BackfillRefusedError(
      `--apply em '${targetName}' requer --confirm=${target.confirmPhrase}. ` +
        'A confirmação de outro ambiente nunca é aceita aqui.',
    );
  }
}

/**
 * Byte-for-byte re-derivation of
 * generateCertificateValidationHash()/normalizeCertificateHashInput() from
 * worker-airtrust/src/utils/certificate-validation-hash.ts, using Node's
 * synchronous crypto instead of WebCrypto so it can run outside a Worker.
 */
export function normalizeCertificateHashInputSync(input) {
  const cpf = String(input.funcionarioCpf || '').replace(/\D/g, '');
  const qualificacaoCodigo = String(input.qualificacaoCodigo || '').trim();
  const dataConclusao = String(input.dataConclusao || '').trim().split('T')[0];
  const numeroCertificado = String(input.numeroCertificado || '').trim();
  if (!cpf || !qualificacaoCodigo || !dataConclusao || !numeroCertificado) {
    return null;
  }
  return `${cpf}${qualificacaoCodigo}${dataConclusao}${numeroCertificado}`;
}

export function generateCertificateValidationHashSync(input) {
  const canonical = normalizeCertificateHashInputSync(input);
  if (!canonical) {
    throw new Error('CERTIFICATE_VALIDATION_HASH_INPUT_INCOMPLETE');
  }
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16).toUpperCase();
}

function quoteSqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildSelectBatchSql({ empresaId, afterId, limit }) {
  const tenantPredicate = empresaId ? `AND h.empresa_id = ${Number(empresaId)}` : '';
  const cursorPredicate = afterId ? `AND h.id > ${Number(afterId)}` : '';
  return `SELECT h.id AS id, h.empresa_id AS empresa_id, h.funcionario_id AS funcionario_id,
       h.qualificacao_codigo AS qualificacao_codigo, h.data_conclusao AS data_conclusao,
       h.numero_certificado AS numero_certificado, h.validacao_hash AS validacao_hash,
       f.cpf AS cpf
     FROM qualificacoes_historico h
     LEFT JOIN funcionarios f ON f.id = h.funcionario_id AND f.deleted_at IS NULL
    WHERE h.deleted_at IS NULL
      AND h.certificado_arquivo_id IS NOT NULL
      AND h.numero_certificado IS NOT NULL
      ${tenantPredicate}
      ${cursorPredicate}
    ORDER BY h.id ASC
    LIMIT ${Number(limit)};`;
}

/** Every UPDATE must be scoped by BOTH id and empresa_id — never a bare id. */
export function buildUpdateSql({ id, empresaId, hash }) {
  if (id === undefined || id === null || empresaId === undefined || empresaId === null) {
    throw new BackfillRefusedError('UPDATE recusado: id e empresa_id são obrigatórios.');
  }
  return `UPDATE qualificacoes_historico
              SET validacao_hash = ${quoteSqlLiteral(hash)}
            WHERE id = ${Number(id)}
              AND empresa_id = ${Number(empresaId)}
              AND (validacao_hash IS NULL OR validacao_hash != ${quoteSqlLiteral(hash)});`;
}

/**
 * Classifies a batch of source rows: incomplete rows (never hashed),
 * already-hashed rows (idempotent no-op), rows that need an update, and
 * cross-row hash collisions. Pure function — no I/O — so it is fully unit
 * testable without a real D1 connection.
 */
export function classifyRows(rows) {
  const incomplete = [];
  const toUpdate = [];
  const alreadyHashed = [];
  const hashOwners = new Map();

  for (const row of rows) {
    let hash;
    try {
      hash = generateCertificateValidationHashSync({
        funcionarioCpf: row.cpf,
        qualificacaoCodigo: row.qualificacao_codigo,
        dataConclusao: row.data_conclusao,
        numeroCertificado: row.numero_certificado,
      });
    } catch {
      incomplete.push({ id: row.id, empresa_id: row.empresa_id });
      continue;
    }
    const owners = hashOwners.get(hash) || [];
    owners.push({ id: row.id, empresa_id: row.empresa_id });
    hashOwners.set(hash, owners);

    if (row.validacao_hash === hash) {
      alreadyHashed.push({ id: row.id, empresa_id: row.empresa_id, hash });
    } else {
      toUpdate.push({ id: row.id, empresa_id: row.empresa_id, hash });
    }
  }

  const collisions = [];
  for (const [hash, owners] of hashOwners.entries()) {
    if (owners.length > 1) {
      collisions.push({ hash, rows: owners });
    }
  }

  return { incomplete, toUpdate, alreadyHashed, collisions };
}

/** Default remote executor: shells out to `wrangler d1 execute --remote --json`. */
export function defaultExecRemote({ databaseName, sql }) {
  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', databaseName, '--remote', '--json', '--command', sql],
    {
      cwd: path.resolve(new URL('.', import.meta.url).pathname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const parsed = JSON.parse(output);
  return parsed?.[0]?.results ?? [];
}

/**
 * Runs the full governed backfill against one batch cursor loop.
 * `execRemote` is injectable so tests never touch a real D1/network boundary.
 */
export async function runBackfill({
  targetName,
  releaseSha,
  apply = false,
  confirm,
  empresaId,
  batchSize = CERTIFICATE_SCAN_BATCH_SIZE,
  execRemote = defaultExecRemote,
  recoveryPointConfirmed = false,
}) {
  const target = resolveTarget(targetName);
  assertReleaseSha(releaseSha);
  assertConfirmation({ targetName, apply, confirm });

  if (apply && !recoveryPointConfirmed) {
    throw new BackfillRefusedError(
      'ERROR: --apply requer um ponto de recuperação D1 Time Travel já capturado ' +
        '(ver scripts/staging/backfill-validacao-hash-with-recovery-point.sh). Recusado.',
    );
  }

  const allRows = [];
  let afterId = 0;
  for (;;) {
    const sql = buildSelectBatchSql({ empresaId, afterId, limit: batchSize });
    const batch = execRemote({ databaseName: target.databaseName, sql });
    if (!Array.isArray(batch) || batch.length === 0) break;
    allRows.push(...batch);
    afterId = batch[batch.length - 1].id;
    if (batch.length < batchSize) break;
  }

  const { incomplete, toUpdate, alreadyHashed, collisions } = classifyRows(allRows);

  const report = {
    target: target.name,
    releaseSha,
    dryRun: !apply,
    eligible: allRows.length,
    alreadyHashed: alreadyHashed.length,
    toUpdate: toUpdate.length,
    incomplete: incomplete.length,
    collisions: collisions.length,
    remaining: incomplete.length + toUpdate.length,
  };

  if (collisions.length > 0) {
    // Fail-closed: refuse to write ANY row in this run if any collision was
    // detected anywhere in the scanned set, not just the colliding rows.
    return { ...report, ok: false, reason: 'COLLISIONS_DETECTED', collisionDetails: collisions };
  }

  if (!apply) {
    return { ...report, ok: true, applied: 0 };
  }

  let applied = 0;
  for (const row of toUpdate) {
    const updateSql = buildUpdateSql({ id: row.id, empresaId: row.empresa_id, hash: row.hash });
    execRemote({ databaseName: target.databaseName, sql: updateSql });
    applied += 1;
  }
  report.remaining = incomplete.length;

  return { ...report, ok: true, applied };
}

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--recovery-point-confirmed') args.recoveryPointConfirmed = true;
    else if (arg.startsWith('--target=')) args.target = arg.slice('--target='.length);
    else if (arg.startsWith('--release-sha=')) args.releaseSha = arg.slice('--release-sha='.length);
    else if (arg.startsWith('--confirm=')) args.confirm = arg.slice('--confirm='.length);
    else if (arg.startsWith('--empresa-id=')) args.empresaId = arg.slice('--empresa-id='.length);
    else if (arg.startsWith('--batch-size=')) args.batchSize = Number(arg.slice('--batch-size='.length));
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runBackfill({
    targetName: args.target,
    releaseSha: args.releaseSha,
    apply: args.apply,
    confirm: args.confirm,
    empresaId: args.empresaId,
    batchSize: args.batchSize,
    recoveryPointConfirmed: Boolean(args.recoveryPointConfirmed),
  });
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
