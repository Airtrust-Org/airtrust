import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_API = 'https://api.airtrust.online/api';
const STAGING_API = 'https://airtrust-api-staging.airtrust.workers.dev/api';
const PRODUCTION_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';

function extractTomlBlock(source, startHeader, nextHeader) {
  const start = source.indexOf(startHeader);
  if (start < 0) return '';
  const end = nextHeader ? source.indexOf(nextHeader, start + startHeader.length) : -1;
  return source.slice(start, end < 0 ? source.length : end);
}

function extractCorsOrigins(block) {
  const match = block.match(/^CORS_ORIGINS\s*=\s*"([^"]*)"$/m);
  return match ? match[1].split(',').map((item) => item.trim()).filter(Boolean) : [];
}

export function inspectFrontendSource(source) {
  const violations = [];
  if (/host\.includes\(\s*['"]pages\.dev['"]\s*\)/.test(source)) {
    violations.push('frontend: generic pages.dev includes() routing is forbidden');
  }
  if (/host\.includes\(\s*['"]airtrust\.pages\.dev['"]\s*\)/.test(source)) {
    violations.push('frontend: generic airtrust.pages.dev includes() routing is forbidden');
  }
  if (!source.includes('PRODUCTION_FRONTEND_HOSTS')) {
    violations.push('frontend: production hosts must be an explicit allowlist');
  }
  if (!source.includes('Preview host') || !source.includes('may only use the staging API')) {
    violations.push('frontend: Pages previews must fail closed or use staging explicitly');
  }
  return violations;
}

export function inspectAllowedOriginsSource(source) {
  const violations = [];
  if (/\[a-z0-9-\]\+\\\.airtrust\\\.pages\\\.dev/i.test(source)) {
    violations.push('worker: broad *.airtrust.pages.dev credentialed allowlist is forbidden');
  }
  if (/origin\.(?:includes|endsWith)\(\s*['"](?:\.airtrust\.)?pages\.dev['"]/.test(source)) {
    violations.push('worker: Pages origins must be exact configured values, not suffix heuristics');
  }
  if (!source.includes('parseEnvAllowedOrigins') || !source.includes("candidate === '*'")) {
    violations.push('worker: CORS parser must reject wildcard configuration');
  }
  return violations;
}

export function inspectCredentialedCorsSource(source, label = 'source') {
  const hasCredentials = /Access-Control-Allow-Credentials['"),:\s]+true/i.test(source);
  const hasWildcardOrigin = /Access-Control-Allow-Origin['"),:\s]+\*/i.test(source);
  return hasCredentials && hasWildcardOrigin
    ? [`${label}: wildcard Access-Control-Allow-Origin with credentials is forbidden`]
    : [];
}

export function inspectWranglerSource(source, label = 'worker-airtrust/wrangler.toml') {
  const violations = [];
  if (!/main\s*=\s*"src\/environment-entrypoint\.ts"/.test(source)) {
    violations.push(`${label}: Worker main must enforce the environment origin boundary`);
  }
  if (/CORS_ORIGINS\s*=\s*"[^"]*\*[^"]*"/.test(source)) {
    violations.push(`${label}: wildcard CORS_ORIGINS is forbidden`);
  }

  if (source.includes('[env.staging]') && source.includes('[env.production]')) {
    const staging = extractTomlBlock(source, '[env.staging]', '\n[env.production]');
    const production = extractTomlBlock(source, '[env.production]');
    const stagingOrigins = extractCorsOrigins(staging);
    const productionOrigins = extractCorsOrigins(production);

    for (const origin of [
      'https://airtrust.online',
      'https://www.airtrust.online',
      'https://airtrust.pages.dev',
      'https://production.airtrust.pages.dev',
    ]) {
      if (stagingOrigins.includes(origin)) {
        violations.push(`${label}: staging CORS contains production origin ${origin}`);
      }
    }
    for (const origin of [
      'https://staging.airtrust.pages.dev',
      'https://main.airtrust.pages.dev',
    ]) {
      if (productionOrigins.includes(origin)) {
        violations.push(`${label}: production CORS contains staging origin ${origin}`);
      }
    }
    for (const origin of productionOrigins) {
      if (
        origin.endsWith('.pages.dev') &&
        origin !== 'https://airtrust.pages.dev' &&
        origin !== 'https://production.airtrust.pages.dev'
      ) {
        violations.push(`${label}: unapproved Pages preview in production CORS: ${origin}`);
      }
    }

    if (
      staging.includes(PRODUCTION_API) ||
      staging.includes(PRODUCTION_DB_ID) ||
      /bucket_name\s*=\s*"airtrust-storage"/.test(staging)
    ) {
      violations.push(`${label}: staging block contains a production API, D1, or R2 target`);
    }
    if (
      production.includes(STAGING_API) ||
      production.includes(STAGING_DB_ID) ||
      /bucket_name\s*=\s*"airtrust-storage-staging"/.test(production)
    ) {
      violations.push(`${label}: production block contains a staging API, D1, or R2 target`);
    }
  }

  return violations;
}

export function inspectWorkflowSource(source, label) {
  const violations = [];
  const isStagingOrPreview = /staging|PAGES_STAGING_BRANCH|preview/i.test(source);
  if (isStagingOrPreview && source.includes(`VITE_API_URL: ${PRODUCTION_API}`)) {
    violations.push(`${label}: staging/preview workflow points VITE_API_URL to production`);
  }
  if (/PAGES_STAGING_BRANCH:\s*production/.test(source)) {
    violations.push(`${label}: staging workflow targets the production Pages branch`);
  }
  return violations;
}

async function readText(root, relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function listFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(fullPath)));
    else output.push(fullPath);
  }
  return output;
}

export async function collectViolations(root = process.cwd()) {
  const violations = [];
  const frontend = await readText(root, 'src/react-app/config/api-environment.ts');
  const allowedOrigins = await readText(root, 'worker-airtrust/src/config/allowed-origins.ts');
  const wrangler = await readText(root, 'worker-airtrust/wrangler.toml');
  const wranglerDev = await readText(root, 'worker-airtrust/wrangler.dev.toml');

  violations.push(...inspectFrontendSource(frontend));
  violations.push(...inspectAllowedOriginsSource(allowedOrigins));
  violations.push(...inspectWranglerSource(wrangler));
  violations.push(...inspectWranglerSource(wranglerDev, 'worker-airtrust/wrangler.dev.toml'));

  const workerSourceFiles = await listFiles(path.join(root, 'worker-airtrust/src'));
  for (const file of workerSourceFiles) {
    if (!file.endsWith('.ts') || file.includes(`${path.sep}__tests__${path.sep}`)) continue;
    const source = await readFile(file, 'utf8');
    violations.push(
      ...inspectCredentialedCorsSource(source, path.relative(root, file).replaceAll(path.sep, '/')),
    );
  }

  const workflowDirectory = path.join(root, '.github/workflows');
  for (const file of await listFiles(workflowDirectory)) {
    if (!/\.ya?ml$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    violations.push(
      ...inspectWorkflowSource(source, path.relative(root, file).replaceAll(path.sep, '/')),
    );
  }

  return violations;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const violations = await collectViolations();
  if (violations.length > 0) {
    console.error('❌ Production/preview environment isolation guard failed.');
    console.error(violations.map((item) => `- ${item}`).join('\n'));
    process.exit(1);
  }
  console.log('✅ Production/preview API, CORS, Pages, and binding isolation verified.');
}
