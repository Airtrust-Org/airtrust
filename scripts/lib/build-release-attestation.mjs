import { createHash } from 'node:crypto';

/**
 * Deterministic post-deploy (or post-attempt) release attestation builder.
 *
 * The pre-deploy release manifest never carries a real Worker Version ID and
 * never claims smoke/deploy outcomes. This attestation is the post-pipeline
 * evidence record: it must be creatable even when deploy/smoke failed, and
 * every boolean must come from real step outcomes (never hardcoded true).
 *
 * HONESTY: classification is always "pipeline-attested" — this attests to what
 * the CI pipeline observed locally, not to an independent Cloudflare content
 * hash of the served Worker.
 */

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;

const FIELD_ORDER = [
  'schema',
  'classification',
  'repository',
  'environment',
  'appVersion',
  'sourceSha',
  'sourceTree',
  'workerBundleSha256',
  'wranglerConfigFinalSha256',
  'releaseManifestSha256',
  'workerVersionId',
  'deployAttempted',
  'deploySucceeded',
  'bundleComparisonExecuted',
  'bundleComparisonPassed',
  'smokeExecuted',
  'smokePassed',
  'timestampUtc',
];

const SCHEMA = 'airtrust.release-attestation/v1';

function requireString(fields, key) {
  const value = fields[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`missing or empty required field: ${key}`);
  }
  return value;
}

function requireBoolean(fields, key) {
  const value = fields[key];
  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be a boolean derived from real step outcomes`);
  }
  return value;
}

/**
 * Map a GitHub Actions step outcome to attempt/success booleans.
 * Outcomes: success | failure | cancelled | skipped | '' (missing).
 */
export function outcomeFlags(outcome) {
  const normalized = typeof outcome === 'string' ? outcome : '';
  return {
    executed: normalized === 'success' || normalized === 'failure' || normalized === 'cancelled',
    passed: normalized === 'success',
  };
}

/**
 * @param {object} fields
 * @returns {{ attestation: string, attestationSha256: string, attestationObject: object }}
 */
export function buildReleaseAttestation(fields) {
  const sourceSha = requireString(fields, 'sourceSha');
  const sourceTree = requireString(fields, 'sourceTree');
  if (!HEX40.test(sourceSha)) throw new Error(`sourceSha must be a 40-hex git sha, got: ${sourceSha}`);
  if (!HEX40.test(sourceTree)) throw new Error(`sourceTree must be a 40-hex git tree, got: ${sourceTree}`);

  // Guard against the historical bug that wrote github.sha into sourceTree.
  // Commit and tree SHAs are different objects; equality is vanishingly rare
  // and always treated as a wiring mistake in this pipeline.
  if (sourceSha === sourceTree) {
    throw new Error(
      'sourceTree must be git rev-parse HEAD^{tree}, not the commit SHA (sourceSha === sourceTree)',
    );
  }

  const workerBundleSha256 = requireString(fields, 'workerBundleSha256');
  const wranglerConfigFinalSha256 = requireString(fields, 'wranglerConfigFinalSha256');
  const releaseManifestSha256 = requireString(fields, 'releaseManifestSha256');
  for (const [key, value] of [
    ['workerBundleSha256', workerBundleSha256],
    ['wranglerConfigFinalSha256', wranglerConfigFinalSha256],
    ['releaseManifestSha256', releaseManifestSha256],
  ]) {
    if (!HEX64.test(value)) throw new Error(`${key} must be 64-hex`);
  }

  const deployAttempted = requireBoolean(fields, 'deployAttempted');
  const deploySucceeded = requireBoolean(fields, 'deploySucceeded');
  const bundleComparisonExecuted = requireBoolean(fields, 'bundleComparisonExecuted');
  const bundleComparisonPassed = requireBoolean(fields, 'bundleComparisonPassed');
  const smokeExecuted = requireBoolean(fields, 'smokeExecuted');
  const smokePassed = requireBoolean(fields, 'smokePassed');

  if (deploySucceeded && !deployAttempted) {
    throw new Error('deploySucceeded=true requires deployAttempted=true');
  }
  if (bundleComparisonPassed && !bundleComparisonExecuted) {
    throw new Error('bundleComparisonPassed=true requires bundleComparisonExecuted=true');
  }
  if (smokePassed && !smokeExecuted) {
    throw new Error('smokePassed=true requires smokeExecuted=true');
  }

  let workerVersionId = null;
  if (fields.workerVersionId !== undefined && fields.workerVersionId !== null) {
    if (typeof fields.workerVersionId !== 'string' || fields.workerVersionId.length === 0) {
      throw new Error('workerVersionId must be a non-empty string, null, or omitted');
    }
    for (const forbidden of ['unavailable-in-dry-run', 'unavailable', 'unknown', 'n/a', 'none']) {
      if (fields.workerVersionId.toLowerCase() === forbidden) {
        throw new Error(`workerVersionId refusing placeholder: ${fields.workerVersionId}`);
      }
    }
    workerVersionId = fields.workerVersionId;
  }

  const attestationObject = {
    schema: SCHEMA,
    classification: 'pipeline-attested',
    repository: requireString(fields, 'repository'),
    environment: requireString(fields, 'environment'),
    appVersion: requireString(fields, 'appVersion'),
    sourceSha,
    sourceTree,
    workerBundleSha256,
    wranglerConfigFinalSha256,
    releaseManifestSha256,
    workerVersionId,
    deployAttempted,
    deploySucceeded,
    bundleComparisonExecuted,
    bundleComparisonPassed,
    smokeExecuted,
    smokePassed,
    timestampUtc: requireString(fields, 'timestampUtc'),
  };

  const ordered = {};
  for (const key of FIELD_ORDER) ordered[key] = attestationObject[key];
  const attestation = `${JSON.stringify(ordered, null, 2)}\n`;
  const attestationSha256 = createHash('sha256').update(attestation).digest('hex');

  return { attestation, attestationSha256, attestationObject: ordered };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { writeFileSync } = await import('node:fs');
  const inputArg = process.argv[2];
  if (!inputArg) throw new Error('usage: build-release-attestation.mjs <fields-json|-> [outputPath]');
  const { readFileSync } = await import('node:fs');
  const raw = inputArg === '-' ? readFileSync(0, 'utf8') : inputArg;
  const { attestation, attestationSha256 } = buildReleaseAttestation(JSON.parse(raw));
  const outputPath = process.argv[3];
  if (outputPath) {
    writeFileSync(outputPath, attestation);
  } else {
    process.stdout.write(attestation);
  }
  process.stdout.write(`RELEASE_ATTESTATION_SHA256=${attestationSha256}\n`);
}
