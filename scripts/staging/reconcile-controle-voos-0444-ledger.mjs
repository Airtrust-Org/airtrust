#!/usr/bin/env node

// source_reference: reconcilia SOMENTE a entrada da migration 0444
// (controle_voos_versao) no ledger d1_migrations de staging. O schema real
// (coluna cv_voos.versao) ja foi aplicado por wrangler d1 execute --file em
// sessao anterior; este script so fecha o registro no ledger, depois de
// reverificar que o schema real corresponde exatamente ao que 0444 produz.
// operational_decision: nao tenta resolver o drift historico do ledger
// (gaps 0001-0420, 0424-0436) — escopo estrito de uma unica entrada, por
// pedido explicito. Recusa (exit != 0, nenhuma escrita) se qualquer
// pre-condicao nao bater exatamente com o esperado.
// dry_run_required: sem --apply, roda todas as verificacoes e imprime o que
// faria, sem escrever.
// rollback_plan_required: --rollback remove apenas a linha
// name='0444_controle_voos_versao.sql' do ledger (nunca toca a coluna
// versao em si — reverter o schema e uma operacao separada e deliberadamente
// mais arriscada, fora do escopo deste reconciliador).

import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const ALLOWED_D1_DATABASE_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const MIGRATION_NAME = '0444_controle_voos_versao.sql';
const WORKER_DIR = decodeURIComponent(new URL('../../worker-airtrust/', import.meta.url).pathname);
const MIGRATION_FILE = join(WORKER_DIR, 'migrations', MIGRATION_NAME);

function log(msg) {
  process.stderr.write(`[reconcile-0444] ${msg}\n`);
}

function fail(msg) {
  log(`RECUSADO: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function execD1Command(dbName, sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--env', 'staging', '--remote', '--command', sql, '--json'],
    { cwd: WORKER_DIR, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`D1 execute falhou: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  return parsed[0]?.results ?? [];
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  const dbName = ALLOWED_D1_NAME;

  log(`db=${dbName} id=${ALLOWED_D1_DATABASE_ID} apply=${apply} rollback=${rollback}`);

  // 1. Confirma que o wrangler.toml de staging aponta para o D1 esperado
  //    (nome + id), nao apenas confiar em uma constante local.
  const wranglerToml = readFileSync(join(WORKER_DIR, 'wrangler.toml'), 'utf8');
  const stagingSection = wranglerToml.slice(wranglerToml.indexOf('[env.staging]'));
  if (!stagingSection.includes(`database_name = "${ALLOWED_D1_NAME}"`)) {
    fail(`wrangler.toml [env.staging] nao referencia database_name="${ALLOWED_D1_NAME}"`);
  }
  if (!stagingSection.includes(`database_id = "${ALLOWED_D1_DATABASE_ID}"`)) {
    fail(`wrangler.toml [env.staging] nao referencia database_id="${ALLOWED_D1_DATABASE_ID}"`);
  }
  log('OK: wrangler.toml [env.staging] confirma nome + id do D1 alvo.');

  // 2. Confirma o schema real de cv_voos.versao via PRAGMA table_info.
  const columns = execD1Command(dbName, 'PRAGMA table_info(cv_voos);');
  const versaoCol = columns.find((c) => c.name === 'versao');
  if (!versaoCol) fail('coluna cv_voos.versao nao existe.');
  if (String(versaoCol.type).toUpperCase() !== 'INTEGER') {
    fail(`cv_voos.versao tipo inesperado: ${versaoCol.type} (esperado INTEGER)`);
  }
  if (Number(versaoCol.notnull) !== 1) {
    fail('cv_voos.versao nao e NOT NULL.');
  }
  if (String(versaoCol.dflt_value) !== '1') {
    fail(`cv_voos.versao DEFAULT inesperado: ${versaoCol.dflt_value} (esperado 1)`);
  }
  log('OK: cv_voos.versao existe, INTEGER, NOT NULL, DEFAULT 1.');

  // 2b. Nenhuma linha com versao NULL ou < 1.
  const badRows = execD1Command(
    dbName,
    'SELECT COUNT(*) AS total FROM cv_voos WHERE versao IS NULL OR versao < 1;',
  );
  const badCount = Number(badRows[0]?.total ?? -1);
  if (badCount !== 0) {
    fail(`${badCount} linha(s) de cv_voos com versao NULL ou < 1.`);
  }
  log('OK: nenhuma linha de cv_voos com versao invalida.');

  // 3. Confirma hash do arquivo oficial 0444 (garante que estamos
  //    reconciliando a migration que de fato produziu o schema acima, nao
  //    uma variante).
  const fileHash = sha256File(MIGRATION_FILE);
  log(`Migration file SHA-256: ${fileHash}`);
  const expectedSqlNormalized = readFileSync(MIGRATION_FILE, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n')
    .trim();
  if (!expectedSqlNormalized.includes('ALTER TABLE cv_voos ADD COLUMN versao INTEGER NOT NULL DEFAULT 1')) {
    fail('Conteudo do arquivo 0444 nao contem o ALTER TABLE esperado — arquivo local pode ter sido alterado.');
  }
  log('OK: arquivo 0444 local contem exatamente o ALTER TABLE esperado.');

  // 4. Confirma ausencia (ou presenca, se --rollback) da entrada exata.
  const ledgerRows = execD1Command(
    dbName,
    `SELECT id, name, applied_at FROM d1_migrations WHERE name = '${MIGRATION_NAME}';`,
  );

  if (rollback) {
    if (ledgerRows.length === 0) {
      log('Ledger ja nao contem a entrada 0444 — rollback e no-op.');
      return;
    }
    log(`Entrada encontrada no ledger: id=${ledgerRows[0].id} applied_at=${ledgerRows[0].applied_at}`);
    if (!apply) {
      log('[dry-run] DELETE FROM d1_migrations WHERE name = ' + JSON.stringify(MIGRATION_NAME));
      return;
    }
    execD1Command(dbName, `DELETE FROM d1_migrations WHERE name = '${MIGRATION_NAME}';`);
    const after = execD1Command(dbName, `SELECT id FROM d1_migrations WHERE name = '${MIGRATION_NAME}';`);
    if (after.length !== 0) fail('Rollback nao removeu a entrada — estado inconsistente.');
    log('OK: entrada 0444 removida do ledger. Coluna cv_voos.versao NAO foi tocada.');
    return;
  }

  if (ledgerRows.length > 0) {
    log(`Ledger ja contem a entrada 0444 (id=${ledgerRows[0].id}, applied_at=${ledgerRows[0].applied_at}) — operacao idempotente, nada a fazer.`);
    return;
  }
  log('OK: ledger nao contem a entrada 0444 (confirmado).');

  // 5. Backup PRE do ledger completo (para restaurar se algo der errado)
  //    + hash SHA-256 do backup.
  const fullLedger = execD1Command(dbName, 'SELECT id, name, applied_at FROM d1_migrations ORDER BY id ASC;');
  const backupDir = mkdtempSync(join(tmpdir(), 'cv-0444-ledger-backup-'));
  const backupPath = join(backupDir, 'd1_migrations_pre_0444.json');
  writeFileSync(backupPath, JSON.stringify(fullLedger, null, 2), { mode: 0o600 });
  chmodSync(backupPath, 0o600);
  const backupHash = sha256File(backupPath);
  log(`Backup PRE do ledger: ${backupPath} (SHA-256: ${backupHash}, ${fullLedger.length} linhas)`);

  if (!apply) {
    log(`[dry-run] INSERT INTO d1_migrations (name) VALUES ('${MIGRATION_NAME}');`);
    log('dry-run concluido — nenhuma escrita realizada.');
    return;
  }

  // 6-7. Insere SOMENTE a entrada 0444, operacao unica e idempotente
  //      (protegida pela UNIQUE(name) da propria tabela — uma segunda
  //      execucao falharia no INSERT em vez de duplicar).
  execD1Command(dbName, `INSERT INTO d1_migrations (name) VALUES ('${MIGRATION_NAME}');`);

  // 8-9. Rele o schema e o ledger; recusa (mas ja escreveu — reporta erro
  //      alto para intervencao manual) se o estado pos-escrita nao bater.
  const postLedger = execD1Command(dbName, `SELECT id, name FROM d1_migrations WHERE name = '${MIGRATION_NAME}';`);
  if (postLedger.length !== 1) {
    fail(`Pos-escrita: esperava exatamente 1 linha para 0444 no ledger, encontrou ${postLedger.length}.`);
  }
  const postColumns = execD1Command(dbName, 'PRAGMA table_info(cv_voos);');
  const postVersaoCol = postColumns.find((c) => c.name === 'versao');
  if (!postVersaoCol || postVersaoCol.notnull !== 1) {
    fail('Pos-escrita: schema de cv_voos.versao mudou inesperadamente durante a operacao.');
  }

  log(`OK: entrada 0444 inserida no ledger (id=${postLedger[0].id}). Schema revalidado.`);
  log('Reconciliacao concluida com sucesso.');
}

main().catch((err) => {
  log(`ERRO: ${err.message}`);
  if (!process.exitCode) process.exitCode = 1;
});
