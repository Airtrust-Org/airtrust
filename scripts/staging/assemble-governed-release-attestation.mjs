import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STAGING_IDENTITY } from './governed-release-contract.mjs';
import { buildStagingReleaseAttestation } from './build-staging-release-attestation.mjs';

const SHA = /^[0-9a-f]{40}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const migrations = [
  '0461_refresh_tokens_empresa_id.sql',
  '0462_qualificacoes_tipos_codigo_tenant_active_unique.sql',
];

function fail(message) { throw new Error(`ATTESTATION_ASSEMBLY_FAILED:${message}`); }
function file(path) {
  try { return readFileSync(path, 'utf8'); } catch { fail(`MISSING_ARTIFACT:${path}`); }
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function capture(text, expression, label) {
  const value = text.match(expression)?.[1]?.trim();
  if (!value) fail(`MISSING_EVIDENCE:${label}`);
  return value;
}
function requireHash(value, label) { if (!HASH.test(value)) fail(`INVALID_HASH:${label}`); return value.toLowerCase(); }
function requireSha(value, label) { if (!SHA.test(value)) fail(`INVALID_SHA:${label}`); return value.toLowerCase(); }

function parseMigration(text, expectedName) {
  if (!text.includes(`MIGRATION=${expectedName}`)) fail(`MIGRATION_NAME:${expectedName}`);
  if (!text.includes('SPECIALIZED_PREFLIGHT_OK=true')) fail(`MIGRATION_PREFLIGHT:${expectedName}`);
  const applied = text.includes(`MIGRATION_APPLIED_AND_VALIDATED=${expectedName}`);
  const previouslyValidated = text.includes(`MIGRATION_ALREADY_APPLIED_AND_VALIDATED=${expectedName}`);
  if (!applied && !previouslyValidated) fail(`MIGRATION_POSTCONDITIONS:${expectedName}`);
  if (!previouslyValidated && !text.includes(`LEDGER_ENTRY_CONFIRMED=${expectedName}`)) fail(`MIGRATION_LEDGER:${expectedName}`);
  return {
    name: expectedName,
    ledger: true,
    postconditions: true,
    sql_sha256: requireHash(capture(text, /SQL_SHA256=([0-9a-f]{64})/i, 'migration SQL hash'), expectedName),
    recovery_point: capture(text, /RECOVERY_TIMESTAMP_UTC=([^\n\r]+)/, 'migration recovery point'),
    evidence_sha256: hash(text),
  };
}

export function assembleGovernedReleaseAttestation({ root = process.cwd(), evidenceDirectory, outputPath, releaseSha, environment = process.env }) {
  const evidence = resolve(root, evidenceDirectory);
  const exactSha = requireSha(releaseSha, 'release_sha');
  const contract = JSON.parse(file(join(evidence, 'governed-release-contract.json')));
  if (contract.releaseSha !== exactSha || contract.environment !== 'staging') fail('CONTRACT_MISMATCH');
  const gateDocument = JSON.parse(file(join(evidence, 'gate-results.json')));
  const gateResults = gateDocument.results;
  if (!Array.isArray(gateResults) || gateResults.some((gate) => gate.sha !== exactSha)) fail('GATE_SHA_MISMATCH');
  const backup = file(join(evidence, 'backup-evidence.txt'));
  if (!backup.includes('BACKUP_OK') || !backup.includes(STAGING_IDENTITY.d1Name)) fail('BACKUP_NOT_PROVEN');
  const backupHash = requireHash(capture(backup, /sha256:\s*([0-9a-f]{64})/i, 'backup hash'), 'backup');
  const migrationResults = migrations.map((name) => parseMigration(file(join(evidence, `migration-${name.slice(0, 4)}-evidence.txt`)), name));
  const worker = file(join(evidence, 'worker-release-evidence.txt'));
  if (!worker.includes(`HEAD: ${exactSha}`) || !worker.includes(STAGING_IDENTITY.worker)) fail('WORKER_IDENTITY_OR_SHA');
  const bundleHash = requireHash(capture(worker, /Worker bundle SHA-256:\s*([0-9a-f]{64})/i, 'worker bundle hash'), 'worker bundle');
  const configHash = requireHash(capture(worker, /Wrangler config SHA-256:\s*([0-9a-f]{64})/i, 'worker config hash'), 'worker config');
  const manifestHash = requireHash(capture(worker, /Release manifest SHA-256:\s*([0-9a-f]{64})/i, 'worker manifest hash'), 'worker manifest');
  const pages = file(join(evidence, 'pages-release-evidence.txt'));
  if (!pages.includes(exactSha) || !pages.includes('staging')) fail('PAGES_IDENTITY_OR_SHA');
  const smoke = file(join(evidence, 'staging-smoke-evidence.txt'));
  if (!/\b(200|health|smoke)\b/i.test(smoke)) fail('SMOKE_NOT_PROVEN');
  const sourceTree = requireSha(execFileSync('git', ['rev-parse', `${exactSha}^{tree}`], { cwd: root, encoding: 'utf8' }).trim(), 'source_tree');
  const built = buildStagingReleaseAttestation({
    environment: 'staging', release_sha: exactSha, source_tree: sourceTree,
    gitlab_project: environment.CI_PROJECT_PATH ?? 'airtrust-group/airtrust', pipeline_id: environment.CI_PIPELINE_ID ?? 'local-test',
    actor: environment.GITLAB_USER_LOGIN ?? 'protected-runner', runner: environment.CI_RUNNER_DESCRIPTION ?? 'airtrust-staging-release',
    runtime: { node: process.version, platform: process.platform }, gate_results: gateResults, migration_results: migrationResults,
    backup: `sha256:${backupHash}`, recovery_points: migrationResults.map((item) => item.recovery_point).join(','),
    d1: STAGING_IDENTITY.d1Id, r2: STAGING_IDENTITY.r2, worker: STAGING_IDENTITY.worker, pages: STAGING_IDENTITY.pagesUrl,
    bundle_hashes: { worker: bundleHash }, config_hashes: { worker: configHash }, manifest_hashes: { release: manifestHash },
    health: `sha256:${hash(smoke)}`, version: exactSha, qa: `sha256:${hash(pages)}`, rollback_target: `pre-release recovery points ${migrationResults.map((item) => item.recovery_point).join(',')}`,
    timestamps: new Date().toISOString(), signing: 'ATTESTATION_UNSIGNED_BUT_HASHED',
  });
  mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
  writeFileSync(outputPath, built.serialized, { mode: 0o600 });
  writeFileSync(`${outputPath}.sha256`, `${built.sha256}  ${outputPath.split('/').at(-1)}\n`, { mode: 0o600 });
  return built;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [evidenceDirectory, outputPath, releaseSha] = process.argv.slice(2);
  if (!evidenceDirectory || !outputPath || !releaseSha) fail('USAGE evidence-directory output-path release-sha');
  const built = assembleGovernedReleaseAttestation({ evidenceDirectory, outputPath, releaseSha });
  process.stdout.write(`STAGING_RELEASE_ATTESTATION_SHA256=${built.sha256}\n`);
}
