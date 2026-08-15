#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { assertAllowedProductionBaseUrl, fetchJson } from '../smoke-auth-common.mjs';
import {
import { fileURLToPath } from 'node:url';
  assertCleanMain,
  assertProductionTarget,
  resolveProductionTargetFromConfig,
} from './lib/reconcile-gates.mjs';
import { wranglerExecutor } from './lib/executors.mjs';
import {
  ALLOWED_EMPRESA_ID,
  MATRIX_VERSION,
  assertAdminAuth,
  collectOperationalWindowStatus,
  collectTenantState,
  decodeJwtPayload,
  parseSourcesRoot,
  runCommand,
} from './lib/simuladores-matriz-preflight.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_BASE_URL = 'https://api.airtrust.online';
const DEFAULT_TENANT_STATE = '/tmp/airtrust-tenant-state.json';
const DEFAULT_PLAN_DIR = '/tmp/airtrust-simuladores-plan';
const DEFAULT_REPORT = '/tmp/airtrust-simuladores-preflight-report.json';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  process.stderr.write(`ERRO: ${message}\n`);
  process.exit(1);
}

function ensureDirFor(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readAuthToken(envName) {
  const value = String(process.env[envName] || '').trim();
  if (!value) {
    throw new Error(`defina ${envName} com um Bearer token administrativo já emitido`);
  }
  if (/^bearer\s+/i.test(value)) {
    return value.replace(/^bearer\s+/i, '').trim();
  }
  return value;
}

function saoPauloWindow() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const nowKey = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  const end = new Date(now.getTime() + 30 * 60 * 1000);
  const endParts = Object.fromEntries(
    formatter
      .formatToParts(end)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const endKey = `${endParts.year}-${endParts.month}-${endParts.day} ${endParts.hour}:${endParts.minute}:${endParts.second}`;
  return { nowKey, endKey };
}

async function validateAdminIdentity({ baseUrl, token, expectedEmpresaId }) {
  const jwtClaims = decodeJwtPayload(token);
  const me = await fetchJson(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (me.status !== 200) {
    throw new Error(`auth/me retornou ${me.status}`);
  }
  return assertAdminAuth({
    jwtClaims,
    mePayload: me.json,
    expectedEmpresaId,
  });
}

function buildPlanFromSnapshot({ tenantStatePath, planDir, sourcesRoot }) {
  const aw139 = join(sourcesRoot, 'AW139');
  const sk76 = join(sourcesRoot, 'SK76');
  const stdout = runCommand(
    'node',
    [
      'worker-airtrust/scripts/prepare-simuladores-matriz-import.mjs',
      '--aw139',
      aw139,
      '--sk76',
      sk76,
      '--empresa-id',
      String(ALLOWED_EMPRESA_ID),
      '--tenant-state',
      tenantStatePath,
      '--out',
      planDir,
    ],
    { cwd: REPO_ROOT },
  );
  return JSON.parse(stdout);
}

async function main() {
  const configPath = resolve(arg('--config') || 'worker-airtrust/wrangler.toml');
  const env = String(arg('--env') || 'production');
  const baseUrl = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || DEFAULT_BASE_URL);
  const matrixVersion = String(arg('--matrix-version') || MATRIX_VERSION);
  const authTokenEnv = String(arg('--auth-token-env') || 'AIRTRUST_PREFLIGHT_AUTH_TOKEN');
  const fkBaselineArg = arg('--fk-baseline');
  const fkBaseline = fkBaselineArg === undefined ? undefined : Number(fkBaselineArg);
  const tenantStatePath = resolve(arg('--tenant-state-out') || DEFAULT_TENANT_STATE);
  const planDir = resolve(arg('--plan-out-dir') || DEFAULT_PLAN_DIR);
  const reportPath = resolve(arg('--report-out') || DEFAULT_REPORT);
  const sourcesPathFile = resolve(arg('--sources-path-file') || '/tmp/airtrust-simuladores-path');

  const target = resolveProductionTargetFromConfig(configPath, env);
  assertProductionTarget(target);
  const gitState = assertCleanMain({ cwd: REPO_ROOT });
  const authToken = readAuthToken(authTokenEnv);
  const auth = await validateAdminIdentity({
    baseUrl,
    token: authToken,
    expectedEmpresaId: ALLOWED_EMPRESA_ID,
  });

  const commandsRun = [];
  const executor = wranglerExecutor({
    database: target.database_name,
    config: configPath,
    remote: true,
    env,
    allowWrites: false,
    cwd: join(REPO_ROOT, 'worker-airtrust'),
    onCommand: (cmd, args) => commandsRun.push(`${cmd} ${args.join(' ')}`),
  });

  const { nowKey, endKey } = saoPauloWindow();
  const tenantResult = collectTenantState({
    executor,
    empresaId: ALLOWED_EMPRESA_ID,
    matrixVersion,
    fkBaseline,
    nowKey,
    endKey,
  });
  const concurrency = collectOperationalWindowStatus({
    executor,
    empresaId: ALLOWED_EMPRESA_ID,
    nowKey,
    endKey,
  });
  if (concurrency.active_sessions > 0 || concurrency.active_checks > 0) {
    throw new Error(
      `janela operacional indisponível: ${concurrency.active_sessions} sessão(ões) ativas e ${concurrency.active_checks} check(s) ativos`,
    );
  }
  if (concurrency.pending_edits > 0) {
    throw new Error(
      `janela operacional indisponível: ${concurrency.pending_edits} edição(ões) concorrentes pendentes`,
    );
  }

  ensureDirFor(tenantStatePath);
  writeFileSync(tenantStatePath, `${JSON.stringify(tenantResult.tenantState, null, 2)}\n`);

  const sourcesRoot = parseSourcesRoot(sourcesPathFile);
  ensureDirFor(join(planDir, 'plan.json'));
  const planSummary = buildPlanFromSnapshot({
    tenantStatePath,
    planDir,
    sourcesRoot,
  });
  const plan = JSON.parse(readFileSync(join(planDir, 'plan.json'), 'utf8'));

  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    git: {
      head: gitState.head,
      branch: gitState.branch,
    },
    target,
    auth,
    snapshot: {
      tenant_state_path: tenantStatePath,
      fingerprint: tenantResult.fingerprint.fingerprint,
      migration_state: tenantResult.migrationState,
    },
    concurrency,
    sources: {
      root: sourcesRoot,
      hash_count: Number(planSummary.hashes || 0),
    },
    plan: {
      path: join(planDir, 'plan.json'),
      plan_sha256: plan.plan_sha256,
      totals: plan.totals,
      empresa_id: plan.empresa_id,
    },
    readonly: {
      production_queries_only: true,
      wrangler_commands: commandsRun,
    },
  };

  ensureDirFor(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
