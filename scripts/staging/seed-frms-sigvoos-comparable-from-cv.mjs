#!/usr/bin/env node

// source_reference: derived from tenant 906 staging cv_* SIGVOOS rows for 2026-06-12..2026-06-18 only.
// operational_decision: seed synthetic frms_jornada rows in staging to make shadow-compare data comparable without touching production.
// dry_run_required: use --dry-run before --apply to inspect the exact synthetic candidate set.
// rollback_plan_required: use --rollback with explicit confirmation to soft-delete only rows created by this script.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const WORKER_ROOT = path.join(ROOT, 'worker-airtrust');
const TARGET_ENV = 'staging';
const EXPECTED_STAGING_DB_ID = 'b7f50907-c110-45f5-ad17-e97ea47f2826';
const TARGET_EMPRESA_ID = 906;
const TARGET_FROM = '2026-06-12';
const TARGET_TO = '2026-06-18';
const REGISTERED_BY = 'STAGING_SHADOW_COMPARE';
const ROW_ID_PREFIX = 'stg-shadow-compare-906-';
const OBSERVACAO_MARKER = 'STAGING_SIGVOOS_SHADOW_COMPARE_FROM_CV';
const APPLY_CONFIRM = 'YES_SEED_STAGING_SIGVOOS_FRMS_906';
const ROLLBACK_CONFIRM = 'YES_ROLLBACK_STAGING_SIGVOOS_FRMS_906';

function fail(message) {
  throw new Error(message);
}

function usage() {
  return [
    'Usage:',
    '  node scripts/staging/seed-frms-sigvoos-comparable-from-cv.mjs --dry-run',
    `  node scripts/staging/seed-frms-sigvoos-comparable-from-cv.mjs --apply --confirm-apply ${APPLY_CONFIRM}`,
    `  node scripts/staging/seed-frms-sigvoos-comparable-from-cv.mjs --rollback --confirm-rollback ${ROLLBACK_CONFIRM}`,
    '',
    'Safety:',
    `  - hard-coded to env=${TARGET_ENV}, empresa_id=${TARGET_EMPRESA_ID}, from=${TARGET_FROM}, to=${TARGET_TO}`,
    `  - aborts unless worker-airtrust/wrangler.toml staging DB id is ${EXPECTED_STAGING_DB_ID}`,
    '  - no production path',
    '  - no physical DELETE',
    '  - idempotent upsert for synthetic rows only',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    apply: false,
    rollback: false,
    confirmApply: null,
    confirmRollback: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--rollback') args.rollback = true;
    else if (arg === '--confirm-apply') args.confirmApply = argv[index + 1] ?? null, (index += 1);
    else if (arg === '--confirm-rollback') args.confirmRollback = argv[index + 1] ?? null, (index += 1);
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const modes = [args.dryRun, args.apply, args.rollback].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error('Choose exactly one of --dry-run, --apply or --rollback.');
  }
  if (args.apply && args.confirmApply !== APPLY_CONFIRM) {
    throw new Error(`--confirm-apply must be exactly ${APPLY_CONFIRM}`);
  }
  if (args.rollback && args.confirmRollback !== ROLLBACK_CONFIRM) {
    throw new Error(`--confirm-rollback must be exactly ${ROLLBACK_CONFIRM}`);
  }

  return args;
}

function q(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runWrangler(args) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    cwd: WORKER_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'WRANGLER_FAILED').trim());
  }
  return result.stdout.trim();
}

function runWranglerJson(args) {
  const raw = runWrangler(args);
  const payload = JSON.parse(raw);
  return Array.isArray(payload) ? payload : [payload];
}

function ensureExpectedStagingDbBinding() {
  const raw = fs.readFileSync(path.join(WORKER_ROOT, 'wrangler.toml'), 'utf8');
  const stagingSection = raw.match(
    /\[\[env\.staging\.d1_databases\]\][\s\S]*?database_id\s*=\s*"([^"]+)"/,
  );
  const configuredDatabaseId = stagingSection?.[1] || null;
  if (configuredDatabaseId !== EXPECTED_STAGING_DB_ID) {
    fail(
      `Refusing to run: expected staging DB id ${EXPECTED_STAGING_DB_ID}, found ${configuredDatabaseId || 'missing'}.`,
    );
  }
}

function queryRows(sql) {
  const payload = runWranglerJson(['d1', 'execute', 'DB', '--remote', '--env', TARGET_ENV, '--json', '--command', sql]);
  return payload.flatMap((entry) => entry.results || []);
}

function executeStatements(statements) {
  if (statements.length === 0) return { changes: 0, batches: 0 };
  const sql = statements.join('\n');
  const payload = runWranglerJson(['d1', 'execute', 'DB', '--remote', '--env', TARGET_ENV, '--json', '--command', sql]);
  let changes = 0;
  for (const entry of payload) {
    changes += Number(entry.meta?.changes || 0);
  }
  return { changes, batches: 1 };
}

function summarizeCandidates(rows) {
  const byDate = new Map();
  const byBase = new Map();
  const byAircraft = new Map();
  for (const row of rows) {
    byDate.set(row.data, (byDate.get(row.data) || 0) + 1);
    byBase.set(row.local_base, (byBase.get(row.local_base) || 0) + 1);
    byAircraft.set(row.matricula_aeronave, (byAircraft.get(row.matricula_aeronave) || 0) + 1);
  }

  const toList = (map) =>
    [...map.entries()]
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
      .map(([key, total]) => ({ key, total }));

  return {
    byDate: toList(byDate),
    byBase: toList(byBase),
    byAircraft: toList(byAircraft),
  };
}

function baselineSql() {
  return `
    SELECT COUNT(*) AS empresas_906 FROM empresas WHERE id = ${TARGET_EMPRESA_ID} AND deleted_at IS NULL AND ativo = 1;
    SELECT COUNT(*) AS funcionarios_906 FROM funcionarios WHERE empresa_id = ${TARGET_EMPRESA_ID} AND deleted_at IS NULL;
    SELECT COUNT(*) AS cv_voos_906
      FROM cv_voos
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND origem_importacao = 'SIGVOOS'
       AND deleted_at IS NULL
       AND date(data_programacao) BETWEEN date(${q(TARGET_FROM)}) AND date(${q(TARGET_TO)});
    SELECT COUNT(*) AS frms_sigvoos_906
      FROM frms_jornada
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND deleted_at IS NULL
       AND UPPER(COALESCE(origem, '')) = 'SIGVOOS'
       AND date(data) BETWEEN date(${q(TARGET_FROM)}) AND date(${q(TARGET_TO)});
    SELECT COUNT(*) AS synthetic_active_rows
      FROM frms_jornada
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND deleted_at IS NULL
       AND registrado_por = ${q(REGISTERED_BY)}
       AND id LIKE ${q(`${ROW_ID_PREFIX}%`)};
  `;
}

function syntheticCandidatesSql() {
  return `
    WITH fallback_trip AS (
      SELECT MIN(id) AS funcionario_id
        FROM funcionarios
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND deleted_at IS NULL
    ),
    crew_per_voo AS (
      SELECT voo_id, MIN(funcionario_id) AS funcionario_id
        FROM cv_voo_tripulantes
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND deleted_at IS NULL
       GROUP BY voo_id
    ),
    first_stage AS (
      SELECT voo_id, MIN(id) AS etapa_id
        FROM cv_voo_etapas
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND origem_dados = 'SIGVOOS'
         AND deleted_at IS NULL
       GROUP BY voo_id
    )
    SELECT
      v.id AS voo_id,
      v.data_programacao AS data,
      v.prefixo AS matricula_aeronave,
      COALESCE(c.funcionario_id, f.funcionario_id) AS tripulante_id,
      COALESCE(e.origem_icao, 'SEM_BASE') AS local_base,
      v.horario_previsto_partida AS hora_apresentacao,
      v.horario_previsto_chegada AS hora_termino,
      'ES' AS status
    FROM cv_voos v
    LEFT JOIN crew_per_voo c ON c.voo_id = v.id
    LEFT JOIN first_stage fs ON fs.voo_id = v.id
    LEFT JOIN cv_voo_etapas e ON e.id = fs.etapa_id
    CROSS JOIN fallback_trip f
    WHERE v.empresa_id = ${TARGET_EMPRESA_ID}
      AND v.origem_importacao = 'SIGVOOS'
      AND v.deleted_at IS NULL
      AND date(v.data_programacao) BETWEEN date(${q(TARGET_FROM)}) AND date(${q(TARGET_TO)})
    ORDER BY date(v.data_programacao), v.id;
  `;
}

function aggregateCandidates(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.tripulante_id}:${row.data}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, {
        tripulante_id: Number(row.tripulante_id),
        data: String(row.data),
        local_base: row.local_base || 'SEM_BASE',
        matricula_aeronave: row.matricula_aeronave || 'SEM_AERONAVE',
        status: row.status || 'ES',
        hora_apresentacao: row.hora_apresentacao || null,
        hora_termino: row.hora_termino || null,
        voo_ids: [Number(row.voo_id)],
      });
      continue;
    }

    current.voo_ids.push(Number(row.voo_id));
    if (!current.hora_apresentacao && row.hora_apresentacao) current.hora_apresentacao = row.hora_apresentacao;
    if (row.hora_termino) current.hora_termino = row.hora_termino;
  }

  return [...byKey.values()].sort((left, right) => {
    const byDate = left.data.localeCompare(right.data);
    return byDate || left.tripulante_id - right.tripulante_id;
  });
}

function compareSummarySql() {
  return `
    SELECT COUNT(*) AS frms_journeys_sigvoos
      FROM frms_jornada
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND deleted_at IS NULL
       AND UPPER(COALESCE(origem, '')) = 'SIGVOOS'
       AND date(data) BETWEEN date(${q(TARGET_FROM)}) AND date(${q(TARGET_TO)});
    SELECT COALESCE(local_base, 'SEM_BASE') AS key, COUNT(*) AS total
      FROM frms_jornada
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND deleted_at IS NULL
       AND UPPER(COALESCE(origem, '')) = 'SIGVOOS'
       AND date(data) BETWEEN date(${q(TARGET_FROM)}) AND date(${q(TARGET_TO)})
     GROUP BY COALESCE(local_base, 'SEM_BASE')
     ORDER BY key;
    SELECT COALESCE(matricula_aeronave, 'SEM_AERONAVE') AS key, COUNT(*) AS total
      FROM frms_jornada
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND deleted_at IS NULL
       AND UPPER(COALESCE(origem, '')) = 'SIGVOOS'
       AND date(data) BETWEEN date(${q(TARGET_FROM)}) AND date(${q(TARGET_TO)})
     GROUP BY COALESCE(matricula_aeronave, 'SEM_AERONAVE')
     ORDER BY key;
  `;
}

function compareReportUrl() {
  return `https://airtrust-api-staging.airtrust.workers.dev/api/controle-voos/sigvoos/shadow-compare?from=${TARGET_FROM}&to=${TARGET_TO}`;
}

function markerObservation(row) {
  return `${OBSERVACAO_MARKER};empresa=${TARGET_EMPRESA_ID};tripulante=${row.tripulante_id};data=${row.data};voos=${row.voo_ids.join(',')};window=${TARGET_FROM}..${TARGET_TO}`;
}

function syntheticRowId(row) {
  return `${ROW_ID_PREFIX}${row.tripulante_id}-${row.data}`;
}

function buildUpsertStatements(rows) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return rows.map((row) => {
    const id = syntheticRowId(row);
    return `
      INSERT INTO frms_jornada (
        id, tripulante_id, empresa_id, data, status,
        hora_apresentacao, hora_termino, duracao_jornada_minutos, horas_voo_minutos,
        observacao, registrado_por, origem, local_base, matricula_aeronave,
        tipo_base, tripulacao_aumentada, aclimatado,
        fonte_resolucao_sigvoos, fonte_resolucao,
        created_at, updated_at, deleted_at
      ) VALUES (
        ${q(id)}, ${Number(row.tripulante_id)}, ${TARGET_EMPRESA_ID}, ${q(row.data)}, ${q(row.status)},
        ${q(row.hora_apresentacao)}, ${q(row.hora_termino)}, 0, 0,
        ${q(markerObservation(row))}, ${q(REGISTERED_BY)}, 'SIGVOOS', ${q(row.local_base)}, ${q(row.matricula_aeronave)},
        'HOME', 0, 1,
        'STAGING_SYNTHETIC_FROM_CV', 'SIGVOOS',
        ${q(timestamp)}, ${q(timestamp)}, NULL
      )
      ON CONFLICT(id) DO UPDATE SET
        tripulante_id = excluded.tripulante_id,
        empresa_id = excluded.empresa_id,
        data = excluded.data,
        status = excluded.status,
        hora_apresentacao = excluded.hora_apresentacao,
        hora_termino = excluded.hora_termino,
        duracao_jornada_minutos = excluded.duracao_jornada_minutos,
        horas_voo_minutos = excluded.horas_voo_minutos,
        observacao = excluded.observacao,
        registrado_por = excluded.registrado_por,
        origem = excluded.origem,
        local_base = excluded.local_base,
        matricula_aeronave = excluded.matricula_aeronave,
        tipo_base = excluded.tipo_base,
        tripulacao_aumentada = excluded.tripulacao_aumentada,
        aclimatado = excluded.aclimatado,
        fonte_resolucao_sigvoos = excluded.fonte_resolucao_sigvoos,
        fonte_resolucao = excluded.fonte_resolucao,
        updated_at = excluded.updated_at,
        deleted_at = NULL;
    `;
  });
}

function buildRollbackStatements() {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return [
    `
      UPDATE frms_jornada
         SET deleted_at = ${q(timestamp)},
             updated_at = ${q(timestamp)}
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND deleted_at IS NULL
         AND registrado_por = ${q(REGISTERED_BY)}
         AND id LIKE ${q(`${ROW_ID_PREFIX}%`)}
         AND date(data) BETWEEN date(${q(TARGET_FROM)}) AND date(${q(TARGET_TO)});
    `,
  ];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureExpectedStagingDbBinding();
  const baseline = queryRows(baselineSql());
  const sourceRows = queryRows(syntheticCandidatesSql());
  const candidates = aggregateCandidates(sourceRows);

  if (Number(baseline[0]?.empresas_906 || 0) !== 1) {
    fail('Expected exactly one active empresa row for 906 in staging.');
  }
  if (Number(baseline[1]?.funcionarios_906 || 0) < 1) {
    fail('Expected at least one funcionario for empresa 906 in staging.');
  }
  if (candidates.length === 0) {
    fail('No CV SIGVOOS flights found for empresa 906 in the approved window.');
  }
  if (candidates.some((row) => !row.tripulante_id)) {
    fail('At least one synthetic row is missing a tripulante_id.');
  }

  const plan = {
    environment: TARGET_ENV,
    empresaId: TARGET_EMPRESA_ID,
    window: { from: TARGET_FROM, to: TARGET_TO },
    compareUrl: compareReportUrl(),
    baseline: {
      empresas906: Number(baseline[0]?.empresas_906 || 0),
      funcionarios906: Number(baseline[1]?.funcionarios_906 || 0),
      cvVoos906: Number(baseline[2]?.cv_voos_906 || 0),
      frmsSigvoos906: Number(baseline[3]?.frms_sigvoos_906 || 0),
      syntheticActiveRows: Number(baseline[4]?.synthetic_active_rows || 0),
    },
    sourceRows: sourceRows.length,
    candidateJourneyRows: candidates.length,
    candidateSummary: summarizeCandidates(candidates),
  };

  if (args.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    console.log('[seed-frms-sigvoos-comparable-from-cv] dry-run complete');
    return;
  }

  if (args.rollback) {
    const rollback = executeStatements(buildRollbackStatements());
    const after = queryRows(baselineSql());
    console.log(
      JSON.stringify(
        {
          mode: 'rollback',
          rollback,
          after: {
            frmsSigvoos906: Number(after[3]?.frms_sigvoos_906 || 0),
            syntheticActiveRows: Number(after[4]?.synthetic_active_rows || 0),
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const apply = executeStatements(buildUpsertStatements(candidates));
  const after = queryRows(baselineSql());
  const compare = queryRows(compareSummarySql());
  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        plan,
        apply,
        after: {
          frmsSigvoos906: Number(after[3]?.frms_sigvoos_906 || 0),
          syntheticActiveRows: Number(after[4]?.synthetic_active_rows || 0),
        },
        compare: {
          frmsJourneysSigvoos: Number(compare[0]?.frms_journeys_sigvoos || 0),
          byBase: compare.slice(1).filter((row) => Object.hasOwn(row, 'total')),
        },
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(
    `[seed-frms-sigvoos-comparable-from-cv] ERROR: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
