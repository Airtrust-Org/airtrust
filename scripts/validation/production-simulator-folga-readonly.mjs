#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  assertAllowedProductionBaseUrl,
  decodeJwtPayload,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

const DEFAULT_BASE_URL = 'https://api.airtrust.online';
const EXPECTED_TENANT_ID = 6;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function addDaysIso(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function blockDeadline(block, preferredSessionsPerDay = 1) {
  const perDay = Math.max(1, Math.trunc(Number(preferredSessionsPerDay) || 1));
  return (block.sessions || [])
    .map((session) => {
      const remainingAfter = Math.max(
        0,
        Number(session.training_session_count || 0) - Number(session.session_order || 0),
      );
      return addDaysIso(String(session.expiry_date), -Math.floor(remainingAfter / perDay));
    })
    .sort()[0] || String(block.target_date || '');
}

export function flattenPairedBlocks(proposal) {
  return (proposal?.classes || [])
    .flatMap((trainingClass) => trainingClass?.blocks || [])
    .filter((block) => Array.isArray(block?.sessions) && block.sessions.length >= 2);
}

function eachDay(start, end) {
  const days = [];
  for (let day = start; day <= end; day = addDaysIso(day, 1)) days.push(day);
  return days;
}

function rowCoversDate(row, date) {
  return String(row?.data_inicio || '') <= date && String(row?.data_fim || '') >= date;
}

export function classifyRosterRowsForEmployee(rows, employeeId, date) {
  const active = rows.filter(
    (row) =>
      String(row?.funcionario_id) === String(employeeId) &&
      String(row?.status || '').toLowerCase() !== 'cancelado' &&
      rowCoversDate(row, date),
  );
  if (active.length === 0) return 'DESCONHECIDO';

  const folga = active.some((row) => String(row?.situacao_tipo || '').trim().toUpperCase() === 'FOLGA');
  const work = active.some(
    (row) =>
      !String(row?.situacao_tipo || '').trim() &&
      (row?.aeronave_id != null || Boolean(String(row?.funcao || '').trim())),
  );

  if (folga && work) return 'DESCONHECIDO';
  if (folga) return 'FOLGA';
  if (work) return 'TRABALHO';
  return 'DESCONHECIDO';
}

export function findCommonRosterDate({ rows, employeeIds, start, end, wantedState }) {
  for (const date of eachDay(start, end)) {
    const states = employeeIds.map((id) => classifyRosterRowsForEmployee(rows, id, date));
    if (states.every((state) => state === wantedState)) return date;
  }
  return null;
}

function slotEnd(startTime, durationMinutes, date) {
  const start = Date.parse(`${date}T${startTime}:00Z`);
  const end = new Date(start + Number(durationMinutes) * 60_000).toISOString();
  return { endDate: end.slice(0, 10), endTime: end.slice(11, 16) };
}

export function buildSyntheticCaeAvailability(block, date) {
  const startTime = '10:00';
  const duration = Number(block.duration_minutes);
  const { endDate, endTime } = slotEnd(startTime, duration, date);
  return {
    schema_version: 'airtrust.cae_availability.v1',
    provider: 'CAE',
    source: {
      kind: 'TEXT',
      filename: 'airtrust-readonly-validation-synthetic-slot.txt',
      received_at: new Date().toISOString(),
      extracted_at: new Date().toISOString(),
    },
    slots: [{
      external_ref: 'AIRTRUST-READONLY-VALIDATION',
      equipment: String(block.equipment),
      date,
      start_time: startTime,
      end_date: endDate,
      end_time: endTime,
      duration_minutes: duration,
      state: 'OFFERED',
      company: 'READONLY_VALIDATION',
      participants_mentioned: [],
      confidence: 1,
    }],
    warnings: ['Synthetic CAE slot used only in request memory for read-only policy validation.'],
  };
}

function findMatchingScheduledBlock(payload, needIds) {
  const expected = [...needIds].map(String).sort().join('|');
  for (const trainingClass of payload?.data?.classes || []) {
    for (const block of trainingClass?.blocks || []) {
      const actual = (block?.sessions || []).map((session) => String(session.need_id)).sort().join('|');
      if (actual === expected) return block;
    }
  }
  return null;
}

async function authFetch(base, token, path, options = {}) {
  return fetchJson(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
}

function relevantScale(scale, start, end) {
  const year = Number(scale?.ano);
  const month = Number(scale?.mes);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return false;
  const first = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12
    ? `${String(year + 1).padStart(4, '0')}-01-01`
    : `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-01`;
  const last = addDaysIso(next, -1);
  return first <= end && last >= start;
}

async function main() {
  const email = String(process.env.AIRTRUST_LOGIN || '');
  const password = String(process.env.AIRTRUST_PASSWORD || '');
  assert(email && password, 'CREDENTIALS_REQUIRED_VIA_EPHEMERAL_ENV');

  const base = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || DEFAULT_BASE_URL);
  const session = await login(base, email, password);
  const token = extractAccessToken(session);
  const claims = decodeJwtPayload(token);
  const tenantId = Number(claims?.empresa_id || 0);
  assert(tenantId === EXPECTED_TENANT_ID, `TENANT_MISMATCH:${tenantId}`);

  const configResult = await authFetch(base, token, '/api/simuladores/planejamento-v2/config');
  assert(configResult.status === 200 && configResult.json?.success === true, 'CONFIG_READ_FAILED');
  const config = configResult.json.data;
  assert(config?.roster_policy === 'FOLGA', 'ROSTER_POLICY_NOT_FOLGA');

  const referenceDate = String(process.env.FOLGA_REFERENCE_DATE || new Date().toISOString().slice(0, 10));
  const horizon = Math.max(1, Math.min(366, Number(config?.planning_horizon_days || 180)));
  const expiryEnd = String(process.env.FOLGA_EXPIRY_END || addDaysIso(referenceDate, horizon));

  const proposalResult = await authFetch(base, token, '/api/simuladores/planejamento-v2/proposta', {
    method: 'POST',
    body: JSON.stringify({
      vencimento_inicio: referenceDate,
      vencimento_fim: expiryEnd,
      data_referencia: referenceDate,
    }),
  });
  assert(proposalResult.status === 200 && proposalResult.json?.success === true, 'PROPOSAL_FAILED');
  const proposal = proposalResult.json.data;
  assert(proposal?.mode === 'PREVIEW_ONLY', 'PROPOSAL_NOT_PREVIEW_ONLY');
  assert(proposal?.config?.roster_policy === 'FOLGA', 'PROPOSAL_POLICY_NOT_FOLGA');

  const publishedScalesResult = await authFetch(base, token, '/api/escalas?status=publicada');
  assert(
    publishedScalesResult.status === 200 && publishedScalesResult.json?.success === true,
    'PUBLISHED_ROSTER_LIST_FAILED',
  );
  const scales = Array.isArray(publishedScalesResult.json?.data) ? publishedScalesResult.json.data : [];

  const candidates = flattenPairedBlocks(proposal);
  assert(candidates.length > 0, 'NO_REAL_PAIRED_NEED_IN_PROPOSAL');

  let proof = null;
  for (const block of candidates) {
    const deadline = blockDeadline(block, config?.preferred_sessions_per_day);
    if (!deadline || deadline < referenceDate) continue;
    const employeeIds = [...new Set(block.sessions.map((session) => Number(session.employee_id)))];
    if (employeeIds.length < 2 || employeeIds.some((id) => !Number.isFinite(id) || id <= 0)) continue;

    const relevant = scales.filter((scale) => relevantScale(scale, referenceDate, deadline));
    const rows = [];
    for (const scale of relevant) {
      const scaleId = String(scale?.id || '');
      if (!scaleId) continue;
      const allocations = await authFetch(
        base,
        token,
        `/api/escalas/${encodeURIComponent(scaleId)}/alocacoes`,
      );
      if (allocations.status !== 200 || allocations.json?.success !== true) continue;
      const values = allocations.json?.data?.alocacoes;
      if (Array.isArray(values)) rows.push(...values);
    }

    const folgaDate = findCommonRosterDate({
      rows,
      employeeIds,
      start: referenceDate,
      end: deadline,
      wantedState: 'FOLGA',
    });
    const trabalhoDate = findCommonRosterDate({
      rows,
      employeeIds,
      start: referenceDate,
      end: deadline,
      wantedState: 'TRABALHO',
    });
    if (folgaDate && trabalhoDate) {
      proof = { block, employeeIds, folgaDate, trabalhoDate };
      break;
    }
  }
  assert(proof, 'NO_REAL_PAIR_WITH_BOTH_FOLGA_AND_TRABALHO_EVIDENCE');

  const needIds = proof.block.sessions.map((session) => String(session.need_id));
  const repairBase = {
    reference_date: referenceDate,
    session_needs: proof.block.sessions,
    locks: [],
  };

  const folgaResult = await authFetch(base, token, '/api/simuladores/planejamento-v2/reparear', {
    method: 'POST',
    body: JSON.stringify({
      ...repairBase,
      cae_availability: buildSyntheticCaeAvailability(proof.block, proof.folgaDate),
    }),
  });
  assert(folgaResult.status === 200 && folgaResult.json?.success === true, 'FOLGA_REPAIR_FAILED');
  const folgaBlock = findMatchingScheduledBlock(folgaResult.json, needIds);
  assert(folgaBlock?.schedule_status === 'SCHEDULED', 'FOLGA_NOT_SCHEDULED');
  const folgaStates = (folgaBlock?.roster || []).map((row) => String(row?.state || ''));
  assert(folgaStates.length >= 2 && folgaStates.every((state) => state === 'FOLGA'), 'FOLGA_ROSTER_NOT_PROVEN');

  const trabalhoResult = await authFetch(base, token, '/api/simuladores/planejamento-v2/reparear', {
    method: 'POST',
    body: JSON.stringify({
      ...repairBase,
      cae_availability: buildSyntheticCaeAvailability(proof.block, proof.trabalhoDate),
    }),
  });
  assert(trabalhoResult.status === 200 && trabalhoResult.json?.success === true, 'TRABALHO_REPAIR_FAILED');
  const trabalhoBlock = findMatchingScheduledBlock(trabalhoResult.json, needIds);
  assert(trabalhoBlock && trabalhoBlock.schedule_status !== 'SCHEDULED', 'TRABALHO_WAS_SCHEDULED_UNDER_FOLGA_POLICY');

  process.stdout.write(JSON.stringify({
    ok: true,
    tenant_id: tenantId,
    roster_policy: config.roster_policy,
    proposal_mode: proposal.mode,
    published_roster_used: true,
    folga_validation: {
      schedule_status: folgaBlock.schedule_status,
      roster_states: [...new Set(folgaStates)],
    },
    trabalho_validation: {
      schedule_status: trabalhoBlock.schedule_status,
      result: 'REJECTED_UNDER_FOLGA',
    },
    writes: 0,
    pii_emitted: false,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ ok: false, error: message, writes: 0, pii_emitted: false }));
    process.exit(1);
  });
}
