#!/usr/bin/env node
/**
 * Guard: enforces the canonical Cloudflare/AirTrust secret contract across
 * every GitHub Actions workflow (see docs/ops/CLOUDFLARE_CREDENTIAL_CONTRACT.md).
 * Fails the build if any workflow regresses to the legacy pattern that kept
 * causing repeated, unnecessary Cloudflare token creation requests.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkWorkflowContent } from './cloudflare-secret-contract-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOWS_DIR = join(ROOT, '.github/workflows');

function loadWorkflowFiles() {
  return readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => ({
      fileName: `.github/workflows/${name}`,
      content: readFileSync(join(WORKFLOWS_DIR, name), 'utf8'),
    }));
}

export function runGuard() {
  const violations = [];
  for (const { fileName, content } of loadWorkflowFiles()) {
    violations.push(...checkWorkflowContent(fileName, content));
  }
  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = runGuard();
  if (violations.length > 0) {
    console.error('guard:cloudflare-secret-contract FAILED');
    for (const violation of violations) console.error(` - ${violation}`);
    process.exit(1);
  }
  console.log('OK: guard:cloudflare-secret-contract');
}
