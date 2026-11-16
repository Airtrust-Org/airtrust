#!/usr/bin/env node
// Verificação SOMENTE LEITURA da cadeia SIGVOOS -> Controle de Voos -> FRMS em produção:
// frescor da ingestão, rechecagem retroativa D-3..D-1, ledger de cobertura, duplicação,
// órfãos, isolamento entre empresas e reconciliação diária. Só contagens agregadas.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReadOnlyD1 } from './lib/frms-checkin-obligation-validation.mjs';
import { evaluateChain, listDays } from './lib/frms-sigvoos-chain-validation.mjs';

export const TENANT_ID = 6;
export const CONFIRMATION = 'AIRTRUST_FRMS_SIGVOOS_CHAIN_READONLY';
export const INGEST_JOB = 'sigvoos-ingest';
const PROD_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const BLOCKED_DB_IDS = ['bf9963f4-eb12-439b-a830-20bbf577ac22', 'a72fb05b-0912-4ad9-9686-e7948c8b09eb'];

async function queryD1(sql, params) {
  const databaseId = process.env.PRODUCTION_D1_ID || '';
  if (databaseId !== PROD_DB_ID || BLOCKED_DB_IDS.includes(databaseId)) throw new Error('PRODUCTION_TARGET_MISMATCH');
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error('READ_ONLY_CREDENTIALS_MISSING');
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${PROD_DB_ID}/query`;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });
    const payload = await response.json().catch(() => ({}));
    const first = Array.isArray(payload.result) ? payload.result[0] : payload.result;
    if (response.ok && payload.success === true && first?.success !== false && Array.isArray(first?.results)) return first.results;
    if (attempt < 3 && [429, 500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      continue;
    }
    throw new Error(`PRODUCTION_READ_FAILED_HTTP_${response.status}`);
  }
}

const OPERATIONAL_DATA = `(COALESCE(j.horas_voo_minutos, 0) > 0 OR COALESCE(j.duracao_jornada_minutos, 0) > 0
  OR j.hora_apresentacao IS NOT NULL OR j.hora_termino IS NOT NULL)`;

/** Cada sonda é independente: uma consulta indisponível vira aviso, não derruba as demais. */
export async function collectFacts(db, { tenantId, from, to, today }) {
  const probe = async (fn) => {
    try { return await fn(); } catch (error) { return { unavailable: String(error.message).replace(/https?:\/\/\S+/g, '<url>').slice(0, 80) }; }
  };
  const all = async (sql, ...binds) => (await db.prepare(sql).bind(...binds).all()).results;
  const first = async (sql, ...binds) => (await all(sql, ...binds))[0] ?? {};
  const failuresFrom = new Date(Date.parse(`${today}T00:00:00Z`) - 14 * 86400000).toISOString().slice(0, 10);
  return {
    cron: await probe(async () => ({
      row: (await all(
        `SELECT watermark_from, watermark_to, last_started_at, last_success_at, last_error_at, last_error_code,
                consecutive_failures, processed_total, failed_total,
                CASE WHEN json_valid(metadata_json) THEN json_extract(metadata_json, '$.lastReviewedOperationalDate') END AS last_reviewed,
                CASE WHEN json_valid(metadata_json) THEN json_extract(metadata_json, '$.stage') END AS stage
           FROM cron_job_state WHERE job_name = ? AND scope_key = ?`, INGEST_JOB, `empresa:${tenantId}`))[0] ?? null,
    })),
    events: await probe(async () => ({
      rows: await all(
        `SELECT substr(created_at, 1, 10) AS dia, tipo_evento, COUNT(*) AS n
           FROM integracoes_sigvoos_eventos
          WHERE empresa_id = ? AND deleted_at IS NULL AND created_at >= ?
            AND tipo_evento = 'CRON_FALHA'
          GROUP BY substr(created_at, 1, 10), tipo_evento`, tenantId, failuresFrom),
    })),
    ledger: await probe(async () => ({
      rows: await all(
        `SELECT CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.day') END AS day,
                status, COUNT(*) AS n
           FROM integracoes_sigvoos_eventos
          WHERE empresa_id = ? AND tipo_evento = 'FRMS_COVERAGE_DAY' AND deleted_at IS NULL
          GROUP BY 1, status`, tenantId),
    })),
    // Governança: art. 42 da Lei 13.475 só bloqueia quando o perfil vigente declara o aceite jurídico.
    art42: await probe(async () => ({
      rows: await all(
        `SELECT CASE WHEN json_valid(p.limits_json) THEN json_extract(p.limits_json, '$.law_art42_enforced') END AS enforced,
                CASE WHEN json_valid(p.limits_json) THEN json_extract(p.limits_json, '$.lawArt42Enforced') END AS enforced_camel
           FROM frms_profile_assignments a
           JOIN frms_regulatory_profiles p ON p.id = a.regulatory_profile_id
          WHERE a.empresa_id = ? AND a.status = 'ACTIVE'
            AND a.effective_from <= ? AND (a.effective_to IS NULL OR a.effective_to >= ?)
            AND p.empresa_id = ? AND p.active = 1 AND p.deleted_at IS NULL
            AND p.profile_code = a.profile_code`, tenantId, today, today, tenantId),
    })),
    // Ciclo de tratamento: casos abertos, vencidos e se o escalonamento deixou registro (notificação e auditoria).
    cases: await probe(async () => ({
      open_total: Number((await first(
        `SELECT COUNT(*) AS n FROM frms_alerta a JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
          AND f.empresa_id = ? AND f.deleted_at IS NULL
          WHERE a.deleted_at IS NULL AND COALESCE(a.resolvido, 0) = 0`, tenantId)).n ?? 0),
      open_without_treatment: Number((await first(
        `SELECT COUNT(*) AS n FROM frms_alerta a JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
          AND f.empresa_id = ? AND f.deleted_at IS NULL
          WHERE a.deleted_at IS NULL AND COALESCE(a.resolvido, 0) = 0
            AND (a.notas_resolucao IS NULL OR NOT json_valid(a.notas_resolucao)
                 OR COALESCE(json_extract(a.notas_resolucao, '$.schema'), '') <> 'FRMS_CASE_TREATMENT_V1')`, tenantId)).n ?? 0),
      untreated_age_days: (await all(
        `SELECT CASE WHEN julianday(?) - julianday(substr(a.created_at, 1, 10)) <= 7 THEN 'ATE_7'
                     WHEN julianday(?) - julianday(substr(a.created_at, 1, 10)) <= 30 THEN 'DE_8_A_30'
                     WHEN julianday(?) - julianday(substr(a.created_at, 1, 10)) <= 90 THEN 'DE_31_A_90'
                     ELSE 'MAIS_DE_90' END AS faixa, COUNT(*) AS n
           FROM frms_alerta a JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
            AND f.empresa_id = ? AND f.deleted_at IS NULL
          WHERE a.deleted_at IS NULL AND COALESCE(a.resolvido, 0) = 0
            AND (a.notas_resolucao IS NULL OR NOT json_valid(a.notas_resolucao)
                 OR COALESCE(json_extract(a.notas_resolucao, '$.schema'), '') <> 'FRMS_CASE_TREATMENT_V1')
          GROUP BY 1`, today, today, today, tenantId)).reduce((acc, row) => ({ ...acc, [row.faixa]: Number(row.n) }), {}),
      overdue_open: Number((await first(
        `SELECT COUNT(*) AS n FROM frms_alerta a JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
          AND f.empresa_id = ? AND f.deleted_at IS NULL
          WHERE a.deleted_at IS NULL AND COALESCE(a.resolvido, 0) = 0 AND a.notas_resolucao IS NOT NULL
            AND CASE WHEN json_valid(a.notas_resolucao) THEN json_extract(a.notas_resolucao, '$.prazo') END < ?`,
        tenantId, today)).n ?? 0),
      overdue_notifications_7d: Number((await first(
        `SELECT COUNT(*) AS n FROM notificacoes_sistema WHERE tipo = 'FRMS_CASE_OVERDUE' AND empresa_id = ?
            AND deleted_at IS NULL AND created_at >= datetime('now', '-7 days')`, tenantId)).n ?? 0),
      overdue_audit_rows_14d: Number((await first(
        `SELECT COUNT(*) AS n FROM auditoria_avancada_v2 au
          JOIN frms_alerta a ON a.id = au.registro_id
          JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER) AND f.empresa_id = ?
          WHERE au.tabela = 'frms_alerta' AND au.acao = 'PRAZO_VENCIDO'
            AND au.created_at >= datetime('now', '-14 days')`, tenantId)).n ?? 0),
      reopened_14d: Number((await first(
        `SELECT COUNT(*) AS n FROM auditoria_avancada_v2 au
          JOIN frms_alerta a ON a.id = au.registro_id
          JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER) AND f.empresa_id = ?
          WHERE au.tabela = 'frms_alerta' AND au.acao = 'REABERTO' AND au.created_at >= datetime('now', '-14 days')`, tenantId)).n ?? 0),
    })),
    integrity: await probe(async () => ({
      duplicate_etapa_groups: Number((await first(
        `SELECT COUNT(*) AS n FROM (SELECT voo_id, numero_etapa FROM cv_voo_etapas
          WHERE empresa_id = ? AND deleted_at IS NULL GROUP BY voo_id, numero_etapa HAVING COUNT(*) > 1)`, tenantId)).n ?? 0),
      same_hash_different_voos: Number((await first(
        `SELECT COUNT(*) AS n FROM (SELECT sigvoos_content_hash FROM cv_voo_etapas
          WHERE empresa_id = ? AND deleted_at IS NULL AND sigvoos_content_hash IS NOT NULL
          GROUP BY sigvoos_content_hash HAVING COUNT(DISTINCT voo_id) > 1)`, tenantId)).n ?? 0),
      duplicate_jornada_groups: Number((await first(
        `SELECT COUNT(*) AS n FROM (SELECT j.tripulante_id, j.data, j.origem FROM frms_jornada j
           JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.empresa_id = ?
          WHERE j.deleted_at IS NULL GROUP BY j.tripulante_id, j.data, j.origem HAVING COUNT(*) > 1)`, tenantId)).n ?? 0),
      orphan_etapas: Number((await first(
        `SELECT COUNT(*) AS n FROM cv_voo_etapas e LEFT JOIN cv_voos v ON v.id = e.voo_id
          WHERE e.empresa_id = ? AND e.deleted_at IS NULL AND (v.id IS NULL OR v.deleted_at IS NOT NULL)`, tenantId)).n ?? 0),
      orphan_tripulantes: Number((await first(
        `SELECT COUNT(*) AS n FROM cv_voo_tripulantes t LEFT JOIN cv_voos v ON v.id = t.voo_id
          WHERE t.empresa_id = ? AND t.deleted_at IS NULL AND (v.id IS NULL OR v.deleted_at IS NOT NULL)`, tenantId)).n ?? 0),
      cross_tenant_rows: Number((await first(
        `SELECT (SELECT COUNT(*) FROM cv_voo_tripulantes t JOIN cv_voos v ON v.id = t.voo_id
                  WHERE t.empresa_id = ? AND t.deleted_at IS NULL AND v.empresa_id <> t.empresa_id)
              + (SELECT COUNT(*) FROM cv_voo_etapas e JOIN cv_voos v ON v.id = e.voo_id
                  WHERE e.empresa_id = ? AND e.deleted_at IS NULL AND v.empresa_id <> e.empresa_id) AS n`,
        tenantId, tenantId)).n ?? 0),
      crew_unique_index_present: (await all(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`,
        'idx_cv_voo_tripulantes_empresa_voo_funcionario_funcao')).length === 1,
    })),
    reconciliation: await probe(async () => ({
      cv_crew_days: await all(
        `SELECT v.data_programacao AS dia, COUNT(DISTINCT t.funcionario_id) AS n
           FROM cv_voo_tripulantes t JOIN cv_voos v ON v.id = t.voo_id AND v.empresa_id = t.empresa_id
          WHERE t.empresa_id = ? AND t.deleted_at IS NULL AND v.deleted_at IS NULL
            AND v.status IN ('pousado', 'concluido_operacionalmente', 'em_andamento', 'alternado_divergido')
            AND v.horario_real_partida IS NOT NULL AND v.data_programacao BETWEEN ? AND ?
          GROUP BY v.data_programacao`, tenantId, from, to),
      frms_sigvoos_crew_days: await all(
        `SELECT j.data AS dia, COUNT(DISTINCT j.tripulante_id) AS n FROM frms_jornada j
           JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.empresa_id = ? AND f.deleted_at IS NULL
          WHERE j.deleted_at IS NULL AND UPPER(COALESCE(j.origem, '')) = 'SIGVOOS' AND ${OPERATIONAL_DATA}
            AND j.data BETWEEN ? AND ? GROUP BY j.data`, tenantId, from, to),
    })),
  };
}

export async function main() {
  const expectedSha = String(process.env.EXPECTED_SHA || '');
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || process.env.CONFIRM_READONLY !== CONFIRMATION) {
    throw new Error('READ_ONLY_CONFIRMATION_REJECTED');
  }
  const from = String(process.env.WINDOW_FROM || '');
  const to = String(process.env.WINDOW_TO || '');
  const today = String(process.env.TODAY_SAO_PAULO || '');
  listDays(from, to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('TODAY_INVALID');
  const stats = { queries: 0 };
  const db = createReadOnlyD1(queryD1, stats);
  const tenant = await db.prepare('SELECT nome, codigo FROM empresas WHERE id = ? AND ativo = 1 AND deleted_at IS NULL').bind(TENANT_ID).all();
  if (tenant.results.length !== 1
    || !/costa\s*(?:do\s*)?sol|\bcds\b/i.test(`${tenant.results[0].nome || ''} ${tenant.results[0].codigo || ''}`)) {
    throw new Error('EXPECTED_PRODUCTION_TENANT_NOT_CONFIRMED');
  }
  const facts = await collectFacts(db, { tenantId: TENANT_ID, from, to, today });
  const evaluation = evaluateChain(facts, { today, from, to });
  const report = {
    source: 'PRODUCTION_READONLY_SIGVOOS_CV_FRMS_CHAIN',
    tenant: 'Costa do Sol', reviewedSourceSha: expectedSha, window: { from, to }, today_sao_paulo: today,
    queries: stats.queries, writes: 0, generatedAtUtc: new Date().toISOString(), ...evaluation,
  };
  const file = String(process.env.AUDIT_REPORT_PATH || '');
  if (!file.startsWith('/') || !file.endsWith('.json')) throw new Error('REPORT_PATH_INVALID');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`FRMS_SIGVOOS_CHAIN_READONLY_DONE violations=${evaluation.violations} advisories=${evaluation.advisories} queries=${stats.queries} writes=0`);
  if (evaluation.violations > 0) process.exitCode = 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FRMS_SIGVOOS_CHAIN_READONLY_FAILED:${String(error.message).replace(/https?:\/\/\S+/g, '<url>')}`);
    process.exitCode = 1;
  });
}
