#!/usr/bin/env node
/**
 * Real local restore rehearsal.
 *
 * Copies the local dev D1 SQLite file (produced by `npm run setup:local`, the
 * repo's official local-build flow) as a stand-in "backup", restores it into a
 * disposable directory, runs PRAGMA integrity_check / foreign_key_check on the
 * restored copy, computes a schema fingerprint from actual sqlite_master DDL
 * (not a hardcoded table list), queries it through the real D1 access layer
 * (`wrangler d1 execute --local`), boots the actual Worker against the restored
 * copy and polls /api/health until it responds. Measures wall-clock duration of
 * every step. Never touches staging/production D1 and never commits the backup
 * file (written under a gitignored path).
 *
 * Usage: node scripts/validation/restore-rehearsal.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKER_DIR = path.join(ROOT, 'worker-airtrust');
const D1_STATE_DIR = path.join(WORKER_DIR, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const OUT_DIR = path.join(ROOT, 'db', 'dev-backups', 'rehearsal-' + new Date().toISOString().replace(/[:.]/g, '-'));

function log(msg) {
  process.stdout.write(`[RESTORE_REHEARSAL] ${msg}\n`);
}

function now() {
  return process.hrtime.bigint();
}

function ms(startNs) {
  return Number(now() - startNs) / 1e6;
}

function findLocalSqlite() {
  if (!fs.existsSync(D1_STATE_DIR)) {
    throw new Error(`Local D1 state dir not found: ${D1_STATE_DIR}. Run "npm run setup:local" first.`);
  }
  const files = fs.readdirSync(D1_STATE_DIR).filter((f) => f.endsWith('.sqlite'));
  if (files.length === 0) {
    throw new Error('No local D1 sqlite file found. Run "npm run setup:local" first.');
  }
  // most recently modified
  files.sort((a, b) => fs.statSync(path.join(D1_STATE_DIR, b)).mtimeMs - fs.statSync(path.join(D1_STATE_DIR, a)).mtimeMs);
  return path.join(D1_STATE_DIR, files[0]);
}

function sha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function main() {
  const totalStart = now();
  const report = { steps: {}, startedAt: new Date().toISOString() };

  const srcSqlite = findLocalSqlite();
  const srcName = path.basename(srcSqlite);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. "Backup" = copy of the local D1 sqlite file
  let t = now();
  const backupPath = path.join(OUT_DIR, 'backup_source.sqlite');
  fs.copyFileSync(srcSqlite, backupPath);
  const backupSize = fs.statSync(backupPath).size;
  const backupSha256 = sha256(backupPath);
  report.steps.backup_ms = ms(t);
  report.backup = { sizeBytes: backupSize, sha256: backupSha256, sourceDbFile: srcName };
  log(`Backup captured: ${backupSize} bytes, sha256=${backupSha256} (${report.steps.backup_ms.toFixed(1)}ms)`);

  // 2. Restore into a disposable copy
  t = now();
  const restoredPath = path.join(OUT_DIR, 'restored_disposable.sqlite');
  fs.copyFileSync(backupPath, restoredPath);
  report.steps.restore_ms = ms(t);
  log(`Restored to disposable file (${report.steps.restore_ms.toFixed(1)}ms)`);

  // 3. integrity_check + foreign_key_check via sqlite3 CLI
  t = now();
  const integrity = execFileSync('sqlite3', [restoredPath, 'PRAGMA integrity_check;']).toString().trim();
  const fkViolations = execFileSync('sqlite3', [restoredPath, 'PRAGMA foreign_key_check;']).toString().trim();
  const fkViolationCount = fkViolations === '' ? 0 : fkViolations.split('\n').length;
  report.steps.integrity_and_fk_ms = ms(t);
  report.integrityCheck = integrity;
  report.foreignKeyViolationCount = fkViolationCount;
  log(`integrity_check=${integrity} foreign_key_violations=${fkViolationCount} (${report.steps.integrity_and_fk_ms.toFixed(1)}ms)`);

  // 4. Deterministic schema fingerprint from real DDL (not a hardcoded list)
  t = now();
  const schemaRows = execFileSync('sqlite3', [
    restoredPath,
    "SELECT type||'|'||name||'|'||COALESCE(sql,'') FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type, name;",
  ]).toString();
  const fingerprint = createHash('sha256').update(schemaRows).digest('hex');
  const tableCount = execFileSync('sqlite3', [restoredPath, "SELECT count(*) FROM sqlite_master WHERE type='table';"]).toString().trim();
  const indexCount = execFileSync('sqlite3', [restoredPath, "SELECT count(*) FROM sqlite_master WHERE type='index';"]).toString().trim();
  const triggerCount = execFileSync('sqlite3', [restoredPath, "SELECT count(*) FROM sqlite_master WHERE type='trigger';"]).toString().trim();
  report.steps.fingerprint_ms = ms(t);
  report.schema = { fingerprint, tableCount: Number(tableCount), indexCount: Number(indexCount), triggerCount: Number(triggerCount) };
  log(`Schema fingerprint=${fingerprint} tables=${tableCount} indexes=${indexCount} triggers=${triggerCount} (${report.steps.fingerprint_ms.toFixed(1)}ms)`);

  // 5. Query through the real D1 access layer (wrangler d1 execute --local)
  t = now();
  const persistTo = path.join(OUT_DIR, 'disposable_state');
  const restoredD1Dir = path.join(persistTo, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  fs.mkdirSync(restoredD1Dir, { recursive: true });
  fs.copyFileSync(restoredPath, path.join(restoredD1Dir, srcName));

  const d1Query = execFileSync(
    'npx',
    [
      'wrangler', 'd1', 'execute', 'airtrust-db-local',
      '--local', `--persist-to=${persistTo}`, '--config=wrangler.dev.toml',
      '--json', '--command=SELECT (SELECT count(*) FROM empresas) empresas, (SELECT count(*) FROM funcionarios) funcionarios, (SELECT count(*) FROM usuarios) usuarios;',
    ],
    { cwd: WORKER_DIR },
  ).toString();
  const d1Result = JSON.parse(d1Query)[0].results[0];
  report.steps.d1_access_layer_query_ms = ms(t);
  report.essentialQueryViaD1 = d1Result;
  log(`D1 access-layer query: ${JSON.stringify(d1Result)} (${report.steps.d1_access_layer_query_ms.toFixed(1)}ms)`);

  // 6. Boot the actual Worker against the restored copy, poll /api/health
  t = now();
  const port = 18788;
  const worker = spawn(
    'npx',
    ['wrangler', 'dev', '--local', `--persist-to=${persistTo}`, '--config=wrangler.dev.toml', `--port=${port}`],
    { cwd: WORKER_DIR, stdio: 'ignore', detached: true },
  );

  let healthOk = false;
  let healthBody = null;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.status === 200) {
        healthBody = await res.json();
        healthOk = true;
        break;
      }
    } catch {
      // worker not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  report.steps.worker_boot_and_health_ms = ms(t);
  report.workerHealth = { ok: healthOk, body: healthBody };
  log(`Worker health after restore: ok=${healthOk} db_status=${healthBody?.checks?.database?.status} (${report.steps.worker_boot_and_health_ms.toFixed(1)}ms)`);

  try {
    process.kill(-worker.pid);
  } catch {
    // best effort
  }

  report.totalDurationMs = ms(totalStart);
  report.totalDurationSeconds = report.totalDurationMs / 1000;
  log(`TOTAL RTO (measured): ${report.totalDurationSeconds.toFixed(2)}s`);

  // Cleanup disposable artifacts; keep only the JSON report (no PII, no DB blobs)
  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  const reportPath = path.join(ROOT, 'db', 'dev-backups', 'last-restore-rehearsal-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`Report written: ${reportPath}`);

  if (!healthOk || integrity !== 'ok' || fkViolationCount !== 0) {
    log('RESULT: FAIL — see report for details');
    process.exitCode = 1;
    return;
  }
  log('RESULT: PASS — real restore rehearsal completed end-to-end');
}

main().catch((err) => {
  console.error('[RESTORE_REHEARSAL][ERROR]', err);
  process.exitCode = 1;
});
