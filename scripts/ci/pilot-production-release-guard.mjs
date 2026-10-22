#!/usr/bin/env node
// Production Worker releases must retain the exact runtime physically accepted
// in staging. Only the later evidence JSON commit may differ from that SHA.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPilotProductionReleaseLineage } from './pilot-real-device-evidence.mjs';

export function verifyPilotProductionRelease({ evidence, releaseSha, changedPaths, stagedShaIsAncestor }) {
  return verifyPilotProductionReleaseLineage({ evidence, releaseSha, changedPaths, stagedShaIsAncestor });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--release-sha');
  const releaseSha = index >= 0 ? args[index + 1] : process.env.RELEASE_SHA;
  const evidencePath = 'docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json';
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(resolve(evidencePath), 'utf8'));
  } catch {
    console.error('PILOT_PRODUCTION_EVIDENCE_MISSING_OR_INVALID');
    process.exitCode = 1;
  }
  if (evidence) {
    const stagedSha = evidence.staging_release_sha;
    let stagedShaIsAncestor = false;
    let changedPaths = [];
    try {
      execFileSync('git', ['cat-file', '-e', `${stagedSha}^{commit}`], { stdio: 'ignore' });
      execFileSync('git', ['merge-base', '--is-ancestor', stagedSha, releaseSha], { stdio: 'ignore' });
      stagedShaIsAncestor = true;
      changedPaths = execFileSync('git', ['diff', '--name-only', stagedSha, releaseSha], { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
    } catch {
      // The exact release must contain the staged source and its evidence-only successor.
    }
    const result = verifyPilotProductionRelease({ evidence, releaseSha, changedPaths, stagedShaIsAncestor });
    if (!result.ok) {
      console.error('PILOT_PRODUCTION_RELEASE_DENIED: ' + result.errors.join(','));
      process.exitCode = 1;
    } else {
      console.log(`PILOT_PRODUCTION_RELEASE_PASS staged=${result.stagedSha} production=${releaseSha}`);
    }
  }
}
