#!/usr/bin/env node
// Validação SOMENTE LEITURA, em produção, da obrigação diária de check-in FRMS (#2356).
//
// Executa o código REAL da regra canônica (bundle do Worker no SHA do checkout) sobre o D1 de
// produção por um adaptador que só aceita SELECT, e confronta cada tripulante-dia com um oráculo
// independente escrito a partir das tabelas de origem. Nada é gravado. A saída tem só contagens de
// tripulante-dia e referências sha256 truncadas; nunca nomes, matrículas, e-mails ou documentos.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CREW_FUNCTIONS, MANUAL_ABSENCE_EVENTS, createReadOnlyD1, evaluateDay, summarize,
} from './lib/frms-checkin-obligation-validation.mjs';

export const TENANT_ID = 6; // Costa do Sol, confirmado por nome antes de qualquer leitura
export const CONFIRMATION = 'AIRTRUST_FRMS_CHECKIN_OBLIGATION_READONLY';
const PROD_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const BLOCKED_DB_IDS = ['bf9963f4-eb12-439b-a830-20bbf577ac22', 'a72fb05b-0912-4ad9-9686-e7948c8b09eb'];
const MAX_WINDOW_DAYS = 35;
const CONTEXT_DAYS = 31;

const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export function listDates(from, to) {
  if (!isoDate(from) || !isoDate(to) || from > to) throw new Error('WINDOW_INVALID');
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  if (out.length > MAX_WINDOW_DAYS) throw new Error('WINDOW_TOO_LARGE');
  return out;
}

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
    if (response.ok && payload.success === true && first?.success !== false && Array.isArray(first?.results)) {
      return first.results;
    }
    // Falha transitória: tenta de novo; qualquer outra falha aborta sem expor a resposta.
    if (attempt < 3 && [429, 500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      continue;
    }
    throw new Error(`PRODUCTION_READ_FAILED_HTTP_${response.status}`);
  }
}

const QUINZENA_NUMERO = `CASE LOWER(TRIM(COALESCE(f.quinzena, '')))
  WHEN 'primeira' THEN 1 WHEN '1' THEN 1 WHEN '1q' THEN 1 WHEN 'q1' THEN 1 WHEN '1ª' THEN 1 WHEN '1a' THEN 1
  WHEN 'primeira quinzena' THEN 1 WHEN 'segunda' THEN 2 WHEN '2' THEN 2 WHEN '2q' THEN 2 WHEN 'q2' THEN 2
  WHEN '2ª' THEN 2 WHEN '2a' THEN 2 WHEN 'segunda quinzena' THEN 2 ELSE 0 END`;

/** Fatos de origem da janela inteira; o filtro por dia acontece em memória. */
async function loadWindowFacts(db, tenantId, from, to) {
  const ctxFrom = addDays(from, -CONTEXT_DAYS);
  const ctxTo = addDays(to, CONTEXT_DAYS);
  const all = async (sql, ...binds) => (await db.prepare(sql).bind(...binds).all()).results;
  const employees = await all(
    `SELECT CAST(f.id AS INTEGER) AS id, UPPER(COALESCE(f.funcao, '')) AS funcao
       FROM funcionarios f
      WHERE f.empresa_id = ? AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'`, tenantId);
  const allocations = await all(
    `SELECT CAST(ea.funcionario_id AS INTEGER) AS funcionario_id, ea.data_inicio, ea.data_fim,
            UPPER(COALESCE(ea.situacao_tipo, '')) AS situacao_tipo
       FROM escala_alocacoes ea
       JOIN funcionarios f ON f.id = ea.funcionario_id AND f.empresa_id = ? AND f.deleted_at IS NULL
      WHERE ea.deleted_at IS NULL AND LOWER(COALESCE(ea.status, '')) <> 'cancelado'
        AND ea.data_inicio <= ? AND ea.data_fim >= ?`, tenantId, ctxTo, ctxFrom);
  const manualAbsence = await all(
    `SELECT CAST(ee.funcionario_id AS INTEGER) AS funcionario_id, ee.data_inicio, ee.data_fim
       FROM escala_eventos ee
       JOIN escalas_mensais em ON em.id = ee.escala_id AND em.empresa_id = ? AND em.deleted_at IS NULL
      WHERE ee.deleted_at IS NULL AND LOWER(COALESCE(ee.status, 'confirmado')) <> 'cancelado'
        AND COALESCE(ee.gerado_automaticamente, 0) = 0
        AND LOWER(ee.tipo_evento) IN (${MANUAL_ABSENCE_EVENTS.map(() => '?').join(', ')})
        AND ee.data_inicio <= ? AND ee.data_fim >= ?`, tenantId, ...MANUAL_ABSENCE_EVENTS, to, from);
  const baseFortnights = await all(
    `SELECT CAST(f.id AS INTEGER) AS funcionario_id, eq.data_inicio, eq.data_fim
       FROM funcionarios f
       JOIN escalas_quinzenas eq ON eq.empresa_id = f.empresa_id AND eq.deleted_at IS NULL
        AND eq.numero = ${QUINZENA_NUMERO}
      WHERE f.empresa_id = ? AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1
        AND eq.data_inicio <= ? AND eq.data_fim >= ?`, tenantId, to, from);
  return { employees, allocations, manualAbsence, baseFortnights };
}

async function loadDayFacts(db, tenantId, date) {
  const all = async (sql, ...binds) => (await db.prepare(sql).bind(...binds).all()).results;
  const checkins = await all(
    `SELECT DISTINCT CAST(funcionario_id AS INTEGER) AS id FROM frms_fadiga_checkin
      WHERE empresa_id = ? AND data_checkin = ? AND deleted_at IS NULL`, tenantId, date);
  const evd = await all(
    `SELECT CAST(pic_id AS INTEGER) AS pic, CAST(sic_id AS INTEGER) AS sic FROM escala_voo_diaria
      WHERE empresa_id = ? AND data = ? AND deleted_at IS NULL AND UPPER(COALESCE(status, '')) <> 'CANCELADA'`, tenantId, date);
  const jornada = await all(
    `SELECT DISTINCT CAST(j.tripulante_id AS INTEGER) AS id FROM frms_jornada j
       JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.empresa_id = ? AND f.deleted_at IS NULL
      WHERE j.empresa_id = f.empresa_id AND j.data = ? AND j.deleted_at IS NULL
        AND UPPER(COALESCE(j.origem, '')) = 'SIGVOOS'
        AND (COALESCE(j.horas_voo_minutos, 0) > 0 OR COALESCE(j.duracao_jornada_minutos, 0) > 0
             OR j.hora_apresentacao IS NOT NULL OR j.hora_termino IS NOT NULL)`, tenantId, date);
  return {
    checkins: new Set(checkins.map((row) => Number(row.id))),
    evd: new Set(evd.flatMap((row) => [Number(row.pic), Number(row.sic)]).filter((id) => Number.isInteger(id) && id > 0)),
    jornada: new Set(jornada.map((row) => Number(row.id))),
  };
}

export async function runValidation({ db, loadDailyCheckinObligations, from, to, tenantId = TENANT_ID, onProgress = () => {} }) {
  const dates = listDates(from, to);
  const facts = await loadWindowFacts(db, tenantId, from, to);
  const allEmployees = new Set(facts.employees.map((row) => Number(row.id)));
  const crew = new Set(facts.employees.filter((row) => CREW_FUNCTIONS.includes(row.funcao)).map((row) => Number(row.id)));
  const days = [];
  for (const date of dates) {
    const obligations = await loadDailyCheckinObligations(db, tenantId, date);
    const dayFacts = await loadDayFacts(db, tenantId, date);
    const legacyRoster = new Set(
      facts.baseFortnights
        .filter((row) => row.data_inicio <= date && date <= row.data_fim)
        .map((row) => Number(row.funcionario_id)),
    );
    days.push(evaluateDay({
      empresaId: tenantId, date, crew, allEmployees, obligations,
      oracle: { ...dayFacts, allocations: facts.allocations, manualAbsence: facts.manualAbsence, legacyRoster },
    }));
    onProgress(date);
  }
  return { summary: summarize(days), days, crewSize: crew.size };
}

export async function main() {
  const expectedSha = String(process.env.EXPECTED_SHA || '');
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || process.env.CONFIRM_READONLY !== CONFIRMATION) {
    throw new Error('READ_ONLY_CONFIRMATION_REJECTED');
  }
  const from = String(process.env.WINDOW_FROM || '');
  const to = String(process.env.WINDOW_TO || '');
  const stats = { queries: 0 };
  const db = createReadOnlyD1(queryD1, stats);
  const tenant = await db.prepare('SELECT nome, codigo FROM empresas WHERE id = ? AND ativo = 1 AND deleted_at IS NULL').bind(TENANT_ID).all();
  if (tenant.results.length !== 1
    || !/costa\s*(?:do\s*)?sol|\bcds\b/i.test(`${tenant.results[0].nome || ''} ${tenant.results[0].codigo || ''}`)) {
    throw new Error('EXPECTED_PRODUCTION_TENANT_NOT_CONFIRMED');
  }
  const bundle = await import(pathToFileURL(String(process.env.OBLIGATION_BUNDLE || '')).href);
  if (typeof bundle.loadDailyCheckinObligations !== 'function') throw new Error('OBLIGATION_BUNDLE_INVALID');
  const result = await runValidation({
    db, loadDailyCheckinObligations: bundle.loadDailyCheckinObligations, from, to,
  });
  const report = {
    source: 'PRODUCTION_READONLY_REAL_RULE_VS_INDEPENDENT_ORACLE',
    tenant: 'Costa do Sol',
    reviewedSourceSha: expectedSha,
    deployedWorkerSha: String(process.env.DEPLOYED_WORKER_SHA || ''),
    window: { from, to },
    crew_in_scope: result.crewSize,
    queries: stats.queries,
    writes: 0,
    generatedAtUtc: new Date().toISOString(),
    ...result.summary,
    per_day: result.days.map((day) => ({
      date: day.date, status: day.status, gap_crew_days: day.gap_crew_days,
      legacy_pending_no_checkin: day.legacy_pending_no_checkin, violations: day.violations.length,
    })),
  };
  const file = String(process.env.AUDIT_REPORT_PATH || '');
  if (!file.startsWith('/') || !file.endsWith('.json')) throw new Error('REPORT_PATH_INVALID');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`FRMS_CHECKIN_OBLIGATION_READONLY_DONE days=${result.summary.days} violations=${result.summary.violation_count} queries=${stats.queries} writes=0`);
  if (result.summary.violation_count > 0) process.exitCode = 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FRMS_CHECKIN_OBLIGATION_READONLY_FAILED:${String(error.message).replace(/https?:\/\/\S+/g, '<url>')}`);
    process.exitCode = 1;
  });
}
