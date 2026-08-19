import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const STAGING_IDENTITY = Object.freeze({
  worker: 'airtrust-api-staging',
  d1Name: 'airtrust-db-staging-baseline-20260701',
  d1Id: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
  r2: 'airtrust-storage-staging',
  pagesUrl: 'https://staging.airtrust.pages.dev',
  productionD1Id: '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
  productionWorker: 'airtrust-api',
  productionR2: 'airtrust-storage',
  productionPagesUrl: 'https://airtrust.pages.dev',
});

const SHA = /^[0-9a-f]{40}$/i;

function fail(message) {
  throw new Error(`GOVERNED_RELEASE_CONTRACT_FAILED: ${message}`);
}

export function validateGovernedReleaseContract(input) {
  const value = (key) => String(input[key] ?? '');
  const releaseSha = value('releaseSha').toLowerCase();
  if (!SHA.test(releaseSha)) fail('release SHA must be exactly 40 hexadecimal characters');
  if (value('environment') !== 'staging') fail('environment must be staging');
  if (value('confirmation') !== 'AIRTRUST_STAGING') fail('confirmation must be AIRTRUST_STAGING');
  if (value('ciCommitSha').toLowerCase() !== releaseSha) fail('release SHA must equal CI_COMMIT_SHA');
  if (value('ciCommitBranch') !== 'main') fail('CI_COMMIT_BRANCH must be main');
  if (value('ciProjectPath') !== 'airtrust-group/airtrust') fail('unexpected GitLab project');
  if (input.reachableFromMain !== true) fail('release SHA is not reachable from canonical origin/main');
  if (input.clean !== true) fail('working tree must be clean');

  const identity = input.identity ?? {};
  for (const key of ['worker', 'd1Name', 'd1Id', 'r2', 'pagesUrl']) {
    if (identity[key] !== STAGING_IDENTITY[key]) fail(`staging identity mismatch: ${key}`);
  }
  for (const [key, productionValue] of Object.entries({ d1Id: STAGING_IDENTITY.productionD1Id, worker: STAGING_IDENTITY.productionWorker, r2: STAGING_IDENTITY.productionR2, pagesUrl: STAGING_IDENTITY.productionPagesUrl })) {
    if (identity[key] === productionValue) fail(`production identity is forbidden: ${key}`);
  }

  return { releaseSha, environment: 'staging', identity: { ...STAGING_IDENTITY } };
}

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

export function contractInputFromEnvironment(env = process.env, repoRoot = process.cwd()) {
  const releaseSha = env.AIRTRUST_RELEASE_SHA;
  const originMain = git(repoRoot, ['rev-parse', 'origin/main']);
  let reachableFromMain = false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', releaseSha, originMain], { cwd: repoRoot });
    reachableFromMain = true;
  } catch {}
  return {
    releaseSha,
    environment: env.AIRTRUST_RELEASE_ENV,
    confirmation: env.AIRTRUST_RELEASE_CONFIRMATION,
    ciCommitSha: env.CI_COMMIT_SHA,
    ciCommitBranch: env.CI_COMMIT_BRANCH,
    ciProjectPath: env.CI_PROJECT_PATH,
    reachableFromMain,
    clean: git(repoRoot, ['status', '--porcelain']) === '',
    identity: {
      worker: env.ALLOWED_STAGING_WORKER_NAME,
      d1Name: env.ALLOWED_STAGING_DB_NAME,
      d1Id: env.ALLOWED_STAGING_DB_ID,
      r2: env.ALLOWED_STAGING_BUCKET_NAME,
      pagesUrl: env.STAGING_PAGES_URL,
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateGovernedReleaseContract(contractInputFromEnvironment());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
