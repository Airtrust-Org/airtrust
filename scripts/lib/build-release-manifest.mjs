import { createHash } from 'node:crypto';

/**
 * Deterministic release-manifest builder shared by the production Worker-only
 * deploy path (scripts/deploy-worker-only.sh, scripts/deploy-worker-safe.sh)
 * and, by intent, mirror-able by the CI workflow (.github/workflows/deploy-airtrust.yml).
 *
 * Why a dedicated module instead of a shell heredoc:
 *  - The manifest SHA-256 is only meaningful if the bytes hashed are exactly
 *    the bytes written to disk / logged. Building the JSON string once here and
 *    returning both the string and its hash removes any drift between "what was
 *    hashed" and "what was recorded".
 *  - It is pure and synchronous, so it is unit-testable with synthetic data and
 *    requires no Cloudflare credentials (see scripts/__tests__/build-release-manifest.test.mjs).
 *
 * HONESTY / EVIDENCE CLASSIFICATION (read before trusting these hashes):
 *  This manifest is "pipeline-attested". It attests to what the CI/deploy
 *  pipeline ITSELF built and hashed locally (the esbuild bundle produced by
 *  `wrangler deploy --dry-run --outdir <mktemp -d>` and the wrangler config it
 *  handed to `wrangler deploy`). It is NOT an independent re-hash of the content
 *  Cloudflare actually stored and serves — Cloudflare does not expose a
 *  publicly verifiable content hash of the deployed Worker in this setup. A
 *  matching hash here proves "this is the artifact the pipeline built", not
 *  "these are the exact bytes Cloudflare's edge is executing". See
 *  docs/ops/PRODUCTION_WORKER_PROVENANCE.md and
 *  docs/ops/STAGING_RUNTIME_FORENSICS_2026-07-18.md.
 */

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const STAMP = /^[A-Za-z0-9._:-]+$/;

/**
 * Canonical field order for the manifest. Kept explicit (not Object.keys order)
 * so the serialized bytes — and therefore the SHA-256 — are stable regardless
 * of the order the caller passes fields in.
 */
const FIELD_ORDER = [
  'schema',
  'repository',
  'environment',
  'appVersion',
  'sourceSha',
  'sourceTree',
  'workerBundleSha256',
  'wranglerConfigPreManifestSha256',
  'nodeVersion',
  'npmVersion',
  'wranglerVersion',
  'buildTimeUtc',
  'workerVersionId',
  'dirty',
];

const SCHEMA = 'airtrust.release-manifest/v1';

function requireString(fields, key) {
  const value = fields[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`missing or empty required field: ${key}`);
  }
  return value;
}

/**
 * Build the canonical manifest and its SHA-256.
 *
 * @param {object} fields
 * @returns {{ manifest: string, manifestSha256: string, manifestObject: object }}
 *   `manifest` is the exact string to write to disk / log; `manifestSha256` is
 *   sha256 over that exact string.
 */
export function buildReleaseManifest(fields) {
  const environment = requireString(fields, 'environment');
  if (!['staging', 'production'].includes(environment)) {
    throw new Error(`unsupported environment: ${environment}`);
  }

  const sourceSha = requireString(fields, 'sourceSha');
  const sourceTree = requireString(fields, 'sourceTree');
  if (!HEX40.test(sourceSha)) throw new Error(`sourceSha must be a 40-hex git sha, got: ${sourceSha}`);
  if (!HEX40.test(sourceTree)) throw new Error(`sourceTree must be a 40-hex git tree, got: ${sourceTree}`);

  const workerBundleSha256 = requireString(fields, 'workerBundleSha256');
  const wranglerConfigPreManifestSha256 = requireString(fields, 'wranglerConfigPreManifestSha256');
  if (!HEX64.test(workerBundleSha256)) throw new Error(`workerBundleSha256 must be 64-hex, got: ${workerBundleSha256}`);
  if (!HEX64.test(wranglerConfigPreManifestSha256)) throw new Error(`wranglerConfigPreManifestSha256 must be 64-hex, got: ${wranglerConfigPreManifestSha256}`);

  const appVersion = requireString(fields, 'appVersion');
  if (!STAMP.test(appVersion)) throw new Error(`unsafe appVersion stamp: ${appVersion}`);
  // APP_VERSION must be SHA-derived, never a floating tag. The deploy scripts
  // already build it as "<iso-utc>-<short-sha>"; reject the well-known floating
  // placeholders defensively so a bad export can never be baked into a manifest.
  for (const forbidden of ['latest', 'main', 'dev-local', 'managed-by-script', 'unversioned-remote']) {
    if (appVersion === forbidden) throw new Error(`appVersion must be SHA-derived, refusing floating value: ${appVersion}`);
  }
  if (!appVersion.includes(sourceSha.slice(0, 7))) {
    throw new Error(`appVersion "${appVersion}" does not embed source short sha "${sourceSha.slice(0, 7)}"`);
  }

  const buildTimeUtc = requireString(fields, 'buildTimeUtc');

  // workerVersionId is optional and MUST be null pre-deploy: `wrangler deploy
  // --dry-run` does NOT emit a Cloudflare Worker Version ID (verified against
  // wrangler 4.x in this repo), so this manifest (built from a dry-run) never
  // has a real one to record. A string sentinel like "unavailable-in-dry-run"
  // is deliberately rejected here — it reads like an identifier and invites
  // downstream code/humans to treat it as one. The real Worker Version ID is
  // only known after an actual `wrangler deploy` and belongs in the POST-deploy
  // attestation (.github/workflows/deploy-airtrust.yml "Create release
  // attestation" step), never in this pre-deploy manifest.
  if (fields.workerVersionId !== undefined && fields.workerVersionId !== null) {
    if (typeof fields.workerVersionId !== 'string' || fields.workerVersionId.length === 0) {
      throw new Error('workerVersionId must be a non-empty string, null, or omitted');
    }
    for (const forbidden of ['unavailable-in-dry-run', 'unavailable', 'unknown', 'n/a', 'none']) {
      if (fields.workerVersionId.toLowerCase() === forbidden) {
        throw new Error(`workerVersionId must be a real Worker Version ID or null/omitted, refusing placeholder: ${fields.workerVersionId}`);
      }
    }
  }
  const workerVersionId =
    typeof fields.workerVersionId === 'string' && fields.workerVersionId.length > 0
      ? fields.workerVersionId
      : null;

  const manifestObject = {
    schema: SCHEMA,
    repository: requireString(fields, 'repository'),
    environment,
    appVersion,
    sourceSha,
    sourceTree,
    workerBundleSha256,
    wranglerConfigPreManifestSha256,
    nodeVersion: requireString(fields, 'nodeVersion'),
    npmVersion: requireString(fields, 'npmVersion'),
    wranglerVersion: requireString(fields, 'wranglerVersion'),
    buildTimeUtc,
    workerVersionId,
    dirty: fields.dirty === true,
  };

  // Serialize in the explicit FIELD_ORDER, two-space indented, trailing newline.
  // Deterministic bytes in -> deterministic hash out.
  const ordered = {};
  for (const key of FIELD_ORDER) ordered[key] = manifestObject[key];
  const manifest = `${JSON.stringify(ordered, null, 2)}\n`;
  const manifestSha256 = createHash('sha256').update(manifest).digest('hex');

  return { manifest, manifestSha256, manifestObject: ordered };
}

// CLI: reads a JSON object of fields from argv[2] (or stdin if "-"), writes the
// manifest to the path in argv[3] (or stdout if omitted), and prints the
// manifest SHA-256 as the last line to stdout. Kept dependency-free so the
// deploy shell scripts can call it directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const inputArg = process.argv[2];
  if (!inputArg) throw new Error('usage: build-release-manifest.mjs <fields-json|-> [outputPath]');
  const raw = inputArg === '-' ? readFileSync(0, 'utf8') : inputArg;
  const { manifest, manifestSha256 } = buildReleaseManifest(JSON.parse(raw));
  const outputPath = process.argv[3];
  if (outputPath) {
    writeFileSync(outputPath, manifest);
  } else {
    process.stdout.write(manifest);
  }
  // Machine-readable last line for the shell caller to capture.
  process.stdout.write(`RELEASE_MANIFEST_SHA256=${manifestSha256}\n`);
}
