#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function forbid(path, pattern, message) {
  if (!existsSync(resolve(root, path))) return;
  if (pattern.test(read(path))) failures.push(`${path}: ${message}`);
}

for (const removed of [
  'create-admin.js',
  'scripts/seed-admin.sql',
  'scripts/d1-seed-auth.sql',
  'worker-airtrust/scripts/top-categorias-health.sh',
  'worker-airtrust/scripts/debug-codigos.sh',
  'worker-airtrust/scripts/validar-codigos-historico.sh',
]) {
  if (existsSync(resolve(root, removed))) {
    failures.push(`${removed}: obsolete static-credential helper must not be restored`);
  }
}

forbid(
  'scripts/setup-local-db.sh',
  /@icloud\.com|Login\s+(?:master|legado).*\/|senha\s*:/i,
  'bootstrap must not publish literal user credentials',
);
forbid(
  'worker-airtrust/setup-dev-db.sh',
  /Login:.*\/\s*[^$\s]+/i,
  'development bootstrap must not print a password',
);
forbid(
  'src/react-app/utils/devCredentials.ts',
  /LOCAL_DEV_ADMIN_(?:EMAIL|PASSWORD)|return\s*\{\s*email:\s*envEmail\s*\|\|/s,
  'frontend dev auth must not have literal credential fallbacks',
);
forbid(
  'scripts/create-admin.js',
  /const\s+password\s*=\s*['"][^'"]+['"]|console\.log\([^\n]*(?:senha|password)[^\n]*\+|console\.log\([^\n]*(?:senha|password)[^\n]*\${/i,
  'admin helper must accept password only from ephemeral environment and never print it',
);

for (const path of [
  'worker-airtrust/scripts/test-reatividade.sh',
  'worker-airtrust/scripts/validacao-completa.sh',
]) {
  const content = read(path);
  if (/\b(?:SENHA|PASSWORD)\s*=\s*["'][^"$][^"']{5,}["']/.test(content)) {
    failures.push(`${path}: hardcoded password assignment detected`);
  }
  if (!content.includes('api.airtrust.online') || !content.includes('exit 2')) {
    failures.push(`${path}: explicit production refusal guard is required`);
  }
}

{
  const devDbSetup = read('worker-airtrust/setup-dev-db.sh');
  if (!devDbSetup.includes('DEV_ENV="development"')) {
    failures.push('worker-airtrust/setup-dev-db.sh: DEV_ENV must stay pinned to development');
  }
  if (!devDbSetup.includes('DEV_DB_NAME="airtrust-db-dev"')) {
    failures.push('worker-airtrust/setup-dev-db.sh: DEV_DB_NAME must stay pinned to airtrust-db-dev');
  }
  if (/DEV_DB_NAME\s*=\s*["']airtrust-db["']/.test(devDbSetup)) {
    failures.push('worker-airtrust/setup-dev-db.sh: production DB name is forbidden');
  }
  for (const required of [
    'AIRTRUST_ALLOW_REMOTE_DEV_DB_WRITE',
    'AIRTRUST_DEVELOPMENT_ONLY',
    '--reset-incompatible',
    'AIRTRUST_DEV_DB_RESET_CONFIRMATION',
    'AIRTRUST_RESET_DEVELOPMENT_D1',
  ]) {
    if (!devDbSetup.includes(required)) {
      failures.push(`worker-airtrust/setup-dev-db.sh: missing fail-closed remote development guard ${required}`);
    }
  }
}

if (failures.length) {
  console.error('[operational-auth-literals] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

forbid(
  'scripts/smoke-view-historico.sh',
  /REMOTE=["']--remote["']|airtrust-api\.airtrust\.workers\.dev|funcionario_nome_guerra/,
  'historico smoke must be local/aggregate-only by default and must not target historical production hosts',
);

console.log('[operational-auth-literals] OK');
