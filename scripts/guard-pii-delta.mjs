#!/usr/bin/env node
/**
 * Ratchet de PII: bloqueia PII NOVA nas linhas adicionadas por uma PR/branch
 * sem exigir que o legado histórico já esteja saneado.
 *
 * O guard nunca imprime o valor detectado, apenas arquivo/linha/regra.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseUnifiedDiffAddedLines, scanAddedLines } from './pii-delta-lib.mjs';

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveBaseRef() {
  if (process.argv[2]) return process.argv[2];
  if (process.env.GUARD_PII_DELTA_BASE_REF) return process.env.GUARD_PII_DELTA_BASE_REF;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  return 'origin/main';
}

function refExists(ref, cwd) {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

function ensureBaseRef(baseRef, cwd) {
  if (refExists(baseRef, cwd)) return;
  const branch = baseRef.startsWith('origin/') ? baseRef.slice('origin/'.length) : baseRef;
  try {
    git(['fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], cwd);
  } catch {
    // runGuard abaixo falha fechado se ainda não houver base válida.
  }
}

export function runGuard({ cwd = process.cwd(), baseRef = resolveBaseRef() } = {}) {
  ensureBaseRef(baseRef, cwd);
  if (!refExists(baseRef, cwd)) {
    throw new Error(`PII_DELTA_BASE_UNAVAILABLE: ${baseRef}`);
  }

  const mergeBase = git(['merge-base', baseRef, 'HEAD'], cwd).trim();
  if (!mergeBase) {
    throw new Error(`PII_DELTA_MERGE_BASE_UNAVAILABLE: ${baseRef}`);
  }

  const diff = git(['diff', '--no-ext-diff', '-U0', `${mergeBase}...HEAD`, '--', '.'], cwd);
  const lines = parseUnifiedDiffAddedLines(diff);
  const violations = scanAddedLines(lines);

  return { baseRef, mergeBase, violations };
}

function main() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  try {
    const result = runGuard({ cwd });
    if (result.violations.length === 0) {
      console.log(
        `OK: guard:pii-delta — nenhuma PII nova detectada vs ${result.baseRef} (${result.mergeBase})`,
      );
      console.log('RESULT: PASS');
      return;
    }

    console.error(
      `RESULT: FAIL — guard:pii-delta encontrou ${result.violations.length} ocorrência(s) nova(s).`,
    );
    for (const violation of result.violations) {
      console.error(
        `  ${violation.file}:${violation.line} [${violation.ruleId}] ${violation.message}`,
      );
    }
    console.error(
      'Use dados sintéticos não identificáveis (por exemplo, domínio example.invalid e CPF inválido de teste).',
    );
    process.exit(1);
  } catch (error) {
    console.error(
      `RESULT: FAIL — guard:pii-delta não conseguiu provar o delta com segurança: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
