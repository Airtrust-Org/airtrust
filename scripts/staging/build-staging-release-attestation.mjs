import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const SHA = /^[0-9a-f]{40}$/i;
const HEX64 = /^[0-9a-f]{64}$/i;
const PLACEHOLDER = /^(|todo|unknown|unavailable|latest|null|undefined)$/i;
export const SCHEMA = 'airtrust.staging-release-attestation/v1';

function requiredString(object, key) {
  const value = object?.[key];
  if (typeof value !== 'string' || PLACEHOLDER.test(value.trim())) throw new Error(`ATTESTATION_REQUIRED:${key}`);
  return value;
}
function requireSha(value, key) { if (!SHA.test(requiredString({ value }, 'value'))) throw new Error(`ATTESTATION_SHA:${key}`); return value; }
function requireHash(value, key) { if (!HEX64.test(requiredString({ value }, 'value'))) throw new Error(`ATTESTATION_HASH:${key}`); return value; }

export function buildStagingReleaseAttestation(input) {
  if (input.environment !== 'staging') throw new Error('ATTESTATION_ENVIRONMENT');
  const releaseSha = requireSha(input.release_sha, 'release_sha');
  const sourceTree = requireSha(input.source_tree, 'source_tree');
  if (releaseSha === sourceTree) throw new Error('ATTESTATION_TREE_EQUALS_COMMIT');
  const gates = input.gate_results;
  if (!Array.isArray(gates) || gates.length === 0 || gates.some((gate) => gate.exit_code !== 0 || gate.dry_run === true)) throw new Error('ATTESTATION_GATES_NOT_PROVEN');
  const migrations = input.migration_results;
  const names = migrations?.map((migration) => migration.name) ?? [];
  if (names.join(',') !== '0461_refresh_tokens_empresa_id.sql,0462_qualificacoes_tipos_codigo_tenant_active_unique.sql') throw new Error('ATTESTATION_MIGRATION_ORDER');
  if (migrations.some((migration) => migration.ledger !== true || migration.postconditions !== true)) throw new Error('ATTESTATION_MIGRATION_EVIDENCE');
  const required = ['gitlab_project', 'pipeline_id', 'actor', 'runner', 'backup', 'recovery_points', 'd1', 'r2', 'worker', 'pages', 'health', 'version', 'qa', 'rollback_target', 'timestamps'];
  for (const key of required) requiredString(input, key);
  const bundleHashes = input.bundle_hashes ?? {};
  const configHashes = input.config_hashes ?? {};
  const manifestHashes = input.manifest_hashes ?? {};
  requireHash(bundleHashes.worker, 'bundle_hashes.worker');
  requireHash(configHashes.worker, 'config_hashes.worker');
  requireHash(manifestHashes.release, 'manifest_hashes.release');
  const attestation = {
    schema_version: SCHEMA,
    classification: 'pipeline-attested',
    environment: 'staging',
    release_sha: releaseSha.toLowerCase(),
    source_tree: sourceTree.toLowerCase(),
    gitlab_project: requiredString(input, 'gitlab_project'),
    pipeline_id: requiredString(input, 'pipeline_id'),
    actor: requiredString(input, 'actor'),
    runner: requiredString(input, 'runner'),
    runtime: input.runtime ?? {},
    gate_results: gates,
    migration_results: migrations,
    backup: requiredString(input, 'backup'),
    recovery_points: requiredString(input, 'recovery_points'),
    d1: requiredString(input, 'd1'), r2: requiredString(input, 'r2'),
    worker: requiredString(input, 'worker'), pages: requiredString(input, 'pages'),
    bundle_hashes: bundleHashes, config_hashes: configHashes, manifest_hashes: manifestHashes,
    health: requiredString(input, 'health'), version: requiredString(input, 'version'),
    qa: requiredString(input, 'qa'), rollback_target: requiredString(input, 'rollback_target'),
    timestamps: requiredString(input, 'timestamps'), signing: input.signing ?? 'ATTESTATION_UNSIGNED_BUT_HASHED',
  };
  const serialized = `${JSON.stringify(attestation, null, 2)}\n`;
  return { attestation, serialized, sha256: createHash('sha256').update(serialized).digest('hex') };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error('usage: build-staging-release-attestation input.json output.json');
  const built = buildStagingReleaseAttestation(JSON.parse(readFileSync(inputPath, 'utf8')));
  writeFileSync(outputPath, built.serialized, { mode: 0o600 });
  writeFileSync(`${outputPath}.sha256`, `${built.sha256}  ${outputPath.split('/').at(-1)}\n`, { mode: 0o600 });
  process.stdout.write(`STAGING_RELEASE_ATTESTATION_SHA256=${built.sha256}\n`);
}
