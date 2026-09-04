#!/usr/bin/env node

// Staging-only authenticated acceptance for simulator planning persistence (#275).
// Uses only qa_examiner_training synthetic data. It never targets production,
// never prints tokens/passwords/employee PII, and never materializes simulator
// sessions or qualifications from a persisted draft.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  assert,
  assertAllowedStagingBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
  maskEmail,
} from '../smoke-auth-common.mjs';

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const QUAL_CODE = 'QA-SIM-PLN-AW139';
const MODEL_CODE = 'QA-SIM-PLN-S01';
const MARKER = 'QA_SIMULATOR_PLANNING_SMOKE';

function isoDay(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function plusMinutes(hhmm, minutes) {
  const [hour, minute] = hhmm.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  const dayOffset = Math.floor(total / 1440);
  const within = ((total % 1440) + 1440) % 1440;
  return {
    time: `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`,
    dayOffset,
  };
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function authFetch(baseUrl, token, path, options = {}) {
  return fetchJson(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

function rows(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

function uniqueNeeds(proposal) {
  const byId = new Map();
  for (const trainingClass of proposal?.classes || []) {
    for (const block of trainingClass?.blocks || []) {
      for (const need of block?.sessions || []) {
        if (need?.need_id) byId.set(String(need.need_id), need);
      }
    }
  }
  return [...byId.values()];
}

function withQaMarker(proposal, className) {
  return {
    ...proposal,
    qa_marker: MARKER,
    classes: (proposal.classes || []).map((trainingClass, index) => ({
      ...trainingClass,
      class_name: index === 0 ? className : trainingClass.class_name,
    })),
  };
}

function draftPayload({ inicio, fim, workflowStatus, proposal, baseNeeds, locks, caeDocument = null }) {
  return {
    vencimento_inicio: inicio,
    vencimento_fim: fim,
    workflow_status: workflowStatus,
    proposal,
    base_needs: baseNeeds,
    locks,
    cae_file_name: caeDocument ? 'qa-cae-disponibilidade.pdf' : null,
    cae_file_key: null,
    cae_document: caeDocument,
  };
}

async function main() {
  const baseUrl = assertAllowedStagingBaseUrl(process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL);
  const email = String(process.env.QA_EXAMINER_ADMIN_EMAIL || 'qa-examiner-admin@staging.airtrust.invalid');
  const password = String(process.env.QA_EXAMINER_ADMIN_PASSWORD || '');
  assert(password, 'QA_EXAMINER_ADMIN_PASSWORD ausente.');

  const loginResult = await login(baseUrl, email, password);
  const token = extractAccessToken(loginResult);

  // Keep the synthetic QA tenant deterministic for pairing without changing any real company policy.
  const configUpdate = await authFetch(baseUrl, token, '/api/simuladores/planejamento-v2/config', {
    method: 'PUT',
    body: JSON.stringify({ roster_policy: 'AMBAS' }),
  });
  assert(configUpdate.status === 200, `config QA retornou ${configUpdate.status}`);
  assert(configUpdate.json?.data?.roster_policy === 'AMBAS', 'config QA não confirmou AMBAS');
  assert(
    Number(configUpdate.json?.data?.planning_horizon_days || 0) >= 90,
    'config QA não confirmou horizonte >= 90 dias',
  );

  const [funcionariosRes, tiposRes, modelosRes] = await Promise.all([
    authFetch(baseUrl, token, '/api/funcionarios'),
    authFetch(baseUrl, token, `/api/qualificacoes/tipos?search=${encodeURIComponent(QUAL_CODE)}&limit=20`),
    authFetch(baseUrl, token, '/api/simuladores/modelos-sessao'),
  ]);
  assert(funcionariosRes.status === 200, 'funcionarios QA indisponíveis');
  assert(tiposRes.status === 200, 'tipo QA de planejamento indisponível');
  assert(modelosRes.status === 200, 'modelos de sessão QA indisponíveis');

  const funcionarios = rows(funcionariosRes.json);
  const alfa = funcionarios.find((item) => item?.matricula === 'QA-PARTICIPANTE-ALFA');
  const bravo = funcionarios.find((item) => item?.matricula === 'QA-PARTICIPANTE-BRAVO');
  const qualification = rows(tiposRes.json).find((item) => String(item?.codigo || '').toUpperCase() === QUAL_CODE);
  const model = rows(modelosRes.json).find((item) => item?.codigo === MODEL_CODE);
  assert(
    alfa?.id && bravo?.id && qualification?.id && model?.id,
    `fixture QA de planejamento incompleta: alfa=${Boolean(alfa?.id)} bravo=${Boolean(bravo?.id)} tipo=${Boolean(qualification?.id)} modelo=${Boolean(model?.id)}`,
  );

  const inicio = isoDay(60);
  const fim = isoDay(120);
  const referenceDate = isoDay(0);
  const className = `QA Planning Persistence ${Date.now()}`;

  const generated = await authFetch(baseUrl, token, '/api/simuladores/planejamento-v2/proposta', {
    method: 'POST',
    body: JSON.stringify({
      vencimento_inicio: inicio,
      vencimento_fim: fim,
      data_referencia: referenceDate,
    }),
  });
  assert(generated.status === 200, `gerar proposta retornou ${generated.status}`);
  const generatedProposal = generated.json?.data;
  assert(generatedProposal && Array.isArray(generatedProposal.classes), 'proposta QA sem classes');

  const needs = uniqueNeeds(generatedProposal).filter(
    (need) =>
      Number(need.qualification_type_id) === Number(qualification.id) &&
      Number(need.session_model_id) === Number(model.id) &&
      [Number(alfa.id), Number(bravo.id)].includes(Number(need.employee_id)),
  );
  assert(needs.length === 2, `proposta QA esperava 2 necessidades; recebeu ${needs.length}`);

  const locks = [{
    anchor_need_id: String(needs[0].need_id),
    partner_need_id: String(needs[1].need_id),
  }];

  const repaired = await authFetch(baseUrl, token, '/api/simuladores/planejamento-v2/reparear', {
    method: 'POST',
    body: JSON.stringify({ reference_date: referenceDate, session_needs: needs, locks }),
  });
  assert(repaired.status === 200, `reparear QA retornou ${repaired.status}`);
  assert(Array.isArray(repaired.json?.data?.classes), 'reparear QA sem classes');
  const manualProposal = withQaMarker(
    {
      ...generatedProposal,
      classes: repaired.json.data.classes,
      summary: { ...(generatedProposal.summary || {}), ...(repaired.json.data.summary || {}) },
      cae_comparison: repaired.json.data.cae_comparison ?? null,
    },
    className,
  );

  const created = await authFetch(baseUrl, token, '/api/simuladores/planejamento-v2/rascunhos', {
    method: 'POST',
    body: JSON.stringify(draftPayload({
      inicio,
      fim,
      workflowStatus: 'AGUARDANDO_CAE',
      proposal: manualProposal,
      baseNeeds: needs,
      locks,
    })),
  });
  assert(created.status === 201, `persistência inicial retornou ${created.status}`);
  const draftId = String(created.json?.data?.draft_id || '');
  assert(draftId.length > 20, 'persistência inicial sem draft_id');
  assert(created.json?.data?.workflow_status === 'AGUARDANDO_CAE', 'status inicial divergente');

  // Simula sair/retomar: nova leitura do recurso persistido, sem reaproveitar objeto em memória.
  const resumed = await authFetch(
    baseUrl,
    token,
    `/api/simuladores/planejamento-v2/rascunhos/${encodeURIComponent(draftId)}`,
  );
  assert(resumed.status === 200, `retomada retornou ${resumed.status}`);
  assert(resumed.json?.data?.workflow_status === 'AGUARDANDO_CAE', 'retomada perdeu status');
  assert(resumed.json?.data?.locks?.length === 1, 'retomada perdeu ajuste manual de dupla');
  assert(resumed.json?.data?.proposal?.qa_marker === MARKER, 'retomada perdeu snapshot da proposta');

  const firstBlock = resumed.json?.data?.proposal?.classes?.[0]?.blocks?.[0];
  assert(firstBlock?.target_date && Number(firstBlock?.duration_minutes) > 0, 'bloco QA inválido');
  const startTime = '08:00';
  const duration = Number(firstBlock.duration_minutes);
  const end = plusMinutes(startTime, duration);
  const slotDate = String(firstBlock.target_date);
  const caeDocument = {
    schema_version: 'airtrust.cae_availability.v1',
    provider: 'CAE',
    source: {
      kind: 'TEXT',
      filename: 'qa-cae-disponibilidade.pdf',
      received_at: new Date().toISOString(),
      extracted_at: new Date().toISOString(),
    },
    slots: [{
      external_ref: 'QA-CAE-SLOT-1',
      equipment: 'AW139',
      date: slotDate,
      start_time: startTime,
      end_date: addDays(slotDate, end.dayOffset),
      end_time: end.time,
      duration_minutes: duration,
      state: 'OFFERED',
      company: 'QA Synthetic',
      participants_mentioned: [],
      confidence: 1,
    }],
    warnings: [],
  };

  const caeReceived = await authFetch(
    baseUrl,
    token,
    `/api/simuladores/planejamento-v2/rascunhos/${encodeURIComponent(draftId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(draftPayload({
        inicio,
        fim,
        workflowStatus: 'CAE_RECEBIDA',
        proposal: manualProposal,
        baseNeeds: needs,
        locks,
        caeDocument,
      })),
    },
  );
  assert(caeReceived.status === 200, `CAE_RECEBIDA retornou ${caeReceived.status}`);
  assert(caeReceived.json?.data?.workflow_status === 'CAE_RECEBIDA', 'status CAE_RECEBIDA não persistiu');

  const compared = await authFetch(baseUrl, token, '/api/simuladores/planejamento-v2/reparear', {
    method: 'POST',
    body: JSON.stringify({
      reference_date: referenceDate,
      session_needs: needs,
      locks,
      cae_availability: caeDocument,
    }),
  });
  assert(compared.status === 200, `comparação CAE retornou ${compared.status}`);
  const comparison = compared.json?.data?.cae_comparison;
  assert(comparison && typeof comparison === 'object', 'comparação CAE ausente');
  const finalStatus =
    Number(comparison.no_slot_blocks || 0) === 0 &&
    Number(comparison.unmatched_crew_blocks || 0) === 0
      ? 'PLANEJADO'
      : 'REPLANEJAR';

  const finalProposal = withQaMarker(
    {
      ...manualProposal,
      classes: compared.json?.data?.classes || manualProposal.classes,
      summary: { ...(manualProposal.summary || {}), ...(compared.json?.data?.summary || {}) },
      cae_comparison: comparison,
    },
    className,
  );

  const finalized = await authFetch(
    baseUrl,
    token,
    `/api/simuladores/planejamento-v2/rascunhos/${encodeURIComponent(draftId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(draftPayload({
        inicio,
        fim,
        workflowStatus: finalStatus,
        proposal: finalProposal,
        baseNeeds: needs,
        locks,
        caeDocument,
      })),
    },
  );
  assert(finalized.status === 200, `finalização retornou ${finalized.status}`);
  assert(finalized.json?.data?.workflow_status === finalStatus, 'status final não persistiu');

  const reopenedFinal = await authFetch(
    baseUrl,
    token,
    `/api/simuladores/planejamento-v2/rascunhos/${encodeURIComponent(draftId)}`,
  );
  assert(reopenedFinal.status === 200, 'reabertura final falhou');
  assert(reopenedFinal.json?.data?.workflow_status === finalStatus, 'reabertura final perdeu status');
  assert(reopenedFinal.json?.data?.locks?.length === 1, 'reabertura final perdeu lock manual');
  assert(reopenedFinal.json?.data?.cae_document?.slots?.length === 1, 'reabertura final perdeu CAE');

  const list = await authFetch(baseUrl, token, '/api/simuladores/planejamento-v2/rascunhos');
  assert(
    list.status === 200 && rows(list.json).some((item) => item?.draft_id === draftId),
    'rascunho final não aparece na listagem',
  );

  let crossTenantStatus = null;
  if (process.env.STAGING_SMOKE_EMAIL && process.env.STAGING_SMOKE_PASSWORD) {
    const foreignLogin = await login(
      baseUrl,
      process.env.STAGING_SMOKE_EMAIL,
      process.env.STAGING_SMOKE_PASSWORD,
    );
    const foreignToken = extractAccessToken(foreignLogin);
    const crossTenant = await authFetch(
      baseUrl,
      foreignToken,
      `/api/simuladores/planejamento-v2/rascunhos/${encodeURIComponent(draftId)}`,
    );
    crossTenantStatus = crossTenant.status;
    assert(crossTenant.status === 404, `cross-tenant retornou ${crossTenant.status}, esperado 404`);
  }

  const statePath =
    process.env.QA_SIMULATOR_STATE_PATH ||
    'test-results/staging-simulator-planning/state.json';
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    JSON.stringify(
      {
        draft_id: draftId,
        class_name: className,
        workflow_status: finalStatus,
        qa_marker: MARKER,
      },
      null,
      2,
    ) + '\n',
  );

  const report = {
    ok: true,
    admin: maskEmail(email),
    generated_proposal: true,
    manual_pair_lock_persisted: true,
    resumed_before_cae: true,
    cae_received_persisted: true,
    cae_compared: true,
    final_status: finalStatus,
    reopened_final: true,
    list_contains_draft: true,
    cross_tenant_status: crossTenantStatus,
    state_path: statePath,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`STAGING_SIMULATOR_PLANNING_QA_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
