import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sqliteExecutor } from '../production/lib/executors.mjs';
import {
  auditPostconditions,
  reconcile0461To0463,
  RECONCILIATION_TARGET_MIGRATIONS,
} from '../production/lib/ledger-0461-0463-reconciler.mjs';

const BACKUP_PATH = '/tmp/airtrust-production-backups/airtrust-db-production-backup-20260821T125942Z-92311.sql';
const EXPECTED_SHA256 = 'f4543ac0dc8e34e3e53a17f60c337fa998b4014df9fa3fd31423fff3f37c3fe8';
const EXPECTED_BYTES = 227096516;
const REHEARSAL_DIR = '/tmp/airtrust-rehearsal-0461-0463';
const REHEARSAL_DB = join(REHEARSAL_DIR, 'rehearsal.sqlite');

function computeSha256(filePath) {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

async function runRehearsal() {
  console.log('=== INICIANDO ENSAIO NO BACKUP REAL DE PRODUÇÃO ===');

  // 1. Validar Hash e Bytes do Backup
  console.log('1. Validando integridade do backup...');
  if (!existsSync(BACKUP_PATH)) {
    throw new Error(`Backup file not found at ${BACKUP_PATH}`);
  }
  const stat = statSync(BACKUP_PATH);
  console.log(`   Bytes: ${stat.size} (esperado ${EXPECTED_BYTES})`);
  if (stat.size !== EXPECTED_BYTES) throw new Error('Backup size mismatch');

  const sha = computeSha256(BACKUP_PATH);
  console.log(`   SHA-256: ${sha}`);
  if (sha.toLowerCase() !== EXPECTED_SHA256.toLowerCase()) {
    throw new Error('Backup SHA-256 mismatch');
  }
  console.log('   Validação do backup: PASS');

  // 2. Restaurar backup em banco SQLite descartável
  console.log('2. Restaurando backup no SQLite descartável...');
  rmSync(REHEARSAL_DIR, { recursive: true, force: true });
  mkdirSync(REHEARSAL_DIR, { recursive: true });

  execSync(`sqlite3 "${REHEARSAL_DB}" < "${BACKUP_PATH}"`, { stdio: 'inherit' });
  console.log('   Restauração do backup concluída.');

  const executor = sqliteExecutor(REHEARSAL_DB);

  // 3. Aplicar DDLs das migrations 0461, 0462, 0463 no clone (simulando estado pós-release)
  console.log('3. Aplicando DDLs físicas das migrações 0461-0463 no clone...');
  const mig0461 = readFileSync('worker-airtrust/migrations/0461_refresh_tokens_empresa_id.sql', 'utf8');
  const mig0462 = readFileSync('worker-airtrust/migrations/0462_qualificacoes_tipos_codigo_tenant_active_unique.sql', 'utf8');
  const mig0463 = readFileSync('worker-airtrust/migrations/0463_frms_iogp_schema_v2.sql', 'utf8');

  executor.exec(mig0461);
  executor.exec(mig0462);
  executor.exec(mig0463);
  console.log('   DDLs aplicadas no clone.');

  // 4. Capturar estado de todas as tabelas de negócio antes da reconciliação
  console.log('4. Capturando estado de todas as tabelas antes da reconciliação...');
  const allTables = executor.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' ORDER BY name"
  ).map((t) => t.name);

  const countsBefore = {};
  for (const t of allTables) {
    const r = executor.query(`SELECT COUNT(*) AS c FROM "${t}"`);
    countsBefore[t] = r[0]?.c ?? 0;
  }
  console.log(`   Contagens de negócio capturadas para ${allTables.length} tabelas.`);

  const schemaBefore = executor.query(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' ORDER BY name"
  );

  const initialLedger = executor.query('SELECT name FROM d1_migrations');
  console.log(`   Ledger inicial: ${initialLedger.length} entradas`);

  // 5. Executar reconciliador em DRY-RUN
  console.log('5. Executando reconciliador em DRY-RUN...');
  const dryResult = reconcile0461To0463({
    executor,
    apply: false,
  });
  console.log('   Dry-run OK:', dryResult.ok);
  console.log('   Planned writes:', dryResult.plannedWrites);
  if (!dryResult.ok || dryResult.plannedWrites.length !== 3) {
    throw new Error('Dry-run should plan exactly 3 writes');
  }

  // 6. Executar reconciliador com APPLY
  console.log('6. Executando reconciliador com APPLY...');
  const applyResult = reconcile0461To0463({
    executor,
    apply: true,
  });
  console.log('   Apply OK:', applyResult.ok);
  console.log('   Wrote:', applyResult.wrote);
  console.log('   Final Counts:', JSON.stringify(applyResult.finalCounts));
  if (!applyResult.ok || !applyResult.wrote) {
    throw new Error(`Apply failed: ${applyResult.refusedReason}`);
  }

  // 7. Validar deltas
  console.log('7. Validando deltas e integridade...');
  const finalLedger = executor.query('SELECT name FROM d1_migrations');
  const ledgerDelta = finalLedger.length - initialLedger.length;
  console.log(`   Ledger Delta: +${ledgerDelta} (esperado +3)`);
  if (ledgerDelta !== 3) throw new Error(`Ledger delta mismatch: ${ledgerDelta}`);

  for (const m of RECONCILIATION_TARGET_MIGRATIONS) {
    const c = applyResult.finalCounts[m.name];
    if (c !== 1) throw new Error(`Expected count 1 for ${m.name}, got ${c}`);
  }

  // Business tables counts delta
  let businessRowDelta = 0;
  for (const t of allTables) {
    const r = executor.query(`SELECT COUNT(*) AS c FROM "${t}"`);
    const cAfter = r[0]?.c ?? 0;
    const diff = cAfter - countsBefore[t];
    if (diff !== 0) {
      console.error(`Business table ${t} changed by ${diff} rows!`);
      businessRowDelta += Math.abs(diff);
    }
  }
  console.log(`   Business Table Row Delta: ${businessRowDelta} (esperado 0 across ${allTables.length} tables)`);
  if (businessRowDelta !== 0) throw new Error('Business data rows were altered!');

  // Schema Delta (excluding d1_migrations data)
  const schemaAfter = executor.query(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' ORDER BY name"
  );
  if (JSON.stringify(schemaBefore) !== JSON.stringify(schemaAfter)) {
    throw new Error('Schema was altered outside d1_migrations!');
  }
  console.log('   Schema Delta: 0 (schema 100% idêntico)');

  // PRAGMA integrity_check
  const integrity = executor.query('PRAGMA integrity_check');
  console.log('   PRAGMA integrity_check:', integrity[0]?.integrity_check);
  if (integrity[0]?.integrity_check !== 'ok') throw new Error('Integrity check failed');

  // PRAGMA foreign_key_check
  const fkCheck = executor.query('PRAGMA foreign_key_check') || [];
  console.log(`   PRAGMA foreign_key_check: ${fkCheck.length} violations`);

  // 8. Testar Reexecução (Idempotência / Fail-Closed)
  console.log('8. Testando reexecução no clone reconciliado...');
  const secondRun = reconcile0461To0463({
    executor,
    apply: true,
  });
  console.log('   Second Run OK:', secondRun.ok);
  console.log('   Second Run Wrote:', secondRun.wrote);
  console.log('   Second Run Final Counts:', JSON.stringify(secondRun.finalCounts));
  if (secondRun.wrote !== false) {
    throw new Error('Second run should not perform any writes!');
  }

  const ledgerAfterSecondRun = executor.query('SELECT name FROM d1_migrations');
  if (ledgerAfterSecondRun.length !== finalLedger.length) {
    throw new Error('Second run added unexpected ledger rows!');
  }
  console.log('   Segunda execução confirmada: FAIL-CLOSED / ALREADY RECONCILED (0 novas escritas)');

  // Limpeza
  rmSync(REHEARSAL_DIR, { recursive: true, force: true });
  console.log('=== ENSAIO NO BACKUP REAL CONCLUÍDO COM 100% DE SUCESSO ===');
}

runRehearsal().catch((err) => {
  console.error('REHEARSAL FAILED:', err);
  process.exit(1);
});
