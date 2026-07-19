#!/usr/bin/env node

// source_reference: reproducible, authenticated smoke for the shared-session +
// examiner-training universal fichas feature set (PRs #278/#279/#280/#283),
// using only the synthetic QA fixture created by
// scripts/staging/seed-qa-examiner-training.mjs — never real Costa do Sol data.
// operational_decision: read-mostly with a small number of additive, QA-tenant
// -scoped writes (create/convert/sign sessions under the QA fixture). Never
// touches any other tenant. Produces a sanitized JSON report — no tokens, no
// passwords, no personal data.
// dry_run_required: not applicable — this smoke has no destructive path
// (sessions created belong to the QA fixture and are safe to leave behind for
// inspection; rollback of the whole fixture is scripts/staging/seed-qa-examiner-training.mjs --rollback).
// rollback_plan_required: see docs/ops/staging-release-runbook.md.
// KNOWN LIMITATION: request/response field names below were derived from
// reading worker-airtrust/src/routes/simuladores-shared-session-logic.ts and
// simuladores-fichas*.ts, not from an actual authenticated run against
// staging (out of scope for this PR — no procedure execution against real
// staging was authorized). Before the first real run, verify the exact
// contract for GET /api/funcionarios, GET /api/simuladores,
// GET /api/simuladores/modelos-sessao, GET /api/simuladores/fichas, and
// POST /api/simuladores/fichas/:id/pdf against the live OpenAPI/zod
// validators, and update this script if any field name has drifted.

import {
  assert,
  assertAllowedStagingBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
  maskEmail,
} from '../smoke-auth-common.mjs';

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';

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

// Mesmo fuso operacional e mesma técnica (Intl + locale en-CA para YYYY-MM-DD)
// usados por worker-airtrust/src/utils/ficha-availability.ts (SIMULADORES_OPERATIONAL_TIMEZONE /
// saoPauloNowKey) — não há um módulo JS puro compartilhado para importar aqui
// (o backend é TypeScript compilado no Worker), então a lógica é replicada
// literalmente para garantir que "hoje" neste script seja sempre o mesmo dia
// civil que o gate de disponibilidade do PDF usa no servidor, mesmo quando UTC
// já virou o dia seguinte (ou ainda está no dia anterior) no Brasil.
export const SIMULADORES_OPERATIONAL_TIMEZONE = 'America/Sao_Paulo';

export function saoPauloTodayDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SIMULADORES_OPERATIONAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Horário único por execução, dentro do próprio dia civil (nunca cruza a
// meia-noite): usada apenas para a sessão dedicada ao teste de PDF (I_pdf),
// que precisa ficar no dia de hoje e por isso não pode se apoiar no
// randomDayOffset (dias no futuro) usado pelos demais cenários para evitar
// colisão de agendamento — aqui a variação é de horário, não de dia.
// Nunca aceita 409 (ou qualquer status != 200) como PASS — o gate de
// disponibilidade "ficha só no dia" é comportamento de produto legítimo, não
// algo a contornar aqui.
export function isValidPdfResponse(pdfStatus) {
  return (
    pdfStatus?.status === 200 &&
    pdfStatus?.contentType?.includes('application/pdf') === true &&
    pdfStatus?.bytes > 0 &&
    pdfStatus?.hasPdfSignature === true
  );
}

export function pdfFixtureTimeWindow(random = Math.random()) {
  const WINDOW_START_MINUTES = 6 * 60; // 06:00
  const WINDOW_END_MINUTES = 22 * 60; // 22:00 — sessão de 60min sempre cabe antes disso
  const SLOT_MINUTES = 15;
  const slotCount = Math.floor((WINDOW_END_MINUTES - WINDOW_START_MINUTES - 60) / SLOT_MINUTES);
  const slot = Math.floor(random * slotCount);
  const startMinutes = WINDOW_START_MINUTES + slot * SLOT_MINUTES;
  const endMinutes = startMinutes + 60;
  const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  return { hora_inicio: toHHMM(startMinutes), hora_fim: toHHMM(endMinutes) };
}

async function main() {
  const baseUrl = assertAllowedStagingBaseUrl(process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL);
  const email = String(process.env.QA_EXAMINER_ADMIN_EMAIL || 'qa-examiner-admin@staging.airtrust.invalid');
  const password = String(process.env.QA_EXAMINER_ADMIN_PASSWORD || '');
  assert(password, 'QA_EXAMINER_ADMIN_PASSWORD é obrigatório para o smoke autenticado.');

  const report = { baseUrl, admin: maskEmail(email), scenarios: {}, generatedAtUtc: new Date().toISOString() };

  const loginResult = await login(baseUrl, email, password);
  const token = extractAccessToken(loginResult);

  // Resolve QA fixture IDs (created by scripts/staging/seed-qa-examiner-training.mjs)
  // by natural code — never hardcode numeric IDs, which are not stable across seeds.
  const funcionarios = await authFetch(baseUrl, token, '/api/funcionarios');
  const byMatricula = (matricula) =>
    (funcionarios.json?.data ?? []).find((f) => f.matricula === matricula)?.id ?? null;
  const instrutorId = byMatricula('QA-INSTRUTOR-EXAMINADOR');
  const participante1Id = byMatricula('QA-PARTICIPANTE-ALFA');
  const participante2Id = byMatricula('QA-PARTICIPANTE-BRAVO');

  const simuladores = await authFetch(baseUrl, token, '/api/simuladores');
  const simuladorId = (simuladores.json?.data ?? []).find((s) => s.nome === 'QA-SIM-01')?.id ?? null;

  const modelos = await authFetch(baseUrl, token, '/api/simuladores/modelos-sessao');
  const modeloIdByCodigo = (codigo) => (modelos.json?.data ?? []).find((m) => m.codigo === codigo)?.id ?? null;

  assert(instrutorId && participante1Id && participante2Id && simuladorId, 'Fixture QA incompleta — rode scripts/staging/seed-qa-examiner-training.mjs --apply primeiro.');

  const commonSessionFields = {
    hora_fim: '09:00',
    simulador_id: simuladorId,
    instrutor_id: instrutorId,
    participantes: [
      { funcionario_id: participante1Id },
      { funcionario_id: participante2Id },
    ],
  };

  // A. Capability
  {
    const { status, json } = await fetchJson(`${baseUrl}/api/capabilities`);
    const ok = status === 200 && json?.data?.simulador_shared_sessions === true;
    report.scenarios.A_capability = { ok, status, shared_sessions_enabled: json?.data?.simulador_shared_sessions };
  }

  // B. Sessão simples: criar, editar, reabrir, cancelar sem efeito.
  // NOTE: POST /sessoes (worker-airtrust/src/routes/simuladores-sessoes.ts)
  // requires horario_inicio/horario_fim (never hora_inicio/hora_fim — those
  // field names return a 400 immediately) plus simulador_id, instrutor_id and
  // a non-empty participantes array. An earlier version of this script used
  // the wrong field names and omitted these required fields, which produced
  // a guaranteed 400 here that silently cascaded into C/D/G being skipped
  // while still counting as passing in the final ok-check — fixed.
  let simpleSessionId = null;
  const randomDayOffset1 = 7 + Math.floor(Math.random() * 10000);
  const data1 = new Date(Date.now() + randomDayOffset1 * 86400000).toISOString().slice(0, 10);
  {
    const created = await authFetch(baseUrl, token, '/api/simuladores/sessoes', {
      method: 'POST',
      body: JSON.stringify({
        data: data1,
        horario_inicio: '08:00',
        horario_fim: '09:00',
        tipo_sessao: 'PER',
        simulador_id: simuladorId,
        instrutor_id: instrutorId,
        participantes: [
          { funcionario_id: participante1Id, funcao: 'PF' },
          { funcionario_id: participante2Id, funcao: 'PM' },
        ],
        observacoes: 'QA smoke — sessão simples (rollback via seed --rollback)',
      }),
    });
    simpleSessionId = created.json?.data?.id ?? created.json?.data?.sessao_id ?? created.json?.data?.sessaoId ?? null;
    const editOk = simpleSessionId
      ? (
          await authFetch(baseUrl, token, `/api/simuladores/sessoes/${simpleSessionId}`, {
            method: 'PUT',
            body: JSON.stringify({ observacoes: 'QA smoke — editado' }),
          })
        ).status === 200
      : false;
    report.scenarios.B_simple_session = {
      ok: created.status === 201 || created.status === 200,
      createStatus: created.status,
      editOk,
      sessionId: simpleSessionId,
    };
  }

  // C. Conversão simples → compartilhada.
  // NOTE: /converter-compartilhada validates the FULL sharedSessionRequestSchema
  // (data/hora_inicio/hora_fim/simulador_id/instrutor_id/participantes/segmentos)
  // describing the target state — it is not a delta endpoint. finalidade_codigo
  // is a purpose category (SOP_NORMAL | SOP_ANORMAL_EMERGENCIA | ATUACAO_EXAMINADOR
  // | OUTRO), never a model code; the model itself is linked via the numeric
  // modelo_sessao_id resolved above.
  const conversionBody = {
    data: data1,
    hora_inicio: '08:00',
    hora_fim: '10:00',
    simulador_id: simuladorId,
    instrutor_id: instrutorId,
    participantes: [
      { funcionario_id: participante1Id },
      { funcionario_id: participante2Id },
    ],
    segmentos: [
      {
        modelo_sessao_id: modeloIdByCodigo('EXA-V01'),
        finalidade_codigo: 'ATUACAO_EXAMINADOR',
        inicio: '08:00',
        fim: '09:00',
        participantes: [
          { funcionario_id: participante1Id, funcao: 'PF', cumpre_treinamento: true },
          { funcionario_id: participante2Id, funcao: 'PM' },
        ],
      },
      {
        modelo_sessao_id: modeloIdByCodigo('EXA-V02'),
        finalidade_codigo: 'ATUACAO_EXAMINADOR',
        inicio: '09:00',
        fim: '10:00',
        participantes: [
          { funcionario_id: participante1Id, funcao: 'PF', cumpre_treinamento: true },
          { funcionario_id: participante2Id, funcao: 'PM' },
        ],
      },
    ],
  };

  if (simpleSessionId) {
    const converted = await authFetch(
      baseUrl,
      token,
      `/api/simuladores/sessoes/${simpleSessionId}/converter-compartilhada`,
      { method: 'PUT', body: JSON.stringify(conversionBody) },
    );
    const segmentos = converted.json?.data?.segmentos ?? [];
    report.scenarios.C_conversion = {
      ok: converted.status === 200 && segmentos.length === 2,
      status: converted.status,
      error: converted.status !== 200 ? converted.json : undefined,
      segmentCount: segmentos.length,
      allSixtyMinutes: segmentos.every((s) => s.duracao_minutos === 60),
    };
  } else {
    report.scenarios.C_conversion = { ok: false, skipped: 'no simple session id from B' };
  }

  // D. Bloqueio: tentar reconverter uma sessão já assinada/concluída deve falhar (409/422),
  // sem escrita parcial. A rota trata reconversão de uma sessão já modo_compartilhado=1
  // como update idempotente (200), não como bloqueio — o bloqueio real do backend é
  // "ficha assinada/concluída" (ver assertSimpleSessionConvertible). Este smoke reenvia
  // a mesma conversão para confirmar que ela é idempotente (200, sem duplicar segmentos);
  // o teste de bloqueio por assinatura completo está coberto pela suíte automatizada
  // (simuladores-shared-session-conversion.test.ts), não recriado aqui contra dado real.
  if (simpleSessionId) {
    const reconvert = await authFetch(
      baseUrl,
      token,
      `/api/simuladores/sessoes/${simpleSessionId}/converter-compartilhada`,
      { method: 'PUT', body: JSON.stringify(conversionBody) },
    );
    const segmentos = reconvert.json?.data?.segmentos ?? [];
    report.scenarios.D_idempotent_reconversion = {
      ok: reconvert.status === 200 && segmentos.length === 2,
      status: reconvert.status,
      segmentCount: segmentos.length,
      note: 'bloqueio por ficha assinada coberto por teste automatizado, não por este smoke',
    };
  } else {
    report.scenarios.D_idempotent_reconversion = { ok: false, skipped: 'no simple session id from B' };
  }

  // E. Programa genérico: painel EXA ausente, EXA-V01..04 ocultos.
  // NOT AUTOMATABLE VIA THIS API-LEVEL SMOKE: GET /api/simuladores/modelos-sessao
  // (worker-airtrust/src/routes/simuladores-modelos.ts) has no server-side
  // program/capability filter — EXA-V0x visibility outside the examiner
  // program is enforced entirely in the frontend (commit f3f60eed
  // "fix(simulators): hide examiner models outside examiner program").
  // Asserting hidden-from-the-API here would be asserting a guarantee the
  // backend never makes, producing a false negative on every run. This gate
  // is covered instead by
  // src/react-app/components/modals/__tests__/SharedSessionForm.examiner-template.test.tsx
  // (frontend unit test) — recorded here as semiautomated/not-applicable at
  // the API layer, not silently marked ok:true.
  {
    const modelos = await authFetch(baseUrl, token, '/api/simuladores/modelos-sessao');
    const codes = (modelos.json?.data ?? []).map((m) => m.codigo);
    const examinerCodesVisibleInApi = codes.some((c) => /^EXA-V0[1-4]$/.test(c));
    report.scenarios.E_generic_program_hides_examiner = {
      ok: null,
      semiautomated: true,
      note: 'filtro é frontend-only (não há guarantee no backend); ver SharedSessionForm.examiner-template.test.tsx',
      examinerCodesVisibleInApi,
    };
  }

  // F. Programa examinador: criar sessão compartilhada direta com EXA-V03+V04 (Evento 2 —
  // usa modelos distintos de C/D para não colidir com a sessão convertida acima).
  let event2SessionId = null;
  {
    const randomDayOffset2 = 8 + Math.floor(Math.random() * 10000);
    const data2 = new Date(Date.now() + randomDayOffset2 * 86400000).toISOString().slice(0, 10);
    const created = await authFetch(baseUrl, token, '/api/simuladores/sessoes/compartilhada', {
      method: 'POST',
      body: JSON.stringify({
        data: data2,
        hora_inicio: '08:00',
        hora_fim: '10:00',
        simulador_id: simuladorId,
        instrutor_id: instrutorId,
        participantes: [
          { funcionario_id: participante1Id },
          { funcionario_id: participante2Id },
        ],
        observacoes: 'QA smoke — evento 2 examinador (rollback via seed --rollback)',
        segmentos: [
          {
            modelo_sessao_id: modeloIdByCodigo('EXA-V03'),
            finalidade_codigo: 'ATUACAO_EXAMINADOR',
            inicio: '08:00',
            fim: '09:00',
            participantes: [
              { funcionario_id: participante1Id, funcao: 'PF', cumpre_treinamento: true },
              { funcionario_id: participante2Id, funcao: 'PM' },
            ],
          },
          {
            modelo_sessao_id: modeloIdByCodigo('EXA-V04'),
            finalidade_codigo: 'ATUACAO_EXAMINADOR',
            inicio: '09:00',
            fim: '10:00',
            participantes: [
              { funcionario_id: participante1Id, funcao: 'PF', cumpre_treinamento: true },
              { funcionario_id: participante2Id, funcao: 'PM' },
            ],
          },
        ],
      }),
    });
    event2SessionId = created.json?.data?.sessao?.id ?? created.json?.resumo?.sessao_id ?? null;
    const segmentos = created.json?.data?.segmentos ?? [];
    const fapHits = segmentos.filter((s) => /FAP/i.test(JSON.stringify(s)));
    report.scenarios.F_examiner_program_event2 = {
      ok: created.status === 201 && segmentos.length === 2 && fapHits.length === 0,
      status: created.status,
      error: created.status !== 201 ? created.json : undefined,
      segmentCount: segmentos.length,
      noFap: fapHits.length === 0,
      sessionId: event2SessionId,
    };
  }

  // G. Histórico: reabrir sessão convertida (B/C) e confirmar que os segmentos não duplicam.
  if (simpleSessionId) {
    const reopened = await authFetch(baseUrl, token, `/api/simuladores/sessoes/compartilhada/${simpleSessionId}`);
    const segmentos = reopened.json?.data?.segmentos ?? [];
    report.scenarios.G_history_reopen = {
      ok: reopened.status === 200 && segmentos.length === 2,
      status: reopened.status,
      segmentCount: segmentos.length,
    };
  } else {
    report.scenarios.G_history_reopen = { ok: false, skipped: 'no simple session id from B' };
  }

  // H. Tenant: acesso cross-tenant deve retornar 404 genérico (sem vazar existência).
  //    Usa a fixture smoke pré-existente (scripts/seed-staging-smoke-user.mjs) como tenant
  //    estrangeiro — nunca cria um segundo tenant QA só para este teste.
  if (simpleSessionId && process.env.STAGING_SMOKE_EMAIL && process.env.STAGING_SMOKE_PASSWORD) {
    const foreignLogin = await login(baseUrl, process.env.STAGING_SMOKE_EMAIL, process.env.STAGING_SMOKE_PASSWORD);
    const foreignToken = extractAccessToken(foreignLogin);
    const crossAttempt = await authFetch(
      baseUrl,
      foreignToken,
      `/api/simuladores/sessoes/compartilhada/${simpleSessionId}`,
    );
    report.scenarios.H_cross_tenant = { ok: crossAttempt.status === 404, status: crossAttempt.status };
  } else {
    report.scenarios.H_cross_tenant = {
      ok: null,
      skipped: 'STAGING_SMOKE_EMAIL/PASSWORD ausentes ou sem sessão de origem — ver runbook',
    };
  }

  // I. PDF: sessão DEDICADA (separada da F, que usa data futura de propósito para
  //    não colidir com B/C/D) agendada para o dia civil de HOJE no fuso operacional
  //    (America/Sao_Paulo) — a ficha só fica disponível para PDF no dia da sessão
  //    (worker-airtrust/src/utils/ficha-availability.ts), então usar uma data futura
  //    aqui (como F fazia) sempre resulta em 409 FICHA_NOT_AVAILABLE_YET, nunca 200.
  //    Conteúdo detalhado (33 itens/18+15/ECL/sem QRH/FAP) já coberto por testes
  //    automatizados locais; aqui confirmamos que o endpoint remoto responde com um
  //    PDF de verdade (200, content-type, assinatura %PDF-, corpo não vazio) para a
  //    ficha do tenant sintético — sem mockar a resposta e sem tocar no gate.
  // NOTE: GET /api/simuladores/fichas (simuladores-fichas.ts) accepts only
  // `status`/`tipo_sessao` query params — there is NO `sessao_id` filter.
  // Fichas link back to their session via the `agendamento_slot_id` column
  // (confirmed: `fichas_sessao.agendamento_slot_id` joins
  // `simulador_agendamentos.id`). Filtering must happen client-side on that
  // field, never by guessing an unsupported query param (which would
  // silently return the caller's whole/unscoped ficha list and could pick
  // the WRONG ficha's PDF — a false ok:true).
  {
    const pdfFixtureRunId = `pdf-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const pdfFixtureDate = saoPauloTodayDateKey();
    const { hora_inicio, hora_fim } = pdfFixtureTimeWindow();

    const pdfSessionCreated = await authFetch(baseUrl, token, '/api/simuladores/sessoes/compartilhada', {
      method: 'POST',
      body: JSON.stringify({
        data: pdfFixtureDate,
        hora_inicio,
        hora_fim,
        simulador_id: simuladorId,
        instrutor_id: instrutorId,
        participantes: [
          { funcionario_id: participante1Id },
          { funcionario_id: participante2Id },
        ],
        observacoes: `QA smoke — fixture dedicada I_pdf ${pdfFixtureRunId} (rollback via seed --rollback)`,
        segmentos: [
          {
            modelo_sessao_id: modeloIdByCodigo('EXA-V03'),
            finalidade_codigo: 'ATUACAO_EXAMINADOR',
            inicio: hora_inicio,
            fim: hora_fim,
            participantes: [
              { funcionario_id: participante1Id, funcao: 'PF', cumpre_treinamento: true },
              { funcionario_id: participante2Id, funcao: 'PM' },
            ],
          },
        ],
      }),
    });
    const pdfSessionId = pdfSessionCreated.json?.data?.sessao?.id ?? pdfSessionCreated.json?.resumo?.sessao_id ?? null;
    const pdfSessionOk = pdfSessionCreated.status === 201 && pdfSessionId != null;

    const pdfStatus = pdfSessionOk
      ? await (async () => {
          const fichasList = await authFetch(baseUrl, token, '/api/simuladores/fichas');
          const fichaId =
            (fichasList.json?.data ?? []).find((f) => f.agendamento_slot_id === pdfSessionId)?.id ?? null;
          if (!fichaId) return { status: null, bytes: 0, note: 'nenhuma ficha com agendamento_slot_id correspondente à sessão dedicada' };
          const res = await fetch(`${baseUrl}/api/simuladores/fichas/${fichaId}/pdf`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          const contentType = res.headers.get('content-type') || '';
          const buf = await res.arrayBuffer();
          const bytes = Buffer.from(buf);
          const hasPdfSignature = bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-';
          return { status: res.status, contentType, bytes: buf.byteLength, hasPdfSignature, fichaId };
        })()
      : { status: null, bytes: 0, note: 'sessão dedicada de PDF não foi criada (ver pdfSessionCreated)' };

    report.scenarios.I_pdf = {
      ok: isValidPdfResponse(pdfStatus),
      note: 'sessão dedicada agendada para hoje (fuso America/Sao_Paulo) — 409 (FICHA_NOT_AVAILABLE_YET) nunca é aceito como PASS',
      pdfFixtureDate,
      pdfFixtureHorario: `${hora_inicio}-${hora_fim}`,
      pdfSessionCreateStatus: pdfSessionCreated.status,
      pdfSessionId,
      ...pdfStatus,
    };
  }

  const allOk = Object.values(report.scenarios).every((s) => s.ok === true || s.ok === null);
  console.log(JSON.stringify(report, null, 2));
  if (!allOk) {
    console.error('SMOKE_FAILED: um ou mais cenários retornaram ok=false.');
    process.exitCode = 1;
    return;
  }
  console.log('SMOKE_OK');
}

// Executa apenas quando chamado diretamente (node scripts/staging/smoke-examiner-training.mjs),
// nunca quando importado por um teste unitário dos helpers acima (evita golpear
// staging de verdade só por causa de um import estático em scripts/__tests__/*.test.mjs).
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error(String(err?.message || err));
    process.exitCode = 1;
  });
}
