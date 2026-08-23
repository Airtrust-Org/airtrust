#!/usr/bin/env node
// FRMS FIRA canonical-ingestion QA runner — STAGING ONLY.
//
// source_reference: authorized session 2026-08-23, "AUTORIZO A OPÇÃO B" —
// closes the last gap in FRMS HELICOPTER_OFFSHORE staging validation by
// exercising the REAL canonical ingestion path (processarUploadFira +
// confirmarImportacaoFira from ../../worker-airtrust/src/lib/frms/fira-service.ts)
// with a synthetic FIRA-shaped text fixture — never a real PDF, never real
// SIGVOOS, never real crew/flight data.
//
// operational_decision: reuses the exact production service functions that
// POST /api/frms/importacao/fira/upload and .../confirmar call — this script
// does not reimplement any FRMS/FIRA business logic. The HTTP route's
// requireRole('admin') gate is untouched; this script runs as a server-side
// operator action (analogous to how migrations/seeds are already applied
// outside HTTP in this project), not as an HTTP request.
//
// dry_run_required: --dry-run is the default; --apply is required to write.
// rollback_plan_required: every row created carries a deterministic,
// QA_FRMS_SIGVOOS_SYNTHETIC_20260823-tagged identity; compensation is by
// exact id, never a broad DELETE.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ALLOWED_ENV = 'staging';
const ALLOWED_DB_NAME = 'airtrust-db-staging-baseline-20260701';
const ALLOWED_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const BLOCKED_DB_IDS = ['7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae', 'a72fb05b-0912-4ad9-9686-e7948c8b09eb'];
const ALLOWED_EMPRESA_ID = 999006;
const FIXTURE_TAG = 'QA_FRMS_SIGVOOS_SYNTHETIC_20260823';
const FIXTURE_CANAC = '999006';
const FIXTURE_TRIPULANTE_NOME = 'QA INSTRUTOR EXAMINADOR';

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

/** Minimal D1Database-shaped wrapper over `wrangler d1 execute`, for calling
 * real production service functions (which expect a D1Database binding)
 * from a plain Node script. Not a reimplementation of any FRMS logic. */
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

/** processarUploadFira archives the raw PDF to R2 for audit, wrapped in a
 * try/catch in the production code (a failure there does not fail the
 * import). We have no real PDF (this is a synthetic text fixture, not a
 * scanned document), so this stub simply no-ops the archive step rather
 * than fabricating a fake binary artifact. */
const stubBucket = { async put() { /* intentionally no-op for a synthetic QA fixture */ } };

export function buildSyntheticFiraText({ ano, mes, mesNome, canac, nome }) {
  const DOW = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const dias = [];
  // Scenario A (NORMAL): day 2, daytime presentation, adequate rest.
  // Scenario B (WOCL): day 5, presentation inside the governed WOCL window
  //   (WOCL_START_MINUTE=120=02:00 .. WOCL_END_MINUTE=360=06:00).
  // Days 9, 12, 16, 19, 23 (ACCUMULATED/FORTNIGHT): a small synthetic duty
  //   history so 7d/28d accumulation and the fortnight indicator have more
  //   than a single isolated day to compute over.
  const dutyDays = new Map([
    [2, { horaIni: '07:00', horaFim: '15:00', jornada: '8:00', voo: '5:30' }],
    [5, { horaIni: '02:30', horaFim: '08:00', jornada: '5:30', voo: '3:15' }],
    [9, { horaIni: '07:00', horaFim: '14:00', jornada: '7:00', voo: '4:00' }],
    [12, { horaIni: '07:00', horaFim: '14:00', jornada: '7:00', voo: '4:00' }],
    [16, { horaIni: '07:00', horaFim: '14:00', jornada: '7:00', voo: '4:00' }],
    [19, { horaIni: '07:00', horaFim: '14:00', jornada: '7:00', voo: '4:00' }],
    [23, { horaIni: '07:00', horaFim: '14:00', jornada: '7:00', voo: '4:00' }],
  ]);
  let totalJornadaMin = 0;
  let totalVooMin = 0;
  const hhmmToMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  for (let d = 1; d <= diasNoMes; d++) {
    const dd = String(d).padStart(2, '0');
    const dow = DOW[(d - 1) % DOW.length];
    const duty = dutyDays.get(d);
    if (duty) {
      dias.push(`${dd} ${dow} ES STGQA ${duty.horaIni} ${duty.horaFim} ${duty.jornada} ${duty.voo}`);
      totalJornadaMin += hhmmToMin(duty.jornada);
      totalVooMin += hhmmToMin(duty.voo);
    } else {
      dias.push(`${dd} ${dow} - - - - - -`);
    }
  }
  const toHhmm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const texto = [
    `AIRTRUST STAGING QA 00.000.000/0001-00 Ano ${ano} Mês ${mesNome} Base Contratual`,
    `${nome} ${canac} TRIPULANTE STAGING-QA Dia ${dias.join(' ')} ${toHhmm(totalJornadaMin)} ${toHhmm(totalVooMin)} Totais do Mês`,
  ].join('\n');
  return { texto, dutyDays: [...dutyDays.keys()] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { dbName, dbId, empresaId } = assertGuards(args);

  console.log(JSON.stringify({
    guard: 'PASS', environment: args.environment ?? ALLOWED_ENV, dbName, dbId, empresaId,
    mode: args.apply ? 'APPLY' : 'DRY_RUN', fixtureTag: FIXTURE_TAG,
  }, null, 2));

  const db = makeD1(dbName);
  const today = new Date();
  const ano = today.getUTCFullYear();
  const mes = today.getUTCMonth() + 1;
  const MES_NOMES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const mesNome = MES_NOMES[mes - 1];

  // 1. Ensure the QA tripulante has the synthetic CANAC the fixture will
  //    reference — a normal identification field, never touching FRMS
  //    governance data (parameters/profile/revision/assignment).
  const existingCanac = await db.prepare(
    'SELECT codigo_anac FROM funcionarios WHERE id = 1 AND empresa_id = ?',
  ).bind(empresaId).first();
  if (!existingCanac) {
    throw new Error(`ABORT: expected QA tripulante id=1 not found under empresa_id=${empresaId}.`);
  }
  const needsCanacWrite = existingCanac.codigo_anac !== FIXTURE_CANAC;

  // 2. Build the synthetic FIRA-shaped text fixture (no real PDF, no real
  //    crew/flight data) and check for an existing REVISAO import for the
  //    same canac/ano/mes (idempotency probe — processarUploadFira itself
  //    also soft-deletes stale REVISAO rows for the same canac/ano/mes, but
  //    we report the pre-state explicitly here for the dry-run).
  const { texto, dutyDays } = buildSyntheticFiraText({ ano, mes, mesNome, canac: FIXTURE_CANAC, nome: FIXTURE_TRIPULANTE_NOME });
  const existingImport = await db.prepare(
    `SELECT id, status, total_dias_importados FROM frms_importacao_fira
      WHERE canac = ? AND ano = ? AND mes = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  ).bind(FIXTURE_CANAC, ano, mes).first();

  const existingJornadasForDuty = await db.prepare(
    `SELECT data, id, origem FROM frms_jornada
      WHERE tripulante_id = '1' AND deleted_at IS NULL
        AND data IN (${dutyDays.map((d) => `'${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}'`).join(',')})`,
  ).all();

  console.log(JSON.stringify({
    step: 'PREVIEW',
    needsCanacWrite,
    canac: FIXTURE_CANAC,
    period: `${ano}-${String(mes).padStart(2, '0')}`,
    dutyDaysPlanned: dutyDays,
    existingImportForPeriod: existingImport,
    existingJornadasOnDutyDates: existingJornadasForDuty.results,
    serviceToInvoke: 'processarUploadFira -> confirmarImportacaoFira (worker-airtrust/src/lib/frms/fira-service.ts, unmodified)',
    expectedOrigem: 'FIRA',
  }, null, 2));

  if (!args.apply) {
    console.log('DRY_RUN_OK: no write performed. Re-run with --apply to execute.');
    return;
  }

  if (needsCanacWrite) {
    await db.prepare('UPDATE funcionarios SET codigo_anac = ? WHERE id = 1 AND empresa_id = ?')
      .bind(FIXTURE_CANAC, empresaId).run();
    console.log('CANAC_SET: ' + FIXTURE_CANAC);
  }

  const { processarUploadFira, confirmarImportacaoFira } = await import(
    fileURLToPath(new URL('../../worker-airtrust/src/lib/frms/fira-service.ts', import.meta.url))
  );

  const pdfPlaceholder = new TextEncoder().encode('QA_FRMS_SIGVOOS_SYNTHETIC_20260823_NOT_A_REAL_PDF').buffer;
  const preview = await processarUploadFira(
    db, stubBucket, pdfPlaceholder, `${FIXTURE_TAG}.pdf`, '9', String(empresaId), texto,
  );

  console.log(JSON.stringify({
    step: 'UPLOAD_RESULT',
    importacao_id: preview.importacao_id,
    tripulante_encontrado: preview.tripulante_encontrado,
    tripulante_id: preview.tripulante_id,
    total_dias: preview.total_dias,
    novos: preview.linhas.filter((l) => l.situacao === 'NOVO').length,
    erros: preview.erros,
  }, null, 2));

  if (!preview.tripulante_encontrado) {
    throw new Error('ABORT: FIRA fixture did not match the QA tripulante by CANAC — refusing to confirm.');
  }

  const diasSelecionados = preview.linhas
    .filter((l) => l.situacao === 'NOVO')
    .map((l) => ({ dia: l.dia, forcar_substituicao: false }));

  const resultado = await confirmarImportacaoFira(
    db, preview.importacao_id, { dias_selecionados: diasSelecionados, observacao: FIXTURE_TAG }, '9',
    (await import(fileURLToPath(new URL('../../worker-airtrust/src/lib/frms/types.ts', import.meta.url)))).LIMITES_DEFAULT,
    empresaId,
  );

  console.log(JSON.stringify({ step: 'CONFIRM_RESULT', ...resultado, importacao_id: preview.importacao_id }, null, 2));
  console.log('APPLY_OK');
}

// Guard against side effects on import (e.g. from a test file importing the
// pure helpers above) — only run when this file is executed directly.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.stack || err));
    process.exitCode = 1;
  });
}
