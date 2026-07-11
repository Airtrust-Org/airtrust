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
  let simpleSessionId = null;
  {
    const created = await authFetch(baseUrl, token, '/api/simuladores/sessoes', {
      method: 'POST',
      body: JSON.stringify({
        data: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        hora_inicio: '08:00',
        hora_fim: '09:00',
        tipo_sessao: 'PER',
        observacoes: 'QA smoke — sessão simples (rollback via seed --rollback)',
      }),
    });
    simpleSessionId = created.json?.data?.id ?? null;
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
    data: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    hora_inicio: '08:00',
    ...commonSessionFields,
    segmentos: [
      {
        modelo_sessao_id: modeloIdByCodigo('EXA-V01'),
        finalidade_codigo: 'ATUACAO_EXAMINADOR',
        duracao_minutos: 60,
        funcoes: [
          { funcionario_id: participante1Id, funcao: 'PF' },
          { funcionario_id: participante2Id, funcao: 'PM' },
        ],
      },
      {
        modelo_sessao_id: modeloIdByCodigo('EXA-V02'),
        finalidade_codigo: 'ATUACAO_EXAMINADOR',
        duracao_minutos: 60,
        funcoes: [
          { funcionario_id: participante1Id, funcao: 'PF' },
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

  // E. Programa genérico: painel EXA ausente, EXA-V01..04 ocultos (checado via listagem de modelos).
  {
    const modelos = await authFetch(baseUrl, token, '/api/simuladores/modelos-sessao');
    const codes = (modelos.json?.data ?? []).map((m) => m.codigo);
    const examinerCodesVisible = codes.some((c) => /^EXA-V0[1-4]$/.test(c));
    report.scenarios.E_generic_program_hides_examiner = {
      ok: !examinerCodesVisible,
      note: 'EXA-V01..04 devem estar ausentes na listagem padrão fora do programa de examinador',
    };
  }

  // F. Programa examinador: criar sessão compartilhada direta com EXA-V03+V04 (Evento 2 —
  // usa modelos distintos de C/D para não colidir com a sessão convertida acima).
  let event2SessionId = null;
  {
    const created = await authFetch(baseUrl, token, '/api/simuladores/sessoes/compartilhada', {
      method: 'POST',
      body: JSON.stringify({
        data: new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10),
        hora_inicio: '08:00',
        ...commonSessionFields,
        observacoes: 'QA smoke — evento 2 examinador (rollback via seed --rollback)',
        segmentos: [
          {
            modelo_sessao_id: modeloIdByCodigo('EXA-V03'),
            finalidade_codigo: 'ATUACAO_EXAMINADOR',
            duracao_minutos: 60,
            funcoes: [
              { funcionario_id: participante1Id, funcao: 'PF' },
              { funcionario_id: participante2Id, funcao: 'PM' },
            ],
          },
          {
            modelo_sessao_id: modeloIdByCodigo('EXA-V04'),
            finalidade_codigo: 'ATUACAO_EXAMINADOR',
            duracao_minutos: 60,
            funcoes: [
              { funcionario_id: participante1Id, funcao: 'PF' },
              { funcionario_id: participante2Id, funcao: 'PM' },
            ],
          },
        ],
      }),
    });
    event2SessionId = created.json?.data?.id ?? created.json?.data?.sessaoId ?? null;
    const segmentos = created.json?.data?.segmentos ?? [];
    const fapHits = segmentos.filter((s) => /FAP/i.test(JSON.stringify(s)));
    report.scenarios.F_examiner_program_event2 = {
      ok: created.status === 201 && segmentos.length === 2 && fapHits.length === 0,
      status: created.status,
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

  // I. PDF: existência e tamanho não-vazio (conteúdo detalhado — 33 itens/18+15/ECL/sem
  //    QRH/FAP — já coberto por testes automatizados locais; aqui confirmamos apenas
  //    que o endpoint remoto responde com um PDF não vazio para a sessão criada em F).
  {
    const pdfStatus = report.scenarios.F_examiner_program_event2?.ok && event2SessionId
      ? await (async () => {
          const fichasList = await authFetch(
            baseUrl,
            token,
            `/api/simuladores/fichas?sessao_id=${event2SessionId}`,
          );
          const fichaId = (fichasList.json?.data ?? [])[0]?.id ?? null;
          if (!fichaId) return { status: null, bytes: 0, note: 'nenhuma ficha encontrada para a sessão' };
          const res = await fetch(`${baseUrl}/api/simuladores/fichas/${fichaId}/pdf`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          const buf = await res.arrayBuffer();
          return { status: res.status, bytes: buf.byteLength, fichaId };
        })()
      : { status: null, bytes: 0 };
    report.scenarios.I_pdf = {
      ok: pdfStatus.status === 200 && pdfStatus.bytes > 0,
      note: 'conteúdo detalhado (33 itens, 18 técnicos + 15 NOTECHS, ECL, sem QRH/FAP) já coberto por testes automatizados locais; aqui só existência/tamanho remoto',
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

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exitCode = 1;
});
