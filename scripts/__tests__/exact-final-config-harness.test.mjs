import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildReleaseAttestation,
  outcomeFlags,
} from '../lib/build-release-attestation.mjs';

const ROOT = process.cwd();
const WORKER = join(ROOT, 'worker-airtrust');
const WORKFLOW = join(ROOT, '.github/workflows/deploy-airtrust.yml');
const PROD_D1_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const PROD_D1_NAME = 'airtrust-db';
const PROD_R2_NAME = 'airtrust-storage';

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function extractSection(source, header) {
  const start = source.indexOf(header);
  assert.ok(start >= 0, `missing section ${header}`);
  const rest = source.slice(start + header.length);
  const next = rest.search(/\n\[/);
  return source.slice(start, next < 0 ? source.length : start + header.length + next);
}

/** Full staging env block through the character before [env.production]. */
function extractStagingBlock(source) {
  const start = source.indexOf('[env.staging]');
  const end = source.indexOf('[env.production]');
  assert.ok(start >= 0 && end > start, 'staging/production section bounds missing');
  return source.slice(start, end);
}

test('exact final config harness: hashes, bindings, second dry-run, attestation, workflow evidence', (t) => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'airtrust-exact-final-'));
  // Config must live under worker-airtrust so wrangler resolves src/index.ts.
  const outConfig = join(WORKER, `.tmp-wrangler.production.harness-${process.pid}.toml`);
  const outManifest = join(tmpDir, 'manifest.json');
  const outAttestation = join(tmpDir, 'attestation.json');
  const secondDryRunDir = mkdtempSync(join(WORKER, '.tmp-worker-bundle-harness-'));

  try {
    const baselineToml = readFileSync(join(WORKER, 'wrangler.toml'), 'utf8');
    const baselineStagingBlock = extractStagingBlock(baselineToml);
    const baselineStagingVars = extractSection(baselineToml, '[env.staging.vars]');

    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const headTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: ROOT, encoding: 'utf8' }).trim();
    assert.notEqual(headSha, headTree, 'fixture requires distinct commit and tree SHAs');

    const shortSha = headSha.slice(0, 7);
    const appVersion = `2026-07-18T00:00:00Z-${shortSha}`;
    const buildTime = '2026-07-18T00:00:00Z';

    const script = `
      set -euo pipefail
      source "${join(ROOT, 'scripts/lib/worker-provenance.sh')}"
      airtrust_generate_worker_provenance \\
        "${ROOT}" "${WORKER}" "${join(WORKER, 'wrangler.toml')}" "${outConfig}" \\
        "${appVersion}" "${buildTime}" "${outManifest}"
      printf '%s\\n' "$PROV_SOURCE_SHA" > "${join(tmpDir, 'source_sha')}"
      printf '%s\\n' "$PROV_SOURCE_TREE" > "${join(tmpDir, 'source_tree')}"
      printf '%s\\n' "$PROV_WORKER_BUNDLE_SHA256" > "${join(tmpDir, 'bundle_sha')}"
      printf '%s\\n' "$PROV_WRANGLER_CONFIG_PRE_MANIFEST_SHA256" > "${join(tmpDir, 'pre_sha')}"
      printf '%s\\n' "$PROV_RELEASE_MANIFEST_SHA256" > "${join(tmpDir, 'manifest_sha')}"
      printf '%s\\n' "$PROV_WRANGLER_CONFIG_FINAL_SHA256" > "${join(tmpDir, 'final_sha')}"
      printf '%s\\n' "$PROV_BUNDLE_DIR" > "${join(tmpDir, 'bundle_dir')}"
    `;
    execSync(script, { shell: '/bin/bash', stdio: 'pipe' });

    const sourceSha = readFileSync(join(tmpDir, 'source_sha'), 'utf8').trim();
    const sourceTree = readFileSync(join(tmpDir, 'source_tree'), 'utf8').trim();
    const preSha = readFileSync(join(tmpDir, 'pre_sha'), 'utf8').trim();
    const finalShaRecorded = readFileSync(join(tmpDir, 'final_sha'), 'utf8').trim();
    const manifestShaRecorded = readFileSync(join(tmpDir, 'manifest_sha'), 'utf8').trim();
    const bundleDir = readFileSync(join(tmpDir, 'bundle_dir'), 'utf8').trim();

    assert.equal(sourceSha, headSha);
    assert.equal(sourceTree, headTree);
    assert.notEqual(sourceTree, sourceSha);

    const finalConfigBytes = readFileSync(outConfig);
    const configFinalSha256 = createHash('sha256').update(finalConfigBytes).digest('hex');
    assert.equal(configFinalSha256, finalShaRecorded, 'configFinalSha256 must match exact final file bytes');
    assert.notEqual(configFinalSha256, preSha, 'pre-manifest and final config hashes must differ');

    const finalConfig = finalConfigBytes.toString('utf8');
    assert.match(finalConfig, /\[\[env\.production\.d1_databases\]\]/);
    assert.match(finalConfig, /binding = "DB"/);
    assert.match(finalConfig, new RegExp(`database_name = "${PROD_D1_NAME}"`));
    assert.match(finalConfig, new RegExp(`database_id = "${PROD_D1_ID}"`));
    assert.match(finalConfig, /\[\[env\.production\.r2_buckets\]\]/);
    assert.match(finalConfig, /binding = "BUCKET"/);
    assert.match(finalConfig, new RegExp(`bucket_name = "${PROD_R2_NAME}"`));
    assert.match(finalConfig, new RegExp(`AIRTRUST_SOURCE_TREE = "${headTree}"`));
    assert.match(finalConfig, /AIRTRUST_RELEASE_MANIFEST_SHA256 = "/);

    // Staging block must remain byte-identical to the baseline after production stamping.
    assert.equal(extractStagingBlock(finalConfig), baselineStagingBlock);
    assert.equal(extractSection(finalConfig, '[env.staging.vars]'), baselineStagingVars);

    const manifestStr = readFileSync(outManifest, 'utf8');
    const manifest = JSON.parse(manifestStr);
    assert.equal(createHash('sha256').update(manifestStr).digest('hex'), manifestShaRecorded);
    assert.equal(manifest.workerVersionId, null);
    assert.equal(manifest.sourceTree, headTree);
    assert.notEqual(manifest.sourceTree, manifest.sourceSha);
    assert.doesNotMatch(manifestStr, /unavailable-in-dry-run/);
    assert.equal(manifest.wranglerConfigPreManifestSha256, preSha);
    assert.ok(!('wranglerConfigFinalSha256' in manifest), 'final config hash belongs in attestation, not manifest');

    // Second dry-run must consume exactly the final config file bytes.
    execFileSync(
      'npx',
      [
        '--no-install',
        'wrangler',
        'deploy',
        '--env',
        'production',
        '--config',
        outConfig,
        '--dry-run',
        '--outdir',
        secondDryRunDir,
      ],
      { cwd: WORKER, stdio: 'pipe' },
    );
    assert.equal(sha256File(outConfig), configFinalSha256, 'final config file must be unchanged by second dry-run');

    // Simulated smoke-failure attestation from real step outcomes.
    const smokeFail = outcomeFlags('failure');
    const deployOk = outcomeFlags('success');
    const bundleOk = outcomeFlags('success');
    const { attestation, attestationObject } = buildReleaseAttestation({
      repository: 'airtrustsystem-alt/airtrust',
      environment: 'production',
      appVersion,
      sourceSha: headSha,
      sourceTree: headTree,
      workerBundleSha256: readFileSync(join(tmpDir, 'bundle_sha'), 'utf8').trim(),
      wranglerConfigFinalSha256: configFinalSha256,
      releaseManifestSha256: manifestShaRecorded,
      workerVersionId: 'wv-after-real-deploy',
      deployAttempted: deployOk.executed,
      deploySucceeded: deployOk.passed,
      bundleComparisonExecuted: bundleOk.executed,
      bundleComparisonPassed: bundleOk.passed,
      smokeExecuted: smokeFail.executed,
      smokePassed: smokeFail.passed,
      timestampUtc: '2026-07-18T12:00:00.000Z',
    });
    writeFileSync(outAttestation, attestation);
    assert.equal(attestationObject.smokePassed, false);
    assert.equal(attestationObject.smokeExecuted, true);
    assert.equal(attestationObject.sourceTree, headTree);
    assert.notEqual(attestationObject.sourceTree, attestationObject.sourceSha);
    assert.equal(attestationObject.releaseManifestSha256, manifestShaRecorded);
    assert.equal(attestationObject.wranglerConfigFinalSha256, configFinalSha256);
    assert.equal(attestationObject.classification, 'pipeline-attested');

    // Workflow structural evidence contracts.
    const workflow = readFileSync(WORKFLOW, 'utf8');
    assert.match(workflow, /Upload release manifest \(pre-deploy\)/);
    assert.match(workflow, /name: Upload release attestation[\s\S]*if:\s*\$\{\{\s*always\(\)/);
    assert.match(workflow, /name: Create release attestation[\s\S]*if:\s*\$\{\{\s*always\(\)/);
    assert.doesNotMatch(workflow, /SOURCE_TREE:\s*\$\{\{\s*github\.sha\s*\}\}/);
    assert.match(workflow, /git rev-parse 'HEAD\^\{tree\}'/);
    assert.match(workflow, /workerVersionId:\s*null/);
    assert.doesNotMatch(workflow, /workerVersionId:\s*"unavailable-in-dry-run"/);
    assert.match(workflow, /airtrust-production-release-manifest\.json/);
    assert.match(workflow, /airtrust-production-release-attestation\.json/);
    assert.match(workflow, /deployAttempted/);
    assert.match(workflow, /smokePassed/);
    assert.match(workflow, /outcomeFlags/);

    // Expected artifact path names in the workflow.
    assert.match(workflow, /name:\s*airtrust-production-release-manifest/);
    assert.match(workflow, /name:\s*airtrust-production-release-attestation/);

    // Cleanup provenance bundle dir created by the bash helper.
    if (bundleDir && existsSync(bundleDir)) {
      rmSync(bundleDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(outConfig, { force: true });
    rmSync(secondDryRunDir, { recursive: true, force: true });
  }
});
