#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKSPACES = [
  {
    name: 'root',
    packagePath: 'package.json',
    lockPath: 'package-lock.json',
  },
  {
    name: 'worker',
    packagePath: 'worker-airtrust/package.json',
    lockPath: 'worker-airtrust/package-lock.json',
  },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });

  if (result.error) throw result.error;
  return result;
}

function assertCommitSha(value, label) {
  if (!/^[0-9a-f]{40}$/i.test(value ?? '')) {
    throw new Error(`${label} must be a full 40-character commit SHA`);
  }
}

function readAtRef(repoRoot, ref, filePath) {
  const result = run('git', ['show', `${ref}:${filePath}`], { cwd: repoRoot });
  if (result.status !== 0) {
    throw new Error(
      `Unable to read ${filePath} at ${ref}: ${result.stderr.trim() || 'git show failed'}`,
    );
  }
  return result.stdout;
}

function dependencySnapshotHash(packageJson, packageLock) {
  return createHash('sha256')
    .update(packageJson)
    .update('\0')
    .update(packageLock)
    .digest('hex');
}

function materializeWorkspace(root, packageJson, packageLock) {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'package.json'), packageJson);
  writeFileSync(path.join(root, 'package-lock.json'), packageLock);
}

function runNpmAudit(workspaceDir) {
  const result = run(
    'npm',
    ['audit', '--json', '--package-lock-only', '--ignore-scripts'],
    {
      cwd: workspaceDir,
      env: {
        ...process.env,
        npm_config_fund: 'false',
        npm_config_update_notifier: 'false',
      },
    },
  );

  let report;
  try {
    report = JSON.parse(result.stdout || '{}');
  } catch (error) {
    throw new Error(
      `npm audit returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (report.error) {
    const summary = report.error.summary || report.error.message || JSON.stringify(report.error);
    throw new Error(`npm audit failed: ${summary}`);
  }

  if (report.auditReportVersion !== 2 || typeof report.vulnerabilities !== 'object') {
    throw new Error('npm audit returned an unsupported report format');
  }

  return report;
}

export function collectCriticalSignatures(report, workspaceName) {
  const signatures = new Set();
  const vulnerabilities = report?.vulnerabilities ?? {};

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    const criticalAdvisories = Array.isArray(vulnerability?.via)
      ? vulnerability.via.filter(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            String(item.severity).toLowerCase() === 'critical',
        )
      : [];

    for (const advisory of criticalAdvisories) {
      const advisoryIdentity =
        advisory.source ?? advisory.url ?? advisory.title ?? advisory.name ?? 'unknown-advisory';
      signatures.add(
        [
          workspaceName,
          packageName,
          advisoryIdentity,
          advisory.range ?? vulnerability.range ?? 'unknown-range',
        ].join('|'),
      );
    }

    if (
      String(vulnerability?.severity).toLowerCase() === 'critical' &&
      criticalAdvisories.length === 0
    ) {
      signatures.add(
        [
          workspaceName,
          packageName,
          'aggregate-critical',
          vulnerability.range ?? 'unknown-range',
        ].join('|'),
      );
    }
  }

  return signatures;
}

export function findNewCriticalSignatures(baseSignatures, headSignatures) {
  return [...headSignatures].filter((signature) => !baseSignatures.has(signature)).sort();
}

function auditWorkspaceDelta({ repoRoot, baseSha, headSha, workspace }) {
  const basePackage = readAtRef(repoRoot, baseSha, workspace.packagePath);
  const baseLock = readAtRef(repoRoot, baseSha, workspace.lockPath);
  const headPackage = readAtRef(repoRoot, headSha, workspace.packagePath);
  const headLock = readAtRef(repoRoot, headSha, workspace.lockPath);

  if (
    dependencySnapshotHash(basePackage, baseLock) ===
    dependencySnapshotHash(headPackage, headLock)
  ) {
    return {
      workspace: workspace.name,
      changed: false,
      newCritical: [],
    };
  }

  const tempRoot = mkdtempSync(path.join(tmpdir(), `airtrust-audit-${workspace.name}-`));
  try {
    const baseDir = path.join(tempRoot, 'base');
    const headDir = path.join(tempRoot, 'head');
    materializeWorkspace(baseDir, basePackage, baseLock);
    materializeWorkspace(headDir, headPackage, headLock);

    const baseSignatures = collectCriticalSignatures(runNpmAudit(baseDir), workspace.name);
    const headSignatures = collectCriticalSignatures(runNpmAudit(headDir), workspace.name);

    return {
      workspace: workspace.name,
      changed: true,
      baseCritical: baseSignatures.size,
      headCritical: headSignatures.size,
      newCritical: findNewCriticalSignatures(baseSignatures, headSignatures),
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function runCriticalDeltaAudit({
  repoRoot,
  baseSha,
  headSha,
  workspaces = WORKSPACES,
}) {
  assertCommitSha(baseSha, 'baseSha');
  assertCommitSha(headSha, 'headSha');

  return workspaces.map((workspace) =>
    auditWorkspaceDelta({ repoRoot, baseSha, headSha, workspace }),
  );
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const baseSha = process.argv[2] || process.env.GITHUB_BASE_SHA;
  const headSha = process.argv[3] || process.env.GITHUB_HEAD_SHA;
  const results = runCriticalDeltaAudit({ repoRoot, baseSha, headSha });
  const newlyIntroduced = results.flatMap((result) => result.newCritical);

  for (const result of results) {
    if (!result.changed) {
      console.log(`${result.workspace}: dependency snapshot unchanged`);
      continue;
    }
    console.log(
      `${result.workspace}: critical baseline ${result.baseCritical}; head ${result.headCritical}; new ${result.newCritical.length}`,
    );
  }

  if (newlyIntroduced.length > 0) {
    console.error('New critical dependency vulnerabilities introduced:');
    for (const signature of newlyIntroduced) console.error(`- ${signature}`);
    process.exit(1);
  }

  console.log('OK: no new critical dependency vulnerabilities introduced by this delta');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
