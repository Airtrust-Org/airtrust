#!/usr/bin/env node
// Production Pilot releases require real 6x15 hardware acceptance. Independent
// releases are not blocked if the Pilot code and its shared critical surfaces
// are unchanged since the currently deployed production source.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPilotProductionReleaseLineage } from './pilot-real-device-evidence.mjs';

const SHA = /^[0-9a-f]{40}$/;
const PRODUCTION_VERSION_URL = 'https://api.airtrust.online/api/version';

export function verifyPilotProductionRelease(input) {
  return verifyPilotProductionReleaseLineage(input);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', timeout: 30000 }).trim();
}

function changedPathsBetween(base, head) {
  if (!SHA.test(base) || !SHA.test(head))
    throw Error('PILOT_PRODUCTION_COMMIT_SHA_INVALID');
  git(['cat-file', '-e', base + '^{commit}']);
  git(['cat-file', '-e', head + '^{commit}']);
  git(['merge-base', '--is-ancestor', base, head]);
  return git(['diff', '--no-renames', '--name-only', base, head, '--']).split('\n').filter(Boolean);
}

async function currentProductionSourceSha() {
  const response = await fetch(PRODUCTION_VERSION_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error('PILOT_PRODUCTION_SOURCE_LOOKUP_DENIED');
  const body = await response.json();
  const sha = body?.data?.sourceSha;
  if (body?.success !== true || body?.data?.environment !== 'production' ||
      !SHA.test(String(sha ?? '')))
    throw Error('PILOT_PRODUCTION_SOURCE_UNVERIFIED');
  return sha;
}

async function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--release-sha');
  const releaseSha = index >= 0 ? args[index + 1] : process.env.RELEASE_SHA;
  if (!SHA.test(String(releaseSha ?? '')))
    throw Error('PILOT_PRODUCTION_RELEASE_SHA_INVALID');
  if (git(['rev-parse', 'HEAD']) !== releaseSha)
    throw Error('PILOT_PRODUCTION_RELEASE_CHECKOUT_MISMATCH');

  // Source is read from the live official Worker endpoint, never from a user
  // workflow input, reason or label. A missing/invalid ancestor fails closed.
  const productionSha = await currentProductionSourceSha();
  const productionChangedPaths = changedPathsBetween(productionSha, releaseSha);
  const evidencePath = 'docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json';
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(resolve(evidencePath), 'utf8'));
  } catch {
    // Unrelated releases need not claim a new physical Pilot acceptance.
    evidence = null;
  }

  const stagedSha = evidence?.staging_release_sha;
  let stagedShaIsAncestor = false;
  let changedPaths = [];
  if (SHA.test(String(stagedSha ?? ''))) {
    try {
      changedPaths = changedPathsBetween(stagedSha, releaseSha);
      stagedShaIsAncestor = true;
    } catch {
      // A changed Pilot runtime always fails without a valid staged ancestor.
    }
  }
  const result = verifyPilotProductionRelease({
    evidence, releaseSha, changedPaths, stagedShaIsAncestor,
    productionChangedPaths,
  });
  if (!result.ok) throw Error('PILOT_PRODUCTION_RELEASE_DENIED: ' + result.errors.join(','));
  console.log(result.requiresPhysicalAcceptance
    ? 'PILOT_PRODUCTION_RELEASE_PASS staged=' + result.stagedSha + ' production=' + releaseSha
    : 'PILOT_PRODUCTION_UNCHANGED_PASS productionSource=' + productionSha + ' release=' + releaseSha);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error.message || 'PILOT_PRODUCTION_GUARD_FAILED');
    process.exitCode = 1;
  });
}
