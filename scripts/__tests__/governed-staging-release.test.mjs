import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STAGING_IDENTITY, validateGovernedReleaseContract } from '../staging/governed-release-contract.mjs';
import { runGates } from '../staging/run-governed-release.mjs';
import { buildStagingReleaseAttestation } from '../staging/build-staging-release-attestation.mjs';
import { verifyStagingReleaseAttestation } from '../staging/verify-staging-release-attestation.mjs';
import { assembleGovernedReleaseAttestation } from '../staging/assemble-governed-release-attestation.mjs';
import { runGovernedReleaseHarness } from '../staging/governed-release-harness.mjs';

const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const hash = 'c'.repeat(64);
const contract = () => ({ releaseSha: sha, environment: 'staging', confirmation: 'AIRTRUST_STAGING', ciCommitSha: sha, ciCommitBranch: 'main', ciProjectPath: 'airtrust-group/airtrust', reachableFromMain: true, clean: true, identity: { ...STAGING_IDENTITY } });
const attestation = () => ({ environment: 'staging', release_sha: sha, source_tree: tree, gitlab_project: 'airtrust-group/airtrust', pipeline_id: '1', actor: 'maintainer', runner: 'airtrust-staging-release', runtime: { node: '24' }, gate_results: [{ id: 'lint', exit_code: 0, dry_run: false, timed_out: false, sha }], migration_results: [{ name: '0461_refresh_tokens_empresa_id.sql', ledger: true, postconditions: true }, { name: '0462_qualificacoes_tipos_codigo_tenant_active_unique.sql', ledger: true, postconditions: true }], backup: 'sha256:backup', recovery_points: '2026-08-19T00:00:00Z', d1: STAGING_IDENTITY.d1Id, r2: STAGING_IDENTITY.r2, worker: STAGING_IDENTITY.worker, pages: STAGING_IDENTITY.pagesUrl, bundle_hashes: { worker: hash }, config_hashes: { worker: hash }, manifest_hashes: { release: hash }, health: '200', version: 'verified', qa: 'pending-post-deploy', rollback_target: 'previous-coherent-release', timestamps: new Date().toISOString() });

test('contract accepts only exact governed staging identity', () => {
  assert.equal(validateGovernedReleaseContract(contract()).releaseSha, sha);
  for (const mutate of [(x) => (x.releaseSha = 'short'), (x) => (x.confirmation = 'no'), (x) => (x.environment = 'production'), (x) => (x.ciCommitSha = 'b'.repeat(40)), (x) => (x.ciCommitBranch = 'feature'), (x) => (x.ciProjectPath = 'other/project'), (x) => (x.clean = false), (x) => (x.reachableFromMain = false), (x) => (x.identity.d1Id = STAGING_IDENTITY.productionD1Id), (x) => (x.identity.worker = STAGING_IDENTITY.productionWorker), (x) => (x.identity.r2 = STAGING_IDENTITY.productionR2), (x) => (x.identity.pagesUrl = STAGING_IDENTITY.productionPagesUrl)]) {
    const input = contract(); mutate(input); assert.throws(() => validateGovernedReleaseContract(input));
  }
});

test('gate runner dry run records evidence without executing a command', () => {
  const output = mkdtempSync(join(tmpdir(), 'airtrust-gates-'));
  const results = runGates({ gates: [{ id: 'lint', command: 'exit 99', working_directory: '.', timeout_seconds: 1, required: true }], root: process.cwd(), outputDirectory: output, dryRun: true, sha });
  assert.equal(results[0].exit_code, 0);
  assert.match(readFileSync(results[0].log_path, 'utf8'), /DRY_RUN/);
});

test('gate runner fails closed on a failed gate and never accepts fake required fields', () => {
  const output = mkdtempSync(join(tmpdir(), 'airtrust-gates-'));
  const results = runGates({ gates: [{ id: 'broken', command: 'exit 7', working_directory: '.', timeout_seconds: 1, required: true }], root: process.cwd(), outputDirectory: output, sha });
  assert.equal(results[0].exit_code, 7);
  assert.throws(() => runGates({ gates: [{ id: 'fake', command: 'true', working_directory: '.', timeout_seconds: 1, required: false }], root: process.cwd(), outputDirectory: output, sha }));
  assert.throws(() => runGates({ gates: [{ id: 'escape', command: 'true', working_directory: '..', timeout_seconds: 1, required: true }], root: process.cwd(), outputDirectory: output, sha }));
  const timeout = runGates({ gates: [{ id: 'timeout', command: 'sleep 2', working_directory: '.', timeout_seconds: 1, required: true }], root: process.cwd(), outputDirectory: output, sha });
  assert.equal(timeout[0].exit_code, 1);
  assert.equal(timeout[0].timed_out, true);
});

test('attestation rejects incomplete evidence, wrong order and non-canonical hashes', () => {
  const built = buildStagingReleaseAttestation(attestation());
  assert.equal(verifyStagingReleaseAttestation(built.serialized, built.sha256), built.sha256);
  const failed = attestation(); failed.gate_results[0].exit_code = 1;
  assert.throws(() => buildStagingReleaseAttestation(failed), /GATES_NOT_PROVEN/);
  const reversed = attestation(); reversed.migration_results.reverse();
  assert.throws(() => buildStagingReleaseAttestation(reversed), /MIGRATION_ORDER/);
  assert.throws(() => verifyStagingReleaseAttestation(built.serialized, 'd'.repeat(64)), /HASH_MISMATCH/);
  for (const key of ['release_sha', 'source_tree', 'backup', 'd1', 'worker', 'pages', 'timestamps']) {
    const tampered = JSON.parse(built.serialized); tampered[key] = key === 'timestamps' ? '2099-01-01T00:00:00.000Z' : 'd'.repeat(key === 'backup' ? 64 : 40);
    assert.throws(() => verifyStagingReleaseAttestation(`${JSON.stringify(tampered, null, 2)}\n`, built.sha256));
  }
});

test('attestation assembler fails closed when a required deployment artifact is absent', () => {
  const root = mkdtempSync(join(tmpdir(), 'airtrust-attestation-root-'));
  const evidence = join(root, 'evidence');
  const output = join(root, 'attestation.json');
  writeFileSync(join(root, 'placeholder'), '');
  assert.throws(() => assembleGovernedReleaseAttestation({ root, evidenceDirectory: evidence, outputPath: output, releaseSha: sha }), /MISSING_ARTIFACT/);
});

test('attestation assembler accepts only a complete, ordered machine evidence bundle', () => {
  const root = process.cwd();
  const releaseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const evidence = mkdtempSync(join(tmpdir(), 'airtrust-attestation-evidence-'));
  const output = join(evidence, 'AIRTRUST_STAGING_RELEASE_ATTESTATION.json');
  const logHash = 'e'.repeat(64);
  writeFileSync(join(evidence, 'governed-release-contract.json'), JSON.stringify({ releaseSha, environment: 'staging' }));
  writeFileSync(join(evidence, 'gate-results.json'), JSON.stringify({ results: [{ id: 'lint', exit_code: 0, dry_run: false, sha: releaseSha }] }));
  writeFileSync(join(evidence, 'backup-evidence.txt'), `BACKUP_OK\n  database: ${STAGING_IDENTITY.d1Name}\n  sha256: ${logHash}\n`);
  for (const [number, name] of [['0461', '0461_refresh_tokens_empresa_id.sql'], ['0462', '0462_qualificacoes_tipos_codigo_tenant_active_unique.sql']]) {
    writeFileSync(join(evidence, `migration-${number}-evidence.txt`), `MIGRATION=${name}\nSQL_SHA256=${logHash}\nSPECIALIZED_PREFLIGHT_OK=true\nRECOVERY_TIMESTAMP_UTC=2026-08-19T00:00:00Z\nLEDGER_ENTRY_CONFIRMED=${name}\nMIGRATION_APPLIED_AND_VALIDATED=${name}\n`);
  }
  writeFileSync(join(evidence, 'worker-release-evidence.txt'), `HEAD: ${releaseSha}\n${STAGING_IDENTITY.worker}\nWorker bundle SHA-256: ${logHash}\nWrangler config SHA-256: ${logHash}\nRelease manifest SHA-256: ${logHash}\n`);
  writeFileSync(join(evidence, 'pages-release-evidence.txt'), `staging deploy ${releaseSha}`);
  writeFileSync(join(evidence, 'staging-smoke-evidence.txt'), 'health 200 smoke ok');
  const built = assembleGovernedReleaseAttestation({ root, evidenceDirectory: evidence, outputPath: output, releaseSha, environment: { CI_PROJECT_PATH: 'airtrust-group/airtrust', CI_PIPELINE_ID: '1', GITLAB_USER_LOGIN: 'maintainer', CI_RUNNER_DESCRIPTION: 'airtrust-staging-release' } });
  assert.equal(verifyStagingReleaseAttestation(readFileSync(output, 'utf8'), built.sha256), built.sha256);
});

test('migration and rollback harness fail closed before deploy and restore a coherent pair after deploy failure', async () => {
  const names = ['backup', 'preflight0461', 'apply0461', 'ledger0461', 'postconditions0461', 'authSmoke', 'preflight0462', 'apply0462', 'ledger0462', 'postconditions0462', 'qualificationSmoke', 'workerDeploy', 'pagesDeploy', 'postDeploySmoke'];
  const make = (failAt, rollback = () => {}) => Object.fromEntries([...names.map((name) => [name, async () => { if (name === failAt) throw new Error(name); }]), ['rollback', async value => rollback(value)]]);
  const backup = await runGovernedReleaseHarness(make('backup'));
  assert.deepEqual(backup.calls, ['backup']);
  const migration = await runGovernedReleaseHarness(make('apply0461'));
  assert.equal(migration.calls.includes('apply0462'), false);
  assert.equal(migration.calls.includes('workerDeploy'), false);
  let rollback;
  const pages = await runGovernedReleaseHarness(make('pagesDeploy', value => { rollback = value; }));
  assert.equal(pages.rolled_back, true);
  assert.deepEqual(rollback, { worker: true, pages: true, reason: 'pagesDeploy' });
  const smoke = await runGovernedReleaseHarness(make('postDeploySmoke', value => { rollback = value; }));
  assert.equal(smoke.rolled_back, true);
  assert.deepEqual(rollback, { worker: true, pages: true, reason: 'postDeploySmoke' });
});
