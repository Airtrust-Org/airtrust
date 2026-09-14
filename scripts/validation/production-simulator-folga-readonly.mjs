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

export function flattenPairedBlocks(proposal) {
  return (proposal?.classes || [])
    .flatMap((trainingClass) => trainingClass?.blocks || [])
    .filter((block) => Array.isArray(block?.sessions) && block.sessions.length >= 2)
    .sort((left, right) =>
      String(left.target_date || '').localeCompare(String(right.target_date || '')) ||
      String(left.block_id || '').localeCompare(String(right.block_id || '')),
    );
}

export function flattenProofCandidateBlocks(proposal) {
  return (proposal?.classes || [])
    .flatMap((trainingClass) => trainingClass?.blocks || [])
    .filter((block) => Array.isArray(block?.sessions) && block.sessions.length >= 1)
    .sort((left, right) =>
      Number(right.sessions?.length || 0) - Number(left.sessions?.length || 0) ||
      String(left.target_date || '').localeCompare(String(right.target_date || '')) ||
      String(left.block_id || '').localeCompare(String(right.block_id || '')),
    );
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

async function findRealFixedFortnightPairProof({ base, token, proposal, referenceDate }) {
  for (const block of flattenPairedBlocks(proposal)) {
    const [anchor, partner] = block.sessions;
    const candidates = await authFetch(base, token, '/api/simuladores/planejamento-v2/candidatos', {
      method: 'POST',
      body: JSON.stringify({ reference_date: referenceDate, anchor, candidates: [partner] }),
    });
    if (candidates.status !== 200 || candidates.json?.success !== true) continue;
    const match = (candidates.json?.data?.candidates || []).find(
      (candidate) => String(candidate?.need_id || '') === String(partner.need_id),
    );
    const commonDate = String(match?.availability?.common_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(commonDate)) continue;
    return { block, commonDate };
  }
  return null;
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

  const blocks = flattenProofCandidateBlocks(proposal);
  assert(blocks.length > 0, 'NO_REAL_SESSION_BLOCK_IN_PROPOSAL');
  const pairing = proposal?.summary?.roster_pairing || {};
  assert(pairing.source === 'FUNCIONARIO_ESCALA_1_2', 'PLANNER_NOT_USING_EMPLOYEE_FIXED_SCALE');
  assert(Number(pairing.employees_with_fixed_fortnight || 0) > 0, 'NO_EMPLOYEE_FIXED_SCALE_IN_PROPOSAL');
  assert(Number(pairing.eligible_date_count || 0) > 0, 'NO_DERIVED_ELIGIBLE_FOLGA_DATE');

  const proposalSummary = {
    trainings: Number(proposal?.summary?.trainings || 0),
    session_requirements: Number(proposal?.summary?.session_requirements || 0),
    paired_blocks: Number(proposal?.summary?.paired_blocks || 0),
    unmatched_blocks: Number(proposal?.summary?.unmatched_blocks || 0),
    classes: Number(proposal?.summary?.classes || 0),
    exceptions: Array.isArray(proposal?.exceptions) ? proposal.exceptions.length : 0,
  };
  const fixedScaleDiagnostic = {
    source: pairing.source,
    employees_with_fixed_fortnight: Number(pairing.employees_with_fixed_fortnight || 0),
    employees_with_eligible_dates: Number(pairing.employees_with_eligible_dates || 0),
    eligible_date_count: Number(pairing.eligible_date_count || 0),
    calendar_windows: Number(pairing.calendar_windows || 0),
    calendar_fallback_windows: Number(pairing.calendar_fallback_windows || 0),
    paired_candidate_blocks: flattenPairedBlocks(proposal).length,
  };

  const proof = await findRealFixedFortnightPairProof({ base, token, proposal, referenceDate });
  if (!proof) {
    process.stdout.write(JSON.stringify({
      ok: true,
      tenant_id: tenantId,
      roster_policy: config.roster_policy,
      proposal_mode: proposal.mode,
      proof_mode: 'FIXED_SCALE_PROPOSAL_NO_PAIR_AVAILABLE',
      proposal_summary: proposalSummary,
      fixed_scale_diagnostic: fixedScaleDiagnostic,
      selected_block_sessions: 0,
      monthly_published_roster_required: false,
      folga_validation: null,
      writes: 0,
      pii_emitted: false,
    }, null, 2));
    return;
  }

  const needIds = proof.block.sessions.map((session) => String(session.need_id));
  const comparison = await authFetch(base, token, '/api/simuladores/planejamento-v2/comparar-cae', {
    method: 'POST',
    body: JSON.stringify({
      reference_date: referenceDate,
      session_needs: proof.block.sessions,
      pairing_blocks: [{ need_ids: needIds }],
      cae_availability: buildSyntheticCaeAvailability(proof.block, proof.commonDate),
    }),
  });
  assert(comparison.status === 200 && comparison.json?.success === true, 'CAE_COMPARISON_FAILED');
  const scheduled = findMatchingScheduledBlock(comparison.json, needIds);
  assert(scheduled?.schedule_status === 'SCHEDULED', 'FIXED_SCALE_FOLGA_NOT_SCHEDULED');
  const rosterStates = (scheduled?.roster || []).map((row) => String(row?.state || ''));
  assert(
    rosterStates.length >= proof.block.sessions.length && rosterStates.every((state) => state === 'FOLGA'),
    'FIXED_SCALE_FOLGA_NOT_PROVEN',
  );

  process.stdout.write(JSON.stringify({
    ok: true,
    tenant_id: tenantId,
    roster_policy: config.roster_policy,
    proposal_mode: proposal.mode,
    proof_mode: 'FULL_FIXED_SCALE_FOLGA',
    proposal_summary: proposalSummary,
    fixed_scale_diagnostic: fixedScaleDiagnostic,
    selected_block_sessions: proof.block.sessions.length,
    monthly_published_roster_required: false,
    folga_validation: {
      schedule_status: scheduled.schedule_status,
      roster_states: [...new Set(rosterStates)],
      common_date_resolved: true,
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
