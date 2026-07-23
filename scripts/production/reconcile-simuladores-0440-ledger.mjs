#!/usr/bin/env node
// Reconcile the d1_migrations ledger entry for migration
// 0440_simuladores_matriz_versionada_metadata.sql, which was physically applied
// to production D1 via `wrangler d1 execute --remote --file` (raw SQL, which
// does NOT update the ledger). This tool is the ONLY authorized way to record
// that entry; there is no loose manual-SQL path.
//
// Default mode is DRY-RUN: it performs read-only SELECT/PRAGMA against the
// target and prints exactly the single ledger row it WOULD write. It performs
// no writes at all in dry-run.
//
// --apply writes ONLY that one row, idempotently, then re-validates.
//
// Usage:
//   node scripts/production/reconcile-simuladores-0440-ledger.mjs \
//     --config worker-airtrust/wrangler.toml --env production \
//     --backup /abs/path/to/backup.sql \
//     --backup-bytes <bytes> \
//     --backup-sha256 <hex> \
//     --fk-baseline 525 \
//     [--migration-sha256 <hex>] \
//     [--apply --confirm "I understand this reconciles only the 0440 ledger entry"]
//
// Local rehearsal against a disposable copy: add --local [--persist-to DIR].

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  assertProductionTarget,
  assertCleanMain,
  validateBackup,
  validateMigrationHash,
  CONFIRM_TEXT_RECONCILE,
} from './lib/reconcile-gates.mjs';
import { wranglerExecutor } from './lib/executors.mjs';
import {
  reconcile,
  ledgerHasEntry,
  LEDGER_ENTRY_NAME,
} from './lib/simuladores-0440-ledger-reconciler.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const MIGRATION_PATH = join(
  REPO_ROOT,
  'worker-airtrust',
  'migrations',
  '0440_simuladores_matriz_versionada_metadata.sql',
);

function parseArgs(argv) {
  const args = { flags: new Set(), opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply' || a === '--local' || a === '--remote') {
      args.flags.add(a.slice(2));
    } else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args.opts[key] = true;
      } else {
        args.opts[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

/**
 * Parse the production D1 target (name + id) directly from the wrangler config,
 * for the given env. Never trusts free-form CLI input for identity.
 */
export function resolveProductionTargetFromConfig(configPath, env = 'production') {
  const text = readFileSync(configPath, 'utf8');
  const header = `[[env.${env}.d1_databases]]`;
  const idx = text.indexOf(header);
  if (idx < 0) {
    throw new Error(`bloco ${header} não encontrado em ${configPath}`);
  }
  const section = text.slice(idx + header.length, idx + header.length + 600);
  const name = (section.match(/database_name\s*=\s*"([^"]+)"/) || [])[1];
  const id = (section.match(/database_id\s*=\s*"([^"]+)"/) || [])[1];
  if (!name || !id) {
    throw new Error(`não foi possível ler database_name/database_id em ${header}`);
  }
  return { database_name: name, database_id: id };
}

function fail(message) {
  console.error(`ERRO: ${message}`);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.flags.has('apply');
  const local = args.flags.has('local');
  const remote = !local; // default remote

  const configPath = args.opts.config
    ? resolve(String(args.opts.config))
    : join(REPO_ROOT, 'worker-airtrust', 'wrangler.toml');
  const env = args.opts.env ? String(args.opts.env) : 'production';

  console.log('== Reconciliador de ledger da migration 0440 ==');
  console.log(`Modo: ${apply ? 'APPLY' : 'DRY-RUN'} | conexão: ${remote ? 'remote' : 'local'}`);

  // ---- Gate: production target lock (from real config) ----
  const target = resolveProductionTargetFromConfig(configPath, env);
  try {
    assertProductionTarget(target);
  } catch (e) {
    fail(`alvo de banco recusado — ${e.message}`);
  }
  console.log(`Alvo confirmado: ${target.database_name} / ${target.database_id}`);

  // ---- Gate: clean main == origin/main ----
  try {
    const gitState = assertCleanMain({ cwd: REPO_ROOT });
    console.log(`main limpa em ${gitState.head}`);
  } catch (e) {
    fail(`estado do git recusado — ${e.message}`);
  }

  // ---- Gate: official backup (outside git) ----
  try {
    const b = validateBackup({
      path: args.opts.backup ? String(args.opts.backup) : undefined,
      expectedBytes: args.opts['backup-bytes'] ? Number(args.opts['backup-bytes']) : undefined,
      expectedSha256: args.opts['backup-sha256'] ? String(args.opts['backup-sha256']) : undefined,
    });
    console.log(`Backup validado: ${b.bytes} bytes, sha256=${b.sha256.slice(0, 12)}…`);
  } catch (e) {
    fail(`backup recusado — ${e.message}`);
  }

  // ---- Gate: migration file hash ----
  let migrationSql;
  try {
    migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
    const sha = validateMigrationHash({
      path: MIGRATION_PATH,
      expectedSha256: args.opts['migration-sha256']
        ? String(args.opts['migration-sha256'])
        : undefined,
    });
    console.log(`Migration 0440 sha256=${sha}`);
  } catch (e) {
    fail(`migration recusada — ${e.message}`);
  }

  const fkBaseline = args.opts['fk-baseline'] ? Number(args.opts['fk-baseline']) : undefined;
  if (fkBaseline === undefined) {
    fail('--fk-baseline é obrigatório (baseline reportado de foreign_key_check, ex: 525)');
  }

  if (apply) {
    if (String(args.opts.confirm || '') !== CONFIRM_TEXT_RECONCILE) {
      fail(`para --apply, passe --confirm "${CONFIRM_TEXT_RECONCILE}"`);
    }
  }

  const commandsRun = [];
  const executor = wranglerExecutor({
    database: target.database_name,
    config: configPath,
    remote,
    env: remote ? env : undefined,
    persistTo: args.opts['persist-to'] ? String(args.opts['persist-to']) : undefined,
    allowWrites: apply,
    cwd: join(REPO_ROOT, 'worker-airtrust'),
    onCommand: (cmd, cmdArgs) => commandsRun.push(`${cmd} ${cmdArgs.join(' ')}`),
  });

  // ---- Gate: 0440 must be absent from the ledger ----
  if (ledgerHasEntry(executor, LEDGER_ENTRY_NAME)) {
    console.log(
      `Ledger já contém ${LEDGER_ENTRY_NAME}. Nada a reconciliar; execução idempotente encerrada.`,
    );
    printCommands(commandsRun);
    process.exit(0);
  }

  const result = reconcile({ executor, migrationSql, fkCheckBaseline: fkBaseline, apply });

  console.log('--- Resultado da auditoria estrutural ---');
  console.log(`Estado 0440: ${result.auditState}`);
  if (result.auditConflicts.length) {
    console.log('Conflitos:', result.auditConflicts);
  }
  if (result.auditMissing.length) {
    console.log('Faltando:', result.auditMissing);
  }
  console.log('Ledger schema:', result.ledgerSchema.join(', '));
  console.log('plannedWrites:');
  for (const w of result.plannedWrites) console.log(`  ${w}`);

  if (!result.ok) {
    printCommands(commandsRun);
    fail(result.refusedReason || 'reconciliação recusada');
  }

  if (apply) {
    console.log(`Escrita aplicada: ${result.wrote}`);
    console.log(`Ledger contém 0440 após escrita: ${result.ledgerHasEntryAfter}`);
    console.log(`Revalidação da auditoria: ${result.revalidatedState}`);
  } else {
    console.log('DRY-RUN: nenhuma escrita realizada.');
  }
  printCommands(commandsRun);
  process.exit(0);
}

function printCommands(commandsRun) {
  console.log(
    `--- Comandos wrangler executados (${commandsRun.length}, todos read-only em dry-run) ---`,
  );
  for (const c of commandsRun) console.log(`  ${c}`);
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
