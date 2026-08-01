#!/usr/bin/env node
// Requires focused regression tests when a pull request changes selected high-risk boundaries.
// The gate is intentionally narrow and applies only to files changed since the real merge-base.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RISK_RULES = [
  {
    id: 'auth-tenant-boundary',
    runtime: [
      /^worker-airtrust\/src\/middleware\/(auth|tenant|rbac)\.ts$/,
      /^worker-airtrust\/src\/lib\/rbac\//,
    ],
    tests: [
      /(^|\/)(__tests__|tests)\/.*(auth|tenant|rbac|role|permission).*\.test\.(ts|tsx|js|mjs)$/i,
    ],
  },
  {
    id: 'certificate-compliance',
    runtime: [
      /^worker-airtrust\/src\/routes\/certificados[^/]*\.ts$/,
      /^worker-airtrust\/src\/services\/certificado/i,
      /^src\/react-app\/.*certificado/i,
    ],
    tests: [/(^|\/)(__tests__|tests)\/.*certificado.*\.test\.(ts|tsx|js|mjs)$/i],
  },
  {
    id: 'lms-history',
    runtime: [
      /^worker-airtrust\/src\/routes\/lms-[^/]*\.ts$/,
      /^worker-airtrust\/src\/services\/lms-[^/]*\.ts$/,
      /^src\/react-app\/pages\/lms\//,
      /^src\/react-app\/hooks\/useLms\.ts$/,
    ],
    tests: [/(^|\/)(__tests__|tests)\/.*(lms|edapp|ead).*\.test\.(ts|tsx|js|mjs)$/i],
  },
  {
    id: 'frontend-api-client',
    runtime: [/^src\/react-app\/config\/api\.ts$/, /^src\/react-app\/hooks\/useApi\.ts$/],
    tests: [/(^|\/)(__tests__|tests)\/.*(api|auth|network).*\.test\.(ts|tsx|js|mjs)$/i],
  },
  {
    id: 'release-safety',
    runtime: [
      /^scripts\/(deploy|release|preflight|apply-migration|run-production)/,
      /^scripts\/schema-v2\//,
      /^\.github\/workflows\/(deploy|apply-schema|staging-d1)/,
    ],
    tests: [
      /^scripts\/__tests__\/.*(deploy|release|preflight|migration|schema|production|staging|smoke).*\.test\.mjs$/i,
      /^scripts\/(staging|production)\/.*smoke.*\.mjs$/i,
    ],
  },
];

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function resolveBaseRef(env = process.env, cliArg = process.argv[2]) {
  if (cliArg) return cliArg;
  if (env.GUARD_RISK_TEST_BASE_REF) return env.GUARD_RISK_TEST_BASE_REF;
  if (env.GITHUB_BASE_REF) return `origin/${env.GITHUB_BASE_REF}`;
  return 'origin/main';
}

export function readChangedFiles({ cwd = process.cwd(), baseRef = resolveBaseRef() } = {}) {
  const mergeBase = git(['merge-base', baseRef, 'HEAD'], cwd).trim();
  const raw = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', '-z', `${mergeBase}...HEAD`],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  return {
    baseRef,
    mergeBase,
    files: raw.split('\0').filter(Boolean),
  };
}

export function evaluateRiskTestCoverage(files, rules = RISK_RULES) {
  const normalized = [...new Set(files.map((file) => file.trim()).filter(Boolean))];

  return rules
    .map((rule) => {
      const runtimeFiles = normalized.filter((file) =>
        rule.runtime.some((pattern) => pattern.test(file)),
      );
      const testFiles = normalized.filter((file) =>
        rule.tests.some((pattern) => pattern.test(file)),
      );

      return {
        id: rule.id,
        runtimeFiles,
        testFiles,
        covered: runtimeFiles.length === 0 || testFiles.length > 0,
      };
    })
    .filter((result) => result.runtimeFiles.length > 0);
}

export function assertRiskTestCoverage(files, rules = RISK_RULES) {
  const results = evaluateRiskTestCoverage(files, rules);
  const uncovered = results.filter((result) => !result.covered);

  if (uncovered.length > 0) {
    const details = uncovered
      .map(
        (result) =>
          `${result.id}: changed ${result.runtimeFiles.join(', ')} without a focused regression test`,
      )
      .join('\n');
    throw new Error(details);
  }

  return results;
}

function main() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const changed = readChangedFiles({ cwd });
  const results = assertRiskTestCoverage(changed.files);

  if (results.length === 0) {
    console.log(`OK: no protected risk boundary changed vs ${changed.baseRef}`);
    return;
  }

  for (const result of results) {
    console.log(
      `OK: ${result.id} covered by ${result.testFiles.join(', ')} for ${result.runtimeFiles.join(', ')}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error('RESULT: FAIL — high-risk runtime changes require focused regression tests.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
