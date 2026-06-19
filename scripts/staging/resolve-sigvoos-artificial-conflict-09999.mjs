#!/usr/bin/env node

// source_reference: derived from synthetic tenant 906 staging SIGVOOS conflict row id 2 and stage row cvsig-906-0440d2fd9acd914f64378afba2b817452568737a0f2bd7b84c0ee87d62148ee2 only.
// operational_decision: resolve only the artificial missing-inscription conflict 09999 in staging by creating a synthetic funcionario and corresponding cv_voo_tripulantes row.
// dry_run_required: use --dry-run before --apply to confirm the current conflict state and target rows.
// rollback_plan_required: use --rollback with explicit confirmation to reopen the conflict and soft-delete only the synthetic rows created by this script.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const WORKER_ROOT = path.join(ROOT, 'worker-airtrust');
const TARGET_ENV = 'staging';
const EXPECTED_STAGING_DB_ID = 'b7f50907-c110-45f5-ad17-e97ea47f2826';
const TARGET_EMPRESA_ID = 906;
const TARGET_CONFLICT_ID = 2;
const TARGET_STAGE_ID = 'cvsig-906-0440d2fd9acd914f64378afba2b817452568737a0f2bd7b84c0ee87d62148ee2';
const TARGET_VOO_ID = 906605;
const TARGET_FUNCIONARIO_ID = 906005;
const TARGET_MATRICULA = '09999';
const TARGET_FUNCIONARIO_NOME = 'Tripulante Sintetico 90605';
const OBS_MARKER = 'STAGING_SIGVOOS_CONFLICT_09999_RESOLUTION';
const APPLY_CONFIRM = 'YES_RESOLVE_STAGING_SIGVOOS_CONFLICT_09999';
const ROLLBACK_CONFIRM = 'YES_ROLLBACK_STAGING_SIGVOOS_CONFLICT_09999';

function fail(message) {
  throw new Error(message);
}

function usage() {
  return [
    'Usage:',
    '  node scripts/staging/resolve-sigvoos-artificial-conflict-09999.mjs --dry-run',
    `  node scripts/staging/resolve-sigvoos-artificial-conflict-09999.mjs --apply --confirm-apply ${APPLY_CONFIRM}`,
    `  node scripts/staging/resolve-sigvoos-artificial-conflict-09999.mjs --rollback --confirm-rollback ${ROLLBACK_CONFIRM}`,
    '',
    'Safety:',
    `  - hard-coded to env=${TARGET_ENV}, empresa_id=${TARGET_EMPRESA_ID}, conflict_id=${TARGET_CONFLICT_ID}`,
    `  - aborts unless worker-airtrust/wrangler.toml staging DB id is ${EXPECTED_STAGING_DB_ID}`,
    '  - creates only synthetic staging rows marked for rollback',
    '  - no production path',
    '  - no physical DELETE',
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
  if (modes !== 1) throw new Error('Choose exactly one of --dry-run, --apply or --rollback.');
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

function queryStatements(sql) {
  return runWranglerJson(['d1', 'execute', 'DB', '--remote', '--env', TARGET_ENV, '--json', '--command', sql]);
}

function executeStatements(statements) {
  if (statements.length === 0) return { changes: 0, batches: 0 };
  const payload = runWranglerJson([
    'd1',
    'execute',
    'DB',
    '--remote',
    '--env',
    TARGET_ENV,
    '--json',
    '--command',
    statements.join('\n'),
  ]);
  let changes = 0;
  for (const entry of payload) changes += Number(entry.meta?.changes || 0);
  return { changes, batches: 1 };
}

function baselineSql() {
  return `
    SELECT id, status, justificativa, resolvido_em, decisao
      FROM cv_conflitos_integracao
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND id = ${TARGET_CONFLICT_ID}
       AND deleted_at IS NULL;
    SELECT id, import_status, cv_voo_id, cv_etapa_id, cv_tripulante_id, payload_hash
      FROM cv_sigvoos_staging
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND id = ${q(TARGET_STAGE_ID)}
       AND deleted_at IS NULL;
    SELECT id, nome, matricula, deleted_at
      FROM funcionarios
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND id = ${TARGET_FUNCIONARIO_ID};
    SELECT id, funcionario_id, voo_id, etapa_id, sigvoos_staff_inscription, deleted_at
      FROM cv_voo_tripulantes
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND voo_id = ${TARGET_VOO_ID}
       AND funcionario_id = ${TARGET_FUNCIONARIO_ID};
    SELECT COUNT(*) AS open_conflicts
      FROM cv_conflitos_integracao
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND deleted_at IS NULL
       AND status = 'ABERTO';
  `;
}

function loadState() {
  const statements = queryStatements(baselineSql());
  return {
    conflict: statements[0]?.results?.[0] || null,
    stage: statements[1]?.results?.[0] || null,
    funcionario: statements[2]?.results?.[0] || null,
    tripulante: statements[3]?.results?.[0] || null,
    openConflicts: Number(statements[4]?.results?.[0]?.open_conflicts || 0),
  };
}

function buildApplyStatements(state) {
  const tripulanteComment = `${OBS_MARKER};conflict_id=${TARGET_CONFLICT_ID};stage_id=${TARGET_STAGE_ID};matricula=${TARGET_MATRICULA}`;
  if (!state.stage || Number(state.stage.cv_voo_id || 0) !== TARGET_VOO_ID) {
    fail('Expected target staging row to point to voo 906605.');
  }
  if (!state.conflict || state.conflict.status !== 'ABERTO') {
    fail('Expected conflict row 2 to be open before apply.');
  }
  if (state.conflict.justificativa !== 'funcionario nao resolvido por staff.id ou staff.inscription') {
    fail('Unexpected conflict justification for conflict row 2.');
  }

  const etapaId = Number(state.stage.cv_etapa_id || 0);
  if (!etapaId) fail('Expected target staging row to have cv_etapa_id.');
  const payloadHash = state.stage.payload_hash || null;

  return [
    `
      INSERT INTO funcionarios (
        id, nome, matricula, cargo, funcao, observacoes, ativo, empresa_id, created_at, updated_at, deleted_at
      ) VALUES (
        ${TARGET_FUNCIONARIO_ID}, ${q(TARGET_FUNCIONARIO_NOME)}, ${q(TARGET_MATRICULA)}, 'SINTETICO', 'OUTRO',
        ${q(OBS_MARKER)}, 1, ${TARGET_EMPRESA_ID}, datetime('now'), datetime('now'), NULL
      )
      ON CONFLICT(id) DO UPDATE SET
        nome = excluded.nome,
        matricula = excluded.matricula,
        cargo = excluded.cargo,
        funcao = excluded.funcao,
        observacoes = excluded.observacoes,
        ativo = 1,
        empresa_id = excluded.empresa_id,
        updated_at = datetime('now'),
        deleted_at = NULL;
    `,
    `
      INSERT INTO cv_voo_tripulantes (
        empresa_id, voo_id, funcionario_id, funcao, horario_apresentacao, horario_dispensa,
        observacoes, created_by, updated_by, etapa_id, sigvoos_staff_id, sigvoos_staff_inscription,
        funcao_origem, resolucao_funcionario_fonte, sigvoos_content_hash, created_at, updated_at, deleted_at
      )
      SELECT
        ${TARGET_EMPRESA_ID}, ${TARGET_VOO_ID}, ${TARGET_FUNCIONARIO_ID}, 'OUTRO', NULL, NULL,
        ${q(tripulanteComment)}, NULL, NULL, ${etapaId}, NULL, ${q(TARGET_MATRICULA)},
        NULL, 'STAFF_INSCRIPTION', ${q(payloadHash)}, datetime('now'), datetime('now'), NULL
      WHERE NOT EXISTS (
        SELECT 1
          FROM cv_voo_tripulantes
         WHERE empresa_id = ${TARGET_EMPRESA_ID}
           AND voo_id = ${TARGET_VOO_ID}
           AND funcionario_id = ${TARGET_FUNCIONARIO_ID}
           AND deleted_at IS NULL
      );
    `,
    `
      UPDATE cv_conflitos_integracao
         SET status = 'IGNORADO',
             decisao = 'IGNORAR',
             justificativa = ${q(`${OBS_MARKER};synthetic funcionario created for matricula 09999`)},
             resolvido_em = datetime('now'),
             updated_at = datetime('now')
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND id = ${TARGET_CONFLICT_ID}
         AND deleted_at IS NULL;
    `,
    `
      UPDATE cv_sigvoos_staging
         SET import_status = 'PROCESSED',
             cv_tripulante_id = (
               SELECT id
                 FROM cv_voo_tripulantes
                WHERE empresa_id = ${TARGET_EMPRESA_ID}
                  AND voo_id = ${TARGET_VOO_ID}
                  AND funcionario_id = ${TARGET_FUNCIONARIO_ID}
                  AND deleted_at IS NULL
                ORDER BY id DESC
                LIMIT 1
             ),
             erro_msg = NULL,
             processado_em = datetime('now'),
             updated_at = datetime('now')
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND id = ${q(TARGET_STAGE_ID)}
         AND deleted_at IS NULL;
    `,
  ];
}

function buildRollbackStatements() {
  return [
    `
      UPDATE cv_voo_tripulantes
         SET deleted_at = datetime('now'),
             updated_at = datetime('now')
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND voo_id = ${TARGET_VOO_ID}
         AND funcionario_id = ${TARGET_FUNCIONARIO_ID}
         AND deleted_at IS NULL
         AND observacoes = ${q(`${OBS_MARKER};conflict_id=${TARGET_CONFLICT_ID};stage_id=${TARGET_STAGE_ID};matricula=${TARGET_MATRICULA}`)};
    `,
    `
      UPDATE funcionarios
         SET deleted_at = datetime('now'),
             ativo = 0,
             updated_at = datetime('now')
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND id = ${TARGET_FUNCIONARIO_ID}
         AND deleted_at IS NULL
         AND observacoes = ${q(OBS_MARKER)};
    `,
    `
      UPDATE cv_conflitos_integracao
         SET status = 'ABERTO',
             decisao = NULL,
             justificativa = 'funcionario nao resolvido por staff.id ou staff.inscription',
             resolvido_em = NULL,
             updated_at = datetime('now')
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND id = ${TARGET_CONFLICT_ID}
         AND deleted_at IS NULL;
    `,
    `
      UPDATE cv_sigvoos_staging
         SET import_status = 'CONFLICT',
             cv_tripulante_id = NULL,
             updated_at = datetime('now')
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND id = ${q(TARGET_STAGE_ID)}
         AND deleted_at IS NULL;
    `,
  ];
}

function summarizeState(state) {
  return {
    environment: TARGET_ENV,
    empresaId: TARGET_EMPRESA_ID,
    conflictId: TARGET_CONFLICT_ID,
    stageId: TARGET_STAGE_ID,
    vooId: TARGET_VOO_ID,
    syntheticFuncionarioId: TARGET_FUNCIONARIO_ID,
    openConflicts: state.openConflicts,
    conflictStatus: state.conflict?.status || null,
    stageStatus: state.stage?.import_status || null,
    syntheticFuncionarioActive: Boolean(state.funcionario && state.funcionario.deleted_at == null),
    syntheticTripulanteActive: Boolean(state.tripulante && state.tripulante.deleted_at == null),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureExpectedStagingDbBinding();
  const before = loadState();

  if (args.dryRun) {
    console.log(JSON.stringify({ mode: 'dry-run', before: summarizeState(before) }, null, 2));
    return;
  }

  if (args.rollback) {
    const rollback = executeStatements(buildRollbackStatements());
    const after = loadState();
    console.log(JSON.stringify({ mode: 'rollback', rollback, after: summarizeState(after) }, null, 2));
    return;
  }

  const apply = executeStatements(buildApplyStatements(before));
  const after = loadState();
  console.log(JSON.stringify({ mode: 'apply', apply, after: summarizeState(after) }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(
    `[resolve-sigvoos-artificial-conflict-09999] ERROR: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
