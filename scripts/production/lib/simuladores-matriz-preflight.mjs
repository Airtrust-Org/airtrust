import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  assertRealTenantFingerprintState,
  buildTenantFingerprint,
} from '../../../worker-airtrust/scripts/lib/matriz-base-fingerprint.mjs';
import { classify0440 } from '../../../worker-airtrust/scripts/lib/simuladores-matriz-0440-audit.mjs';
import {
  buildSnapshot,
  ledgerHasEntry,
  LEDGER_ENTRY_NAME,
} from './simuladores-0440-ledger-reconciler.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const MIGRATION_0440_PATH = join(
  REPO_ROOT,
  'worker-airtrust',
  'migrations',
  '0440_simuladores_matriz_versionada_metadata.sql',
);

export const ALLOWED_EMPRESA_ID = 6;
export const MATRIX_VERSION = 'M2026.07';
export const LEDGER_0441 = '0441_simuladores_matriz_manobra_resolution.sql';
export const LEDGER_0442 = '0442_simuladores_matriz_guia_relink.sql';
export const TENANT_STATE_KEYS = Object.freeze([
  'empresa_id',
  'current_versions',
  'resolved_manoeuvres',
  'links',
  'migration_state',
  'existing_manobra_resolutions',
]);
export const AUTH_ROLE_ADMIN = 'admin';

export function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function maskEmail(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized.includes('@')) return '***';
  const [local, domain] = normalized.split('@');
  const head = local.slice(0, 2);
  return `${head || '*'}***@${domain}`;
}

export function sha256Text(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) throw new Error('token JWT inválido');
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export function buildReadOnlySqlList({
  empresaId,
  matrixVersion = MATRIX_VERSION,
  nowKey,
  endKey,
}) {
  const empresa = Number(empresaId);
  return {
    currentVersions: `
      SELECT modelo_id, codigo_canonico, versao_numero, versao_matriz, is_current
      FROM modelos_sessao_versionamento
      WHERE empresa_id = ${empresa} AND is_current = 1
      ORDER BY codigo_canonico, modelo_id
    `,
    resolvedManoeuvres: `
      SELECT id, codigo, empresa_id, deleted_at
      FROM manobras
      WHERE empresa_id = ${empresa} AND deleted_at IS NULL
      ORDER BY codigo, id
    `,
    links: `
      SELECT msm.id, msm.modelo_id, msm.manobra_id, msm.ordem, msm.deleted_at
      FROM modelos_sessao_manobras msm
      JOIN modelos_sessao ms ON ms.id = msm.modelo_id
      WHERE ms.empresa_id = ${empresa}
      ORDER BY msm.id
    `,
    versionamentoCount: `
      SELECT COUNT(*) AS c
      FROM modelos_sessao_versionamento
      WHERE empresa_id = ${empresa}
    `,
    existingManobraResolutions: `
      SELECT codigo_canonico, manobra_id, resolution_type
      FROM simuladores_matriz_manobra_resolution
      WHERE empresa_id = ${empresa} AND versao_matriz = ${sqlString(matrixVersion)}
      ORDER BY codigo_canonico
    `,
    tenantExists: `SELECT id FROM empresas WHERE id = ${empresa} AND deleted_at IS NULL`,
    activeSessions: `
      SELECT COUNT(*) AS c
      FROM simulador_agendamentos sa
      WHERE sa.deleted_at IS NULL
        AND sa.empresa_id = ${empresa}
        AND UPPER(COALESCE(sa.status, '')) IN ('AGENDADO', 'AGENDADA', 'PENDENTE', 'PENDING', 'CONFIRMADO', 'CONFIRMADA', 'EM_ANDAMENTO')
        AND (
          UPPER(COALESCE(sa.status, '')) = 'EM_ANDAMENTO'
          OR (
            datetime(sa.data || ' ' || COALESCE(sa.hora_inicio, '00:00')) <= datetime(${sqlString(endKey)})
            AND datetime(
              sa.data || ' ' ||
              COALESCE(
                sa.hora_fim,
                time(COALESCE(sa.hora_inicio, '00:00'), '+' || COALESCE(sa.duracao_minutos, 0) || ' minutes')
              )
            ) >= datetime(${sqlString(nowKey)})
          )
        )
    `,
    activeChecks: `
      SELECT COUNT(*) AS c
      FROM simulador_agendamentos sa
      WHERE sa.deleted_at IS NULL
        AND sa.empresa_id = ${empresa}
        AND COALESCE(sa.is_check, 0) = 1
        AND UPPER(COALESCE(sa.status, '')) IN ('AGENDADO', 'AGENDADA', 'PENDENTE', 'PENDING', 'CONFIRMADO', 'CONFIRMADA', 'EM_ANDAMENTO')
        AND (
          UPPER(COALESCE(sa.status, '')) = 'EM_ANDAMENTO'
          OR (
            datetime(sa.data || ' ' || COALESCE(sa.hora_inicio, '00:00')) <= datetime(${sqlString(endKey)})
            AND datetime(
              sa.data || ' ' ||
              COALESCE(
                sa.hora_fim,
                time(COALESCE(sa.hora_inicio, '00:00'), '+' || COALESCE(sa.duracao_minutos, 0) || ' minutes')
              )
            ) >= datetime(${sqlString(nowKey)})
          )
        )
    `,
    pendingEdits: `
      SELECT COUNT(*) AS c
      FROM fichas_sessao_edicoes fe
      INNER JOIN fichas_sessao f
        ON f.id = fe.ficha_id
       AND f.deleted_at IS NULL
      INNER JOIN funcionarios aluno
        ON aluno.id = f.colaborador_id_aluno
       AND aluno.deleted_at IS NULL
      WHERE fe.deleted_at IS NULL
        AND fe.status = 'PENDENTE'
        AND COALESCE(fe.empresa_id, f.empresa_id, aluno.empresa_id) = ${empresa}
    `,
  };
}

export function assertReadOnlySql(sql) {
  const normalized = String(sql || '')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!normalized) throw new Error('SQL vazio');
  const readOnlyPrefix = /^(SELECT|PRAGMA|WITH)\b/;
  if (!readOnlyPrefix.test(normalized)) {
    throw new Error(`SQL fora do modo read-only: ${normalized.slice(0, 40)}`);
  }
  const forbidden =
    /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|UPSERT|MERGE|ATTACH|DETACH|VACUUM|REINDEX|BEGIN|COMMIT|ROLLBACK)\b/;
  if (forbidden.test(normalized)) {
    throw new Error(`SQL contém mutação proibida: ${normalized.slice(0, 80)}`);
  }
  return true;
}

export function strictReadOnlyExecutor(executor, { onQuery } = {}) {
  return {
    ...executor,
    query(sql) {
      assertReadOnlySql(sql);
      if (typeof onQuery === 'function') onQuery(sql);
      return executor.query(sql);
    },
    exec(sql) {
      throw new Error(`executor read-only não permite escrita: ${String(sql).slice(0, 80)}`);
    },
  };
}

export function assertAdminAuth({ jwtClaims, mePayload, expectedEmpresaId = ALLOWED_EMPRESA_ID }) {
  const role = String(jwtClaims?.role || '')
    .trim()
    .toLowerCase();
  const empresaId = Number(jwtClaims?.empresa_id);
  if (empresaId !== Number(expectedEmpresaId)) {
    throw new Error(`token com empresa_id divergente: ${empresaId}`);
  }
  if (role !== AUTH_ROLE_ADMIN) {
    throw new Error(`token sem role=admin: ${role || 'ausente'}`);
  }
  const meData = mePayload?.data ?? mePayload;
  if (!meData || typeof meData !== 'object') {
    throw new Error('auth/me sem payload data válido');
  }
  const meRole = String(meData.role || '')
    .trim()
    .toLowerCase();
  if (meRole !== AUTH_ROLE_ADMIN) {
    throw new Error(`auth/me sem role=admin: ${meRole || 'ausente'}`);
  }
  if (!meData.email || !meData.id || !meData.nome) {
    throw new Error('auth/me incompleto');
  }
  return {
    user_id: Number(meData.id),
    email_masked: maskEmail(meData.email),
    role: meRole,
    empresa_id: empresaId,
    nome_hash: sha256Text(String(meData.nome)).slice(0, 12),
  };
}

export function validateTenantStateSnapshot(
  snapshot,
  { expectedEmpresaId = ALLOWED_EMPRESA_ID } = {},
) {
  const keys = Object.keys(snapshot || {}).sort();
  const expected = [...TENANT_STATE_KEYS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(`snapshot com chaves divergentes: ${keys.join(', ')}`);
  }
  if (Number(snapshot.empresa_id) !== Number(expectedEmpresaId)) {
    throw new Error(`snapshot com empresa_id divergente: ${snapshot.empresa_id}`);
  }
  if (!Array.isArray(snapshot.existing_manobra_resolutions)) {
    throw new Error('snapshot sem existing_manobra_resolutions[]');
  }
  assertRealTenantFingerprintState({
    empresaId: Number(snapshot.empresa_id),
    currentVersions: snapshot.current_versions,
    resolvedManoeuvres: snapshot.resolved_manoeuvres,
    links: snapshot.links,
    migrationState: snapshot.migration_state,
  });
  return buildTenantFingerprint({
    empresaId: Number(snapshot.empresa_id),
    currentVersions: snapshot.current_versions,
    resolvedManoeuvres: snapshot.resolved_manoeuvres,
    links: snapshot.links,
    migrationState: snapshot.migration_state,
  });
}

function scalar(rows) {
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || typeof row !== 'object') return 0;
  const key = Object.keys(row)[0];
  return Number(row[key] || 0);
}

function tableExists(executor, tableName) {
  const rows = executor.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${sqlString(tableName)}`,
  );
  return Array.isArray(rows) && rows.length > 0;
}

export function buildTenantState({
  empresaId,
  currentVersions,
  resolvedManoeuvres,
  links,
  migrationState,
  existingManobraResolutions,
}) {
  return {
    empresa_id: Number(empresaId),
    current_versions: currentVersions,
    resolved_manoeuvres: resolvedManoeuvres,
    links,
    migration_state: migrationState,
    existing_manobra_resolutions: existingManobraResolutions,
  };
}

export function collectTenantState({
  executor,
  empresaId = ALLOWED_EMPRESA_ID,
  matrixVersion = MATRIX_VERSION,
  fkBaseline,
  nowKey,
  endKey,
  migrationSql = readFileSync(MIGRATION_0440_PATH, 'utf8'),
}) {
  const targetExecutor = strictReadOnlyExecutor(executor);
  const queries = buildReadOnlySqlList({ empresaId, matrixVersion, nowKey, endKey });
  if (scalar(targetExecutor.query(queries.tenantExists)) !== Number(empresaId)) {
    throw new Error(`tenant ${empresaId} não encontrado`);
  }
  const currentVersions = targetExecutor.query(queries.currentVersions);
  const resolvedManoeuvres = targetExecutor.query(queries.resolvedManoeuvres);
  const links = targetExecutor.query(queries.links);
  const versionamentoCount = scalar(targetExecutor.query(queries.versionamentoCount));
  const existingManobraResolutions = tableExists(
    targetExecutor,
    'simuladores_matriz_manobra_resolution',
  )
    ? targetExecutor.query(queries.existingManobraResolutions)
    : [];

  const snapshot = buildSnapshot(targetExecutor, { fkCheckBaseline: fkBaseline });
  const audit = classify0440({ migrationSql, snapshot });
  const migrationState = {
    has_0440: audit.state === 'INTEGRALMENTE_APLICADA',
    versionamento_count: versionamentoCount,
    audit_state: audit.state,
    ledger_0440_present: ledgerHasEntry(targetExecutor, LEDGER_ENTRY_NAME),
    ledger_0441_present: ledgerHasEntry(targetExecutor, LEDGER_0441),
    ledger_0442_present: ledgerHasEntry(targetExecutor, LEDGER_0442),
    fk_check_current: Number(snapshot?.invariants?.fkCheckCurrent ?? 0),
    fk_check_baseline:
      typeof snapshot?.invariants?.fkCheckBaseline === 'number'
        ? Number(snapshot.invariants.fkCheckBaseline)
        : null,
    audit_conflicts: audit.conflicts,
    audit_missing: audit.missing,
  };
  const tenantState = buildTenantState({
    empresaId,
    currentVersions,
    resolvedManoeuvres,
    links,
    migrationState,
    existingManobraResolutions,
  });
  const fingerprint = validateTenantStateSnapshot(tenantState, { expectedEmpresaId: empresaId });
  return {
    tenantState,
    fingerprint,
    migrationState,
  };
}

export function collectOperationalWindowStatus({
  executor,
  empresaId = ALLOWED_EMPRESA_ID,
  nowKey,
  endKey,
}) {
  const targetExecutor = strictReadOnlyExecutor(executor);
  const queries = buildReadOnlySqlList({ empresaId, nowKey, endKey });
  const activeSessions = scalar(targetExecutor.query(queries.activeSessions));
  const activeChecks = scalar(targetExecutor.query(queries.activeChecks));
  const pendingEdits = tableExists(targetExecutor, 'fichas_sessao_edicoes')
    ? scalar(targetExecutor.query(queries.pendingEdits))
    : 0;
  return {
    active_sessions: activeSessions,
    active_checks: activeChecks,
    pending_edits: pendingEdits,
  };
}

export function parseSourcesRoot(
  pathFile,
  { readText = (file) => readFileSync(file, 'utf8') } = {},
) {
  const root = String(readText(pathFile) || '').trim();
  if (!root) throw new Error(`arquivo de fontes vazio: ${pathFile}`);
  return root;
}

export function runCommand(command, args, { cwd, env, input } = {}) {
  const res = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || `${command} falhou`);
  }
  return res.stdout;
}
