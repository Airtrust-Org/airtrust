import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/i;

export function validateGateDefinition(gate) {
  if (!/^[a-z0-9-]+$/.test(gate?.id ?? '')) throw new Error('INVALID_GATE_ID');
  if (typeof gate.command !== 'string' || !gate.command) throw new Error(`INVALID_GATE_COMMAND:${gate.id}`);
  if (!Number.isInteger(gate.timeout_seconds) || gate.timeout_seconds <= 0) throw new Error(`INVALID_GATE_TIMEOUT:${gate.id}`);
  if (gate.required !== true) throw new Error(`GATE_MUST_BE_REQUIRED:${gate.id}`);
}

export function runGates({ gates, root, outputDirectory, dryRun = false, sha }) {
  if (!SHA.test(sha ?? '')) throw new Error('INVALID_RELEASE_SHA');
  const ids = new Set();
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const results = [];
  for (const gate of gates) {
    validateGateDefinition(gate);
    if (ids.has(gate.id)) throw new Error(`DUPLICATE_GATE:${gate.id}`);
    ids.add(gate.id);
    const startedAt = new Date().toISOString();
    const cwd = resolve(root, gate.working_directory);
    if (cwd !== resolve(root) && !cwd.startsWith(`${resolve(root)}/`)) throw new Error(`INVALID_GATE_CWD:${gate.id}`);
    const logPath = join(outputDirectory, `${gate.id}.log`);
    let exitCode = 0;
    let timedOut = false;
    let output = 'DRY_RUN: command not executed';
    if (!dryRun) {
      const child = spawnSync('bash', ['-lc', gate.command], { cwd, encoding: 'utf8', timeout: gate.timeout_seconds * 1000 });
      exitCode = child.status ?? 1;
      timedOut = child.error?.code === 'ETIMEDOUT';
      output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
    }
    writeFileSync(logPath, output, { mode: 0o600 });
    const result = { id: gate.id, command: gate.command, cwd: gate.working_directory, sha, started_at: startedAt, finished_at: new Date().toISOString(), exit_code: exitCode, timed_out: timedOut, log_path: logPath, dry_run: dryRun };
    results.push(result);
    if (exitCode !== 0) break;
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const dryRun = process.argv.includes('--dry-run');
  const outputDirectory = process.env.AIRTRUST_RELEASE_EVIDENCE_DIR ?? join(root, 'artifacts', 'governed-release-gates');
  const config = JSON.parse(readFileSync(join(root, 'scripts/staging/governed-release-gates.json'), 'utf8'));
  const results = runGates({ gates: config.gates, root, outputDirectory, dryRun, sha: process.env.AIRTRUST_RELEASE_SHA ?? '' });
  const resultPath = join(outputDirectory, 'gate-results.json');
  writeFileSync(resultPath, `${JSON.stringify({ schema: 'airtrust.governed-release-gate-results/v1', results }, null, 2)}\n`, { mode: 0o600 });
  if (results.some((result) => result.exit_code !== 0)) process.exitCode = 1;
  process.stdout.write(`${resultPath}\n`);
}
