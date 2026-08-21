#!/usr/bin/env node
// Reconcile the d1_migrations ledger entries for migrations 0461, 0462, and 0463.
// These migrations were physically applied to production D1 and their postconditions
// are verified integral. This tool safely records their entries in `d1_migrations`.
//
// Default mode is DRY-RUN: it performs read-only SELECT/PRAGMA checks against the
// target and prints exactly what it WOULD write.
//
// --apply writes ONLY the 3 ledger rows, idempotently, then re-validates.
//
// Usage:
//   node scripts/production/reconcile-0461-0463-ledger.mjs \
//     --config worker-airtrust/wrangler.toml --env production \
//     --backup /tmp/airtrust-production-backups/... \
//     --backup-bytes 227096516 \
//     --backup-sha256 f4543ac0dc8e34e3e53a17f60c337fa998b4014df9fa3fd31423fff3f37c3fe8 \
//     --fk-baseline 525 \
//     [--apply --confirm "I understand this reconciles only the 0461-0463 ledger entries"]
//
// Local rehearsal against a disposable copy: add --local [--persist-to DIR].

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  assertProductionTarget,
  assertCleanMain,
  validateBackup,
  validateMigrationHash,
  resolveProductionTargetFromConfig,
} from './lib/reconcile-gates.mjs';
import { wranglerExecutor } from './lib/executors.mjs';
import {
  reconcile0461To0463,
  RECONCILIATION_TARGET_MIGRATIONS,
} from './lib/ledger-0461-0463-reconciler.mjs';

export const CONFIRM_TEXT_RECONCILE_0461_0463 =
  'I understand this reconciles only the 0461-0463 ledger entries';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

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

function fail(message) {
  console.error(`ERRO: ${message}`);
  process.exit(1);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const apply = args.flags.has('apply');
  const local = args.flags.has('local');
  const remote = !local;

  const configPath = args.opts.config
    ? resolve(String(args.opts.config))
    : join(REPO_ROOT, 'worker-airtrust', 'wrangler.toml');
  const env = args.opts.env ? String(args.opts.env) : 'production';

  console.log('== Reconciliador de ledger das migrations 0461-0463 ==');
  console.log(`Modo: ${apply ? 'APPLY' : 'DRY-RUN'} | conexão: ${remote ? 'remote' : 'local'}`);

  // ---- Gate: production target lock ----
  let target;
  if (remote) {
    target = resolveProductionTargetFromConfig(configPath, env);
    try {
      assertProductionTarget(target);
    } catch (e) {
      fail(`alvo de banco recusado — ${e.message}`);
    }
    console.log(`Alvo confirmado: ${target.database_name} / ${target.database_id}`);
  } else {
    target = { database_name: 'airtrust-db-local', database_id: 'local' };
  }

  // ---- Gate: clean worktree ----
  if (remote) {
    try {
      assertCleanMain({ cwd: REPO_ROOT });
      console.log('worktree limpa e validada');
    } catch (e) {
      // In branch context, check status porcelain
      fail(`estado do git recusado — ${e.message}`);
    }
  }

  // ---- Gate: official backup ----
  if (remote || args.opts.backup) {
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
  }

  // ---- Gate: migration files hashes ----
  for (const m of RECONCILIATION_TARGET_MIGRATIONS) {
    const migPath = join(REPO_ROOT, 'worker-airtrust', 'migrations', m.name);
    try {
      const sha = validateMigrationHash({
        path: migPath,
        expectedSha256: m.expectedSha256,
      });
      console.log(`Migration ${m.name} sha256=${sha.slice(0, 12)}… OK`);
    } catch (e) {
      fail(`migration ${m.name} recusada — ${e.message}`);
    }
  }

  const fkBaseline = args.opts['fk-baseline'] ? Number(args.opts['fk-baseline']) : undefined;

  // ---- Gate: remote apply explicit authorization ----
  if (apply && remote) {
    if (process.env.AIRTRUST_ALLOW_PROD_LEDGER_RECONCILE !== 'YES') {
      fail('para --apply remoto, defina AIRTRUST_ALLOW_PROD_LEDGER_RECONCILE=YES');
    }
    if (String(args.opts.confirm || '') !== CONFIRM_TEXT_RECONCILE_0461_0463) {
      fail(`para --apply, passe --confirm "${CONFIRM_TEXT_RECONCILE_0461_0463}"`);
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

  const result = reconcile0461To0463({
    executor,
    fkCheckBaseline: fkBaseline,
    apply,
  });

  console.log('--- Auditoria Estrutural das Postconditions ---');
  for (const [k, v] of Object.entries(result.audit?.details || {})) {
    console.log(`  Migration ${k}: ${v.state}`);
  }
  console.log('Contagens Iniciais do Ledger:', JSON.stringify(result.initialCounts));
  console.log('Planned Writes:');
  for (const w of result.plannedWrites) {
    console.log(`  ${w}`);
  }

  if (!result.ok) {
    printCommands(commandsRun);
    fail(result.refusedReason || 'reconciliação recusada');
  }

  if (apply) {
    console.log(`Escrita aplicada: ${result.wrote}`);
    console.log('Contagens Finais do Ledger:', JSON.stringify(result.finalCounts));
    console.log(`Foreign Key Check: ${result.fkCheck} violações`);
  } else {
    console.log('DRY-RUN: nenhuma escrita realizada.');
  }

  printCommands(commandsRun);
  return result;
}

function printCommands(commandsRun) {
  console.log(
    `--- Comandos wrangler executados (${commandsRun.length}) ---`,
  );
  for (const c of commandsRun) console.log(`  ${c}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
