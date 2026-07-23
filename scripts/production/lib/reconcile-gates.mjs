// Pure, dangerous-operation gates shared by the 0440 ledger reconciler CLI and
// the remote 0441/0442 runner. None of these touch a database; they validate
// the environment before any production contact is allowed.

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// The one and only production D1 this tooling may target.
export const PRODUCTION_TARGET = Object.freeze({
  database_name: 'airtrust-db',
  database_id: '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
});

export const CONFIRM_TEXT_RECONCILE =
  'I understand this reconciles only the 0440 ledger entry';

/**
 * Refuse any target that is not exactly the production D1. `actual` must carry
 * the values resolved from the real wrangler config / `wrangler d1 info`, never
 * free-form user input.
 */
export function assertProductionTarget(actual) {
  if (!actual || typeof actual !== 'object') {
    throw new Error('alvo de banco ausente para validação');
  }
  if (actual.database_name !== PRODUCTION_TARGET.database_name) {
    throw new Error(
      `database_name inválido: ${actual.database_name} (esperado ${PRODUCTION_TARGET.database_name})`,
    );
  }
  if (actual.database_id !== PRODUCTION_TARGET.database_id) {
    throw new Error(
      `database_id inválido: ${actual.database_id} (esperado ${PRODUCTION_TARGET.database_id})`,
    );
  }
  return true;
}

export function sha256OfFile(path) {
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Validate an official backup that lives OUTSIDE the repo: it must exist and
 * match both the expected byte size and the expected SHA-256. The expected
 * values are passed in at call time (never hard-coded), so the tooling stays
 * reusable across windows.
 */
export function validateBackup({ path, expectedBytes, expectedSha256 }) {
  if (!path) throw new Error('caminho do backup oficial é obrigatório');
  let stat;
  try {
    stat = statSync(path);
  } catch {
    throw new Error(`backup oficial não encontrado: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`backup oficial não é um arquivo: ${path}`);
  }
  if (typeof expectedBytes !== 'number' || !Number.isFinite(expectedBytes)) {
    throw new Error('tamanho esperado do backup (bytes) é obrigatório');
  }
  if (stat.size !== expectedBytes) {
    throw new Error(
      `tamanho do backup diverge: ${stat.size} bytes (esperado ${expectedBytes})`,
    );
  }
  if (!expectedSha256 || !/^[0-9a-f]{64}$/i.test(expectedSha256)) {
    throw new Error('SHA-256 esperado do backup é obrigatório (64 hex)');
  }
  const actual = sha256OfFile(path);
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(
      `SHA-256 do backup diverge: ${actual} (esperado ${expectedSha256.toLowerCase()})`,
    );
  }
  return { path, bytes: stat.size, sha256: actual.toLowerCase() };
}

/**
 * Validate that the migration file in the repo matches an expected SHA-256, so
 * the ledger entry we record refers to literally this reviewed migration.
 */
export function validateMigrationHash({ path, expectedSha256 }) {
  const actual = sha256OfFile(path);
  if (expectedSha256) {
    if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) {
      throw new Error('SHA-256 esperado da migration deve ter 64 hex');
    }
    if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new Error(
        `SHA-256 da migration 0440 diverge: ${actual} (esperado ${expectedSha256.toLowerCase()})`,
      );
    }
  }
  return actual.toLowerCase();
}

/**
 * Require a clean `main` that equals `origin/main`. Uses git in the given cwd.
 */
export function assertCleanMain({ cwd, runGit = defaultRunGit } = {}) {
  const branch = runGit(['branch', '--show-current'], cwd).trim();
  if (branch !== 'main') {
    throw new Error(`só pode rodar a partir de main (atual: ${branch})`);
  }
  if (runGit(['status', '--porcelain'], cwd).trim() !== '') {
    throw new Error('árvore de trabalho suja: há alterações não commitadas');
  }
  runGit(['fetch', 'origin', 'main'], cwd);
  const head = runGit(['rev-parse', 'HEAD'], cwd).trim();
  const origin = runGit(['rev-parse', 'origin/main'], cwd).trim();
  if (head !== origin) {
    throw new Error(`HEAD (${head}) != origin/main (${origin})`);
  }
  return { branch, head };
}

function defaultRunGit(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0 && args[0] !== 'fetch') {
    throw new Error(`git ${args.join(' ')} falhou: ${res.stderr || res.stdout}`);
  }
  return res.stdout || '';
}

export default {
  PRODUCTION_TARGET,
  CONFIRM_TEXT_RECONCILE,
  assertProductionTarget,
  sha256OfFile,
  validateBackup,
  validateMigrationHash,
  assertCleanMain,
};
