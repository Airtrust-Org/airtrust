#!/usr/bin/env node

// source_reference: derived from synthetic tenant 906 support seed in sigvoos-staging-remote-validation.ts and from the single open conflict row id 1 in staging.
// operational_decision: resolve only the synthetic staff.id/staff.inscription conflict 8899/01234 in staging by correcting the seeded historical mapping and materializing the missing tripulante row.
// dry_run_required: use --dry-run before --apply to confirm that the target conflict still matches the expected synthetic shape.
// rollback_plan_required: use --rollback with explicit confirmation to restore the seeded stale mapping and reopen the conflict.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const WORKER_ROOT = path.join(ROOT, 'worker-airtrust');
const TARGET_ENV = 'staging';
const EXPECTED_STAGING_DB_ID = 'b7f50907-c110-45f5-ad17-e97ea47f2826';
const TARGET_EMPRESA_ID = 906;
const TARGET_CONFLICT_ID = 1;
const TARGET_STAGE_ID = 'cvsig-906-585f1da671ec5af9914b46b06f08a484b50403ca42dd7b453abed1610b61439b';
const TARGET_STAGE_HASH = '585f1da671ec5af9914b46b06f08a484b50403ca42dd7b453abed1610b61439b';
const TARGET_VOO_ID = 906604;
const TARGET_ETAPA_ID = 906615;
const TARGET_FUNCIONARIO_ID = 906001;
const STALE_MAPPING_TRIPULANTE_ID = 906620;
const STALE_MAPPING_ORIGINAL_FUNCIONARIO_ID = 906002;
const STALE_MAPPING_VOO_ID = 906600;
const TARGET_STAFF_ID = 8899;
const TARGET_STAFF_INSCRIPTION = '01234';
const TARGET_FUNCAO = 'PIC';
const OBS_MARKER = 'STAGING_SIGVOOS_SYNTHETIC_CONFLICT_8899_RECONCILIATION';
const APPLY_CONFIRM = 'YES_RECONCILE_STAGING_SIGVOOS_SYNTHETIC_CONFLICT_8899';
const ROLLBACK_CONFIRM = 'YES_ROLLBACK_STAGING_SIGVOOS_SYNTHETIC_CONFLICT_8899';

function fail(message) {
  throw new Error(message);
}

function usage() {
  return [
    'Usage:',
    '  node scripts/staging/reconcile-sigvoos-synthetic-staff-conflict-8899.mjs --dry-run',
    `  node scripts/staging/reconcile-sigvoos-synthetic-staff-conflict-8899.mjs --apply --confirm-apply ${APPLY_CONFIRM}`,
    `  node scripts/staging/reconcile-sigvoos-synthetic-staff-conflict-8899.mjs --rollback --confirm-rollback ${ROLLBACK_CONFIRM}`,
    '',
    'Safety:',
    `  - hard-coded to env=${TARGET_ENV}, empresa_id=${TARGET_EMPRESA_ID}, conflict_id=${TARGET_CONFLICT_ID}`,
    `  - aborts unless worker-airtrust/wrangler.toml staging DB id is ${EXPECTED_STAGING_DB_ID}`,
    '  - touches only the single synthetic stale mapping row and the single conflict stage row',
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
    SELECT id, status, decisao, justificativa, staging_id, valor_sigvoos
      FROM cv_conflitos_integracao
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND id = ${TARGET_CONFLICT_ID}
       AND deleted_at IS NULL;
    SELECT id, import_status, cv_voo_id, cv_etapa_id, cv_tripulante_id, sigvoos_staff_id, payload_hash
      FROM cv_sigvoos_staging
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND id = ${q(TARGET_STAGE_ID)}
       AND deleted_at IS NULL;
    SELECT id, voo_id, etapa_id, funcionario_id, funcao, sigvoos_staff_id, sigvoos_staff_inscription,
           resolucao_funcionario_fonte, observacoes, deleted_at
      FROM cv_voo_tripulantes
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND id = ${STALE_MAPPING_TRIPULANTE_ID};
    SELECT id, voo_id, etapa_id, funcionario_id, funcao, sigvoos_staff_id, sigvoos_staff_inscription,
           resolucao_funcionario_fonte, observacoes, deleted_at
      FROM cv_voo_tripulantes
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND voo_id = ${TARGET_VOO_ID}
       AND etapa_id = ${TARGET_ETAPA_ID}
       AND sigvoos_staff_id = ${TARGET_STAFF_ID}
       AND deleted_at IS NULL
     ORDER BY id DESC
     LIMIT 1;
    SELECT COUNT(*) AS open_conflicts
      FROM cv_conflitos_integracao
     WHERE empresa_id = ${TARGET_EMPRESA_ID}
       AND status = 'ABERTO'
       AND deleted_at IS NULL;
  `;
}

function loadState() {
  const statements = queryStatements(baselineSql());
  return {
    conflict: statements[0]?.results?.[0] || null,
    stage: statements[1]?.results?.[0] || null,
    staleMapping: statements[2]?.results?.[0] || null,
    targetTripulante: statements[3]?.results?.[0] || null,
    openConflicts: Number(statements[4]?.results?.[0]?.open_conflicts || 0),
  };
}

function assertExpectedSyntheticShape(state) {
  if (!state.conflict || state.conflict.status !== 'ABERTO') {
    fail('Expected target conflict row to be open.');
  }
  if (!state.stage || state.stage.import_status !== 'CONFLICT') {
    fail('Expected target staging row to be in CONFLICT status.');
  }
  if (Number(state.stage.cv_voo_id || 0) !== TARGET_VOO_ID || Number(state.stage.cv_etapa_id || 0) !== TARGET_ETAPA_ID) {
    fail('Unexpected staging row target linkage.');
  }
  if (state.stage.payload_hash !== TARGET_STAGE_HASH) {
    fail('Unexpected staging payload hash.');
  }
  if (!state.staleMapping || Number(state.staleMapping.voo_id || 0) !== STALE_MAPPING_VOO_ID) {
    fail('Expected synthetic stale mapping row to exist.');
  }
  if (Number(state.staleMapping.funcionario_id || 0) !== STALE_MAPPING_ORIGINAL_FUNCIONARIO_ID) {
    fail('Synthetic stale mapping row no longer points to the expected seeded funcionario.');
  }
}

function buildApplyStatements(state) {
  assertExpectedSyntheticShape(state);

  return [
    `
      UPDATE cv_voo_tripulantes
         SET funcionario_id = ${TARGET_FUNCIONARIO_ID},
             sigvoos_staff_inscription = ${q(TARGET_STAFF_INSCRIPTION)},
             resolucao_funcionario_fonte = 'STAFF_INSCRIPTION',
             observacoes = ${q(OBS_MARKER)},
             updated_at = datetime('now')
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND id = ${STALE_MAPPING_TRIPULANTE_ID}
         AND deleted_at IS NULL;
    `,
    `
      INSERT INTO cv_voo_tripulantes (
        empresa_id, voo_id, funcionario_id, funcao, horario_apresentacao, horario_dispensa,
        observacoes, created_by, updated_by, etapa_id, sigvoos_staff_id, sigvoos_staff_inscription,
        funcao_origem, resolucao_funcionario_fonte, sigvoos_content_hash, created_at, updated_at, deleted_at
      )
      SELECT
        ${TARGET_EMPRESA_ID}, ${TARGET_VOO_ID}, ${TARGET_FUNCIONARIO_ID}, ${q(TARGET_FUNCAO)}, NULL, NULL,
        ${q(OBS_MARKER)}, NULL, NULL, ${TARGET_ETAPA_ID}, ${TARGET_STAFF_ID}, ${q(TARGET_STAFF_INSCRIPTION)},
        ${q(TARGET_FUNCAO)}, 'STAFF_INSCRIPTION', ${q(TARGET_STAGE_HASH)}, datetime('now'), datetime('now'), NULL
      WHERE NOT EXISTS (
        SELECT 1
          FROM cv_voo_tripulantes
         WHERE empresa_id = ${TARGET_EMPRESA_ID}
           AND voo_id = ${TARGET_VOO_ID}
           AND etapa_id = ${TARGET_ETAPA_ID}
           AND sigvoos_staff_id = ${TARGET_STAFF_ID}
           AND deleted_at IS NULL
      );
    `,
    `
      UPDATE cv_conflitos_integracao
         SET status = 'IGNORADO',
             decisao = 'IGNORAR',
             justificativa = ${q(`${OBS_MARKER};synthetic stale mapping corrected in staging`)},
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
                  AND etapa_id = ${TARGET_ETAPA_ID}
                  AND sigvoos_staff_id = ${TARGET_STAFF_ID}
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
         AND etapa_id = ${TARGET_ETAPA_ID}
         AND sigvoos_staff_id = ${TARGET_STAFF_ID}
         AND deleted_at IS NULL
         AND observacoes = ${q(OBS_MARKER)};
    `,
    `
      UPDATE cv_voo_tripulantes
         SET funcionario_id = ${STALE_MAPPING_ORIGINAL_FUNCIONARIO_ID},
             sigvoos_staff_inscription = NULL,
             resolucao_funcionario_fonte = NULL,
             observacoes = NULL,
             updated_at = datetime('now')
       WHERE empresa_id = ${TARGET_EMPRESA_ID}
         AND id = ${STALE_MAPPING_TRIPULANTE_ID}
         AND deleted_at IS NULL;
    `,
    `
      UPDATE cv_conflitos_integracao
         SET status = 'ABERTO',
             decisao = NULL,
             justificativa = 'staff.id e staff.inscription resolvidos para funcionarios diferentes',
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
    conflictStatus: state.conflict?.status || null,
    conflictDecision: state.conflict?.decisao || null,
    stageId: TARGET_STAGE_ID,
    stageStatus: state.stage?.import_status || null,
    stageTripulanteLinked: Boolean(state.stage?.cv_tripulante_id),
    staleMappingFuncionarioId: Number(state.staleMapping?.funcionario_id || 0) || null,
    staleMappingHasInscription: Boolean(state.staleMapping?.sigvoos_staff_inscription),
    targetTripulanteId: Number(state.targetTripulante?.id || 0) || null,
    openConflicts: state.openConflicts,
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
