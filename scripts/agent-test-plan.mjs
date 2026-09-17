#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const run = args.has('--run');
const baseArg = process.argv.slice(2).find((arg) => arg.startsWith('--base='));
const base = baseArg ? baseArg.slice('--base='.length) : 'origin/main';

function sh(cmd, cmdArgs = []) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

try {
  sh('git', ['rev-parse', '--show-toplevel']);
} catch {
  console.error('ERROR: execute inside the AirTrust git repository.');
  process.exit(2);
}

try {
  sh('git', ['rev-parse', '--verify', base]);
} catch {
  console.error(`ERROR: base ref ${base} not found. Run: git fetch origin main --prune`);
  process.exit(2);
}

const raw = sh('git', ['diff', '--name-only', `${base}...HEAD`]);
const files = raw ? raw.split('\n').filter(Boolean) : [];

console.log(`AirTrust test plan | base=${base} | changed=${files.length}`);

if (!files.length) {
  console.log('No committed delta against base. No test plan generated.');
  process.exit(0);
}

const plan = [];
const add = (label, command) => {
  if (!plan.some((item) => item.command === command)) plan.push({ label, command });
};

const docsOnly = files.every((f) =>
  f.endsWith('.md') ||
  f.startsWith('docs/') ||
  f.startsWith('obsidian-vault/')
);

const scriptTests = files.filter((f) => /^scripts\/.*\.(test|spec)\.mjs$/.test(f));
const frontendTests = files.filter((f) => /^src\/.*\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
const workerTests = files.filter((f) => /^worker-airtrust\/.*\.(test|spec)\.[cm]?[jt]s$/.test(f));

if (scriptTests.length) {
  add('changed Node tests', `node --test ${scriptTests.map((f) => JSON.stringify(f)).join(' ')}`);
}
if (frontendTests.length) {
  add('changed frontend tests', `npx vitest run ${frontendTests.map((f) => JSON.stringify(f)).join(' ')}`);
}
if (workerTests.length) {
  const rel = workerTests.map((f) => f.replace(/^worker-airtrust\//, ''));
  add('changed worker tests', `cd worker-airtrust && npx vitest run ${rel.map((f) => JSON.stringify(f)).join(' ')}`);
}

const frontendChanged = files.some((f) => f.startsWith('src/') || f === 'vite.config.ts' || /^tsconfig.*\.json$/.test(f));
const workerChanged = files.some((f) => f.startsWith('worker-airtrust/') && !f.startsWith('worker-airtrust/migrations/') && !f.startsWith('worker-airtrust/schema-v2/'));
const lmsChanged = files.some((f) => /(^|\/)(lms|scorm|h5p)(-|\/|\.|_)/i.test(f));
const e2eChanged = files.some((f) => f.startsWith('e2e/') || /playwright/i.test(f));
const packageChanged = files.some((f) => f === 'package.json' || f === 'package-lock.json' || f === 'worker-airtrust/package.json' || f === 'worker-airtrust/package-lock.json');
const ciOrGuardChanged = files.some((f) => f.startsWith('.github/workflows/') || f.startsWith('scripts/ci/') || /guard-/i.test(f));

if (!docsOnly) {
  if (frontendChanged && !frontendTests.length) add('frontend affected suite', 'npm run test:run');
  if (workerChanged && !workerTests.length) add('worker affected suite', 'npm run test:worker');
  if (frontendChanged) add('frontend TypeScript ratchet', 'npm run typecheck');
  if (workerChanged) add('worker typecheck', 'npm run typecheck:worker');
  if (lmsChanged) add('LMS local smoke', 'npm run smoke:lms:local');
  if (e2eChanged) add('E2E/Playwright', 'npm run test:e2e');
  if (packageChanged || ciOrGuardChanged) add('canonical lint/guards', 'npm run lint');
  if (frontendChanged || packageChanged) add('build', 'npm run build');
}

if (docsOnly && !scriptTests.length) {
  console.log('Delta is documentation-only: no local product suite is required by this planner.');
}

if (!plan.length) {
  console.log('No deterministic local command mapped. Use the nearest focused test, then the affected suite.');
} else {
  console.log('\nRecommended local sequence:');
  plan.forEach((item, i) => console.log(`${i + 1}. [${item.label}] ${item.command}`));
}

console.log('\nAfter local evidence: push PR and use the official GitHub CI gates. This planner never replaces CI.');

if (run && plan.length) {
  console.log('\nExecuting plan...');
  for (const item of plan) {
    console.log(`\n>>> ${item.command}`);
    const result = spawnSync(item.command, { shell: true, stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`FAILED: ${item.label}`);
      process.exit(result.status ?? 1);
    }
  }
  console.log('\nLocal plan PASS.');
}
