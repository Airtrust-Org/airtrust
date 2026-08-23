#!/usr/bin/env node
// FRMS SIGVOOS synthetic-sync QA runner — STAGING ONLY.
//
// source_reference: authorized session 2026-08-23, "FRENTE FINAL FRMS
// STAGING — SIGVOOS SYNTHETIC PROVIDER / CANONICAL SYNC".
// operational_decision: closes the FRMS_CANONICAL_OPERATIONAL_SOURCE gap
// found via the FIRA runner (MR !84) — origem='FIRA' is permanently
// FIRA_NAO_OPERACIONAL; only origem='SIGVOOS' feeds fatorização/WOCL/
// effectiveness/rolling/alerts. This runner exercises the REAL
// syncSigvoosForFrms pipeline (worker-airtrust/src/services/sigvoos-frms.ts)
// end to end, injecting a SyntheticSigvoosStagingClient at the exact
// external-client boundary (SigvoosSyncDeps.createClient) instead of
// SigvoosApiClient — everything downstream (normalization, tripulante
// matching, FIRA-style preview/confirm, relabel-to-SIGVOOS, reprocessing)
// is the real, unmodified production code path. EXTERNAL_SIGVOOS_CONTACTED
// is always NO; no real SIGVOOS host, credential, or request is ever used.
// dry_run_required: --dry-run is the default; --apply is required to write.
// rollback_plan_required: every row is tagged QA_FRMS_SIGVOOS_SYNC_20260823
// (persisted in integracoes_sigvoos_eventos.payload_json AND as
// fixtureId in the sync input); compensation is by exact id, never a
// broad DELETE.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ALLOWED_ENV = 'staging';
const ALLOWED_DB_NAME = 'airtrust-db-staging-baseline-20260701';
const ALLOWED_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const BLOCKED_DB_IDS = ['7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae', 'a72fb05b-0912-4ad9-9686-e7948c8b09eb'];
const ALLOWED_EMPRESA_ID = 999006;
const FIXTURE_ID = 'QA_FRMS_SIGVOOS_SYNC_20260823';
const FIXTURE_CANAC = '999006'; // same synthetic CANAC set on funcionario id=1 by MR !84's FIRA runner

const WORKER_DIR = fileURLToPath(new URL('../../worker-airtrust/', import.meta.url));

export function parseArgs(argv) {
  const args = { dryRun: true, apply: false, empresaId: null, dbName: null, dbId: null, environment: null };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--apply') { args.apply = true; args.dryRun = false; }
    else if (arg.startsWith('--empresa-id=')) args.empresaId = Number(arg.slice('--empresa-id='.length));
    else if (arg.startsWith('--db-name=')) args.dbName = arg.slice('--db-name='.length);
    else if (arg.startsWith('--db-id=')) args.dbId = arg.slice('--db-id='.length);
    else if (arg.startsWith('--environment=')) args.environment = arg.slice('--environment='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export function assertGuards(args) {
  const environment = args.environment ?? ALLOWED_ENV;
  const dbName = args.dbName ?? ALLOWED_DB_NAME;
  const dbId = args.dbId ?? ALLOWED_DB_ID;
  const empresaId = args.empresaId ?? ALLOWED_EMPRESA_ID;

  if (environment !== ALLOWED_ENV) {
    throw new Error(`ABORT: environment must be exactly "${ALLOWED_ENV}", got "${environment}".`);
  }
  if (BLOCKED_DB_IDS.includes(dbId)) {
    throw new Error(`ABORT: database id "${dbId}" is on the production/dev blocklist.`);
  }
  if (dbName !== ALLOWED_DB_NAME || dbId !== ALLOWED_DB_ID) {
    throw new Error(`ABORT: target "${dbName}" (${dbId}) is not the expected staging D1 (${ALLOWED_DB_NAME} / ${ALLOWED_DB_ID}).`);
  }
  if (empresaId !== ALLOWED_EMPRESA_ID) {
    throw new Error(`ABORT: empresaId must be exactly ${ALLOWED_EMPRESA_ID} (no generic default accepted), got ${empresaId}.`);
  }
  return { environment, dbName, dbId, empresaId };
}

function queryD1(dbName, sql) {
  const run = spawnSync('npx', ['wrangler', 'd1', 'execute', dbName, '--remote', '--json', '--command', sql], {
    cwd: WORKER_DIR, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50,
  });
  if (run.status !== 0) throw new Error(`D1 query failed: ${run.stderr || run.stdout}`);
  return JSON.parse(run.stdout)[0]?.results ?? [];
}

function bindSql(sql, args) {
  let i = 0;
  return sql.replace(/\?/g, () => {
    const v = args[i++];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  });
}

function makeD1(dbName) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const bound = bindSql(sql, args);
          return {
            async all() { return { results: queryD1(dbName, bound) }; },
            async first() { const rows = queryD1(dbName, bound); return rows[0] ?? null; },
            async run() { queryD1(dbName, bound); return { success: true }; },
          };
        },
        async all() { return { results: queryD1(dbName, sql) }; },
        async first() { const rows = queryD1(dbName, sql); return rows[0] ?? null; },
        async run() { queryD1(dbName, sql); return { success: true }; },
      };
    },
  };
}

/**
 * Builds the QA fixture: a normal day, a WOCL-crossing presentation, and a
 * few more duty days to give 7d/28d accumulation and the fortnight
 * indicator something to compute over. Same tripulante/CANAC as the FIRA
 * canonical runner (MR !84) — funcionario id=1, empresa_id=999006.
 */
export function buildSyntheticSigvoosLegs({ ano, mes }) {
  const mm = String(mes).padStart(2, '0');
  const day = (d) => `${ano}-${mm}-${String(d).padStart(2, '0')}`;
  const legFor = (dia, engineStart, engineShutoff, navigationTimeStr, suffix) => ({
    canac: FIXTURE_CANAC,
    staffId: `QA-SYNTHETIC-SIGVOOS-20260823-STAFF-1`,
    flightReportId: `QA-SYNTHETIC-SIGVOOS-20260823-FR-${suffix}`,
    tripulanteNome: 'QA INSTRUTOR EXAMINADOR',
    date: day(dia),
    engineStartTime: engineStart,
    engineShutoffTime: engineShutoff,
    navigationTimeStr,
    departureIcao: 'SBQA',
    aircraftRegistration: 'QA-SYNTH-001',
  });

  return [
    legFor(3, '07:00', '15:00', '5:30', '003'), // NORMAL: daytime, adequate rest around it
    legFor(6, '02:30', '08:00', '3:15', '006'), // WOCL: presentation inside 02:00-06:00 governed window
    legFor(10, '07:00', '14:00', '4:00', '010'), // ACCUMULATED/FORTNIGHT history
    legFor(13, '07:00', '14:00', '4:00', '013'),
    legFor(17, '07:00', '14:00', '4:00', '017'),
    legFor(20, '07:00', '14:00', '4:00', '020'),
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { dbName, dbId, empresaId } = assertGuards(args);

  console.log(JSON.stringify({
    guard: 'PASS', environment: args.environment ?? ALLOWED_ENV, dbName, dbId, empresaId,
    mode: args.apply ? 'APPLY' : 'DRY_RUN', fixtureId: FIXTURE_ID,
    EXTERNAL_SIGVOOS_CONTACTED: 'NO', EXECUTION_MODE: 'SYNTHETIC_STAGING',
  }, null, 2));

  const db = makeD1(dbName);
  const today = new Date();
  const ano = today.getUTCFullYear();
  const mes = today.getUTCMonth() + 1;
  const legs = buildSyntheticSigvoosLegs({ ano, mes });

  const funcionario = await db.prepare(
    'SELECT id, codigo_anac FROM funcionarios WHERE id = 1 AND empresa_id = ?',
  ).bind(empresaId).first();
  if (!funcionario) {
    throw new Error(`ABORT: expected QA tripulante id=1 not found under empresa_id=${empresaId}.`);
  }
  if (funcionario.codigo_anac !== FIXTURE_CANAC) {
    throw new Error(
      `ABORT: funcionario id=1 codigo_anac is "${funcionario.codigo_anac}", expected "${FIXTURE_CANAC}" ` +
      '(set by the FIRA canonical runner, MR !84) — refusing to guess a CANAC mapping.',
    );
  }

  const mm = String(mes).padStart(2, '0');
  const existingSigvoosJornadas = await db.prepare(
    `SELECT data, id, origem FROM frms_jornada
      WHERE tripulante_id = '1' AND deleted_at IS NULL
        AND data LIKE '${ano}-${mm}-%'`,
  ).all();

  console.log(JSON.stringify({
    step: 'PREVIEW',
    period: `${ano}-${mm}`,
    legsPlanned: legs.map((l) => ({ date: l.date, flightReportId: l.flightReportId })),
    existingJornadasForPeriod: existingSigvoosJornadas.results,
    injectionPoint: 'SigvoosSyncDeps.createClient (worker-airtrust/src/services/sigvoos-frms.ts syncSigvoosForFrms)',
    syntheticClient: 'SyntheticSigvoosStagingClient (worker-airtrust/src/lib/sigvoos/synthetic-staging-client.ts)',
    expectedOrigemAfterRelabel: 'SIGVOOS',
    externalHttpWillBeAttempted: false,
  }, null, 2));

  if (!args.apply) {
    console.log('DRY_RUN_OK: no write performed, no network contacted. Re-run with --apply to execute.');
    console.log('WRITE_COUNT: 0');
    return;
  }

  const { syncSigvoosForFrms } = await import(
    fileURLToPath(new URL('../../worker-airtrust/src/services/sigvoos-frms.ts', import.meta.url))
  );
  const { SyntheticSigvoosStagingClient } = await import(
    fileURLToPath(new URL('../../worker-airtrust/src/lib/sigvoos/synthetic-staging-client.ts', import.meta.url))
  );

  const client = new SyntheticSigvoosStagingClient(legs);
  const from = `${ano}-${mm}-01`;
  const to = `${ano}-${mm}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;

  const summary = await syncSigvoosForFrms(
    db,
    empresaId,
    '9', // operadorId — same QA operator funcionario used by the FIRA runner
    { from, to, maxPages: 2, executionMode: 'SYNTHETIC_STAGING', externalContact: false, fixtureId: FIXTURE_ID },
    undefined,
    { createClient: () => client },
  );

  console.log(JSON.stringify({ step: 'SYNC_RESULT', ...summary }, null, 2));
  console.log('APPLY_OK');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.stack || err));
    process.exitCode = 1;
  });
}
