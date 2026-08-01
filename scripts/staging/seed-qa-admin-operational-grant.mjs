#!/usr/bin/env node

// source_reference: synthetic staging fixture repair for the operational-domain
// certificate smoke. The target identity, tenant and sector are fixed QA
// natural keys; no real tenant, employee or production database is eligible.
// operational_decision: provision the missing setores_gestores relation in the
// same staging-only fixture layer that created the QA administrator and sector.
// The application UI remains manager-only and production runtime is unchanged.
// dry_run_required: default mode performs preflight reads only. --apply requires
// CONFIRM_STAGING_QA_GRANT=AIRTRUST_STAGING_QA_GRANT.
// rollback_plan_required: --rollback soft-deletes only the exact synthetic QA
// admin/sector relation and uses the same confirmation and target allowlists.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const QA_GRANT_CONSTANTS = Object.freeze({
  allowedD1Name: 'airtrust-db-staging-baseline-20260701',
  allowedD1Id: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
  blockedProductionD1Id: '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
  confirmation: 'AIRTRUST_STAGING_QA_GRANT',
  empresaCodigo: 'qa_examiner_training',
  setorCodigo: 'QA-SETOR-EXA',
  adminEmail: 'qa-examiner-admin@staging.airtrust.invalid',
});

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function validateQaGrantTarget({ dbName, dbId, adminEmail }) {
  const name = String(dbName || '').trim();
  const id = String(dbId || '').trim().toLowerCase();
  const email = String(adminEmail || '').trim().toLowerCase();

  if (name !== QA_GRANT_CONSTANTS.allowedD1Name || /prod/i.test(name)) {
    throw new Error(`STAGING_D1_NAME_REJECTED:${name || 'empty'}`);
  }
  if (
    id !== QA_GRANT_CONSTANTS.allowedD1Id ||
    id === QA_GRANT_CONSTANTS.blockedProductionD1Id
  ) {
    throw new Error(`STAGING_D1_ID_REJECTED:${id || 'empty'}`);
  }
  if (email !== QA_GRANT_CONSTANTS.adminEmail) {
    throw new Error('QA_ADMIN_EMAIL_REJECTED');
  }

  return { dbName: name, dbId: id, adminEmail: email };
}

export function buildQaGrantPreflightSql(adminEmail = QA_GRANT_CONSTANTS.adminEmail) {
  const e = sqlString;
  return `SELECT
    (SELECT COUNT(*) FROM empresas
      WHERE codigo = ${e(QA_GRANT_CONSTANTS.empresaCodigo)}
        AND ativo = 1 AND deleted_at IS NULL) AS empresa_count,
    (SELECT COUNT(*) FROM setores s
      INNER JOIN empresas emp ON emp.id = s.empresa_id
      WHERE emp.codigo = ${e(QA_GRANT_CONSTANTS.empresaCodigo)}
        AND emp.ativo = 1 AND emp.deleted_at IS NULL
        AND s.codigo = ${e(QA_GRANT_CONSTANTS.setorCodigo)}
        AND s.ativo = 1 AND s.deleted_at IS NULL
        AND s.dominio_codigo = 'OPERACOES') AS setor_count,
    (SELECT COUNT(*) FROM usuarios
      WHERE LOWER(TRIM(email)) = ${e(adminEmail)}
        AND active = 1 AND deleted_at IS NULL) AS usuario_count,
    (SELECT COUNT(*) FROM usuarios_empresas ue
      INNER JOIN usuarios u ON u.id = ue.usuario_id
      INNER JOIN empresas emp ON emp.id = ue.empresa_id
      WHERE LOWER(TRIM(u.email)) = ${e(adminEmail)}
        AND u.active = 1 AND u.deleted_at IS NULL
        AND emp.codigo = ${e(QA_GRANT_CONSTANTS.empresaCodigo)}
        AND emp.ativo = 1 AND emp.deleted_at IS NULL
        AND LOWER(TRIM(ue.role)) IN ('admin', 'administrador')) AS tenant_admin_count,
    (SELECT COUNT(*) FROM setores_gestores sg
      INNER JOIN usuarios u ON u.id = sg.usuario_id
      INNER JOIN empresas emp ON emp.id = sg.empresa_id
      INNER JOIN setores s ON s.id = sg.setor_id AND s.empresa_id = emp.id
      WHERE LOWER(TRIM(u.email)) = ${e(adminEmail)}
        AND emp.codigo = ${e(QA_GRANT_CONSTANTS.empresaCodigo)}
        AND s.codigo = ${e(QA_GRANT_CONSTANTS.setorCodigo)}
        AND sg.ativo = 1 AND sg.deleted_at IS NULL) AS active_relation_count;`;
}

export function buildQaGrantApplySql(adminEmail = QA_GRANT_CONSTANTS.adminEmail) {
  const e = sqlString;
  return `
UPDATE setores_gestores
SET role = 'manager',
    ativo = 1,
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE id = (
  SELECT sg.id
  FROM setores_gestores sg
  INNER JOIN usuarios u ON u.id = sg.usuario_id
  INNER JOIN empresas emp ON emp.id = sg.empresa_id
  INNER JOIN setores s ON s.id = sg.setor_id AND s.empresa_id = emp.id
  WHERE LOWER(TRIM(u.email)) = ${e(adminEmail)}
    AND emp.codigo = ${e(QA_GRANT_CONSTANTS.empresaCodigo)}
    AND s.codigo = ${e(QA_GRANT_CONSTANTS.setorCodigo)}
  ORDER BY CASE WHEN sg.deleted_at IS NULL AND sg.ativo = 1 THEN 0 ELSE 1 END, sg.id DESC
  LIMIT 1
);

INSERT INTO setores_gestores
  (setor_id, usuario_id, gestor_id, empresa_id, role, ativo, created_at, updated_at, deleted_at)
SELECT s.id, u.id, NULL, emp.id, 'manager', 1, datetime('now'), datetime('now'), NULL
FROM empresas emp
INNER JOIN setores s
  ON s.empresa_id = emp.id
 AND s.codigo = ${e(QA_GRANT_CONSTANTS.setorCodigo)}
 AND s.ativo = 1
 AND s.deleted_at IS NULL
 AND s.dominio_codigo = 'OPERACOES'
INNER JOIN usuarios u
  ON LOWER(TRIM(u.email)) = ${e(adminEmail)}
 AND u.active = 1
 AND u.deleted_at IS NULL
INNER JOIN usuarios_empresas ue
  ON ue.usuario_id = u.id
 AND ue.empresa_id = emp.id
 AND LOWER(TRIM(ue.role)) IN ('admin', 'administrador')
WHERE emp.codigo = ${e(QA_GRANT_CONSTANTS.empresaCodigo)}
  AND emp.ativo = 1
  AND emp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM setores_gestores existing
    WHERE existing.empresa_id = emp.id
      AND existing.setor_id = s.id
      AND existing.usuario_id = u.id
      AND existing.ativo = 1
      AND existing.deleted_at IS NULL
  );
`;
}

export function buildQaGrantRollbackSql(adminEmail = QA_GRANT_CONSTANTS.adminEmail) {
  const e = sqlString;
  return `
UPDATE setores_gestores
SET ativo = 0,
    deleted_at = datetime('now'),
    updated_at = datetime('now')
WHERE empresa_id = (
    SELECT id FROM empresas
    WHERE codigo = ${e(QA_GRANT_CONSTANTS.empresaCodigo)}
      AND deleted_at IS NULL
  )
  AND setor_id = (
    SELECT s.id FROM setores s
    INNER JOIN empresas emp ON emp.id = s.empresa_id
    WHERE emp.codigo = ${e(QA_GRANT_CONSTANTS.empresaCodigo)}
      AND s.codigo = ${e(QA_GRANT_CONSTANTS.setorCodigo)}
      AND s.deleted_at IS NULL
  )
  AND usuario_id = (
    SELECT id FROM usuarios
    WHERE LOWER(TRIM(email)) = ${e(adminEmail)}
      AND deleted_at IS NULL
  )
  AND deleted_at IS NULL;
`;
}

export function extractQaGrantRow(payload) {
  const row = Array.isArray(payload)
    ? payload[0]?.results?.[0]
    : payload?.results?.[0] ?? payload?.result?.[0]?.results?.[0];
  if (!row || typeof row !== 'object') throw new Error('QA_GRANT_D1_ROW_MISSING');
  return row;
}

export function parseWranglerJson(rawOutput) {
  const raw = String(rawOutput || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim();
  if (!raw) throw new Error('QA_GRANT_WRANGLER_JSON_EMPTY');

  const candidates = [raw];
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimStart();
    if (line.startsWith('[') || line.startsWith('{')) {
      candidates.push(lines.slice(index).join('\n').trim());
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Wrangler may prefix --json output with update-status decoration.
    }
  }
  throw new Error('QA_GRANT_WRANGLER_JSON_INVALID');
}

function executeWranglerJson(dbName, args) {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', dbName, '--remote', ...args, '--json'], {
    cwd: join(process.cwd(), 'worker-airtrust'),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'wrangler d1 execute falhou');
  }
  return parseWranglerJson(result.stdout);
}

function assertPreflight(row) {
  for (const key of ['empresa_count', 'setor_count', 'usuario_count', 'tenant_admin_count']) {
    if (Number(row[key]) !== 1) throw new Error(`QA_GRANT_PREFLIGHT_${key.toUpperCase()}:${row[key]}`);
  }
  const activeRelations = Number(row.active_relation_count);
  if (!Number.isInteger(activeRelations) || activeRelations < 0 || activeRelations > 1) {
    throw new Error(`QA_GRANT_ACTIVE_RELATION_COUNT:${row.active_relation_count}`);
  }
  return activeRelations;
}

function writeReport(path, report) {
  if (!path) return;
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

export async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const rollback = args.has('--rollback');
  if (apply && rollback) throw new Error('QA_GRANT_MODE_CONFLICT');

  const target = validateQaGrantTarget({
    dbName: process.env.STAGING_D1_NAME || QA_GRANT_CONSTANTS.allowedD1Name,
    dbId: process.env.STAGING_D1_ID || QA_GRANT_CONSTANTS.allowedD1Id,
    adminEmail: process.env.QA_EXAMINER_ADMIN_EMAIL || QA_GRANT_CONSTANTS.adminEmail,
  });
  const reportPath = String(process.env.QA_GRANT_REPORT_PATH || '').trim();
  const report = {
    success: false,
    mode: rollback ? 'rollback' : apply ? 'apply' : 'dry-run',
    target: target.dbName,
    fixture: {
      empresaCodigo: QA_GRANT_CONSTANTS.empresaCodigo,
      setorCodigo: QA_GRANT_CONSTANTS.setorCodigo,
    },
    before: null,
    after: null,
    changed: false,
    retained: !rollback,
    error: null,
  };

  try {
    const before = extractQaGrantRow(
      executeWranglerJson(target.dbName, ['--command', buildQaGrantPreflightSql(target.adminEmail)]),
    );
    report.before = before;
    const activeBefore = assertPreflight(before);

    if (!apply && !rollback) {
      report.success = true;
      report.after = before;
      writeReport(reportPath, report);
      console.log(JSON.stringify({ success: true, mode: 'dry-run', activeRelationCount: activeBefore }));
      return;
    }

    if (process.env.CONFIRM_STAGING_QA_GRANT !== QA_GRANT_CONSTANTS.confirmation) {
      throw new Error(`QA_GRANT_CONFIRMATION_REQUIRED:${QA_GRANT_CONSTANTS.confirmation}`);
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-staging-qa-grant-'));
    const sqlFile = join(tempDir, rollback ? 'rollback.sql' : 'apply.sql');
    writeFileSync(
      sqlFile,
      rollback ? buildQaGrantRollbackSql(target.adminEmail) : buildQaGrantApplySql(target.adminEmail),
      { mode: 0o600 },
    );
    try {
      executeWranglerJson(target.dbName, ['--file', sqlFile]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    const after = extractQaGrantRow(
      executeWranglerJson(target.dbName, ['--command', buildQaGrantPreflightSql(target.adminEmail)]),
    );
    report.after = after;
    const activeAfter = assertPreflight(after);
    const expected = rollback ? 0 : 1;
    if (activeAfter !== expected) {
      throw new Error(`QA_GRANT_POSTCONDITION:${activeAfter}:expected:${expected}`);
    }

    report.changed = activeBefore !== activeAfter;
    report.success = true;
    writeReport(reportPath, report);
    console.log(
      JSON.stringify({
        success: true,
        mode: report.mode,
        activeRelationCount: activeAfter,
        changed: report.changed,
      }),
    );
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    writeReport(reportPath, report);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`STAGING_QA_ADMIN_GRANT_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
