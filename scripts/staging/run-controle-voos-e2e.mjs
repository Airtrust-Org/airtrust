#!/usr/bin/env node

// source_reference: E2E autenticado real contra o staging publico do Controle
// de Voos, usando fixtures sinteticas de provision-controle-voos-e2e-fixtures.mjs.
// operational_decision: relatorio de saida e sanitizado por construcao — o
// helper `call()` nunca grava body de request/response completo, so os campos
// listados no prompt (operation, method, route, status esperado/observado,
// operation_id, tenant, resultado, duracao). Token/senha nunca entram no
// relatorio.
// dry_run_required: nao aplicavel — este script so faz chamadas HTTP contra
// staging (nao escreve em D1 diretamente); todo efeito e via API real.
// rollback_plan_required: cleanup-controle-voos-e2e-fixtures.mjs remove os
// dados criados por este script (o voo/RDV criados ficam sob a empresa
// sintetica, removidos junto no cleanup).

import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL =
  process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev';

function log(msg) {
  process.stderr.write(`[e2e-cv] ${msg}\n`);
}

const report = [];

async function call({
  operation,
  method,
  path,
  actor,
  tenant,
  body,
  expectedStatus,
  isMultipart,
  expectJson = true,
}) {
  const url = `${BASE_URL}${path}`;
  const headers = {};
  if (actor?.token) headers.Authorization = `Bearer ${actor.token}`;
  let fetchBody;
  if (isMultipart) {
    fetchBody = body; // FormData
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const start = Date.now();
  let status = null;
  let json = null;
  let error = null;
  try {
    const res = await fetch(url, { method, headers, body: fetchBody });
    status = res.status;
    if (expectJson) {
      try {
        json = await res.json();
      } catch {
        json = null;
      }
    } else {
      // drain body without keeping it (binary responses — PDF/anexo)
      await res.arrayBuffer();
    }
  } catch (err) {
    error = String(err?.message || err);
  }
  const durationMs = Date.now() - start;

  const expectedList = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const passed = !error && expectedList.includes(status);

  const record = {
    operation,
    method,
    route: path,
    expected_status: expectedStatus,
    observed_status: status,
    operation_id: json?.data?.id ?? json?.data?.[0]?.id ?? null,
    tenant,
    result: passed ? 'PASS' : 'FAIL',
    duration_ms: durationMs,
  };
  if (error) record.error = error;
  report.push(record);

  log(
    `${passed ? 'OK  ' : 'FAIL'} ${operation} (${method} ${path}) -> ${status} in ${durationMs}ms`,
  );

  return { status, json, passed };
}

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

// Gera um CPF sintetico com digitos verificadores REAIS (algoritmo oficial,
// mesmo usado por worker-airtrust/src/utils/cpf.ts isValidCPF) — POST
// /api/funcionarios rejeita CPF com checksum invalido, e um CPF sequencial
// (111.111.111-11 etc.) tambem e rejeitado. `seed` so precisa ser unico por
// chamada para nao colidir com o UNIQUE de outro funcionario sintetico.
function syntheticCpf(seed) {
  const base = String(seed).padStart(9, '3').slice(-9).split('').map(Number);
  const digit = (nums, factorStart) => {
    let sum = 0;
    for (let i = 0; i < nums.length; i++) sum += nums[i] * (factorStart - i);
    const d = 11 - (sum % 11);
    return d >= 10 ? 0 : d;
  };
  const d1 = digit(base, 10);
  const d2 = digit([...base, d1], 11);
  return [...base, d1, d2].join('');
}

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: password }),
  });
  const json = await res.json();
  if (!res.ok || !json?.data?.accessToken) {
    throw new Error(`Login falhou para ${email}: status=${res.status}`);
  }
  return json.data.accessToken;
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error('Uso: run-controle-voos-e2e.mjs <manifest.json>');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  log(`runId=${manifest.runId} baseUrl=${BASE_URL}`);

  // ── 1. Login real de cada ator ──────────────────────────────────────────
  const actors = {};
  for (const [key, u] of Object.entries(manifest.users)) {
    const t0 = Date.now();
    let token = null;
    let passed = true;
    try {
      token = await login(u.email, u.password);
    } catch (err) {
      passed = false;
      log(`ERRO login ${key}: ${err.message}`);
    }
    report.push({
      operation: `login:${key}`,
      method: 'POST',
      route: '/api/auth/login',
      expected_status: 200,
      observed_status: passed ? 200 : null,
      operation_id: null,
      tenant: u.tenant,
      result: passed ? 'PASS' : 'FAIL',
      duration_ms: Date.now() - t0,
    });
    actors[key] = { ...u, token };
  }

  const adminA = actors.adminA;
  const coordA = actors.coordA;
  const aprovA = actors.aprovA;
  const viewerA = actors.viewerA;
  const adminB = actors.adminB;

  if (!adminA.token) {
    log('adminA sem token — abortando E2E funcional (login falhou).');
    return finish(manifest, false);
  }

  const catA = manifest.catalogA;
  const catB = manifest.catalogB;

  // ── 1.5 Criar modelo + aeronave via cadastro CANONICO (Configuracoes) ──
  // Controle de Voos nao duplica esse cadastro — so referencia aeronave_id.
  // Nao ha FK estrutural entre aeronaves.modelo (texto livre) e
  // modelos_aeronave hoje (gap pre-existente, registrado separadamente);
  // usamos o mesmo nome nos dois para consistencia visual, sem depender de
  // nenhum relacionamento que nao existe de fato.
  const modeloNome = `E2E Synthetic Model ${manifest.runId}`;
  await call({
    operation: 'criar_modelo_aeronave_canonico',
    method: 'POST',
    path: '/api/modelos-aeronave',
    actor: adminA,
    tenant: 'A',
    expectedStatus: 201,
    body: { modelo: modeloNome, fabricante: 'E2E Synthetic Fabricante' },
  });

  const { json: aeronaveJson, passed: aeronavePassed } = await call({
    operation: 'criar_aeronave_canonica',
    method: 'POST',
    path: '/api/aeronaves',
    actor: adminA,
    tenant: 'A',
    expectedStatus: 201,
    body: { modelo: modeloNome, prefixo: `PTE2E${manifest.runId}`.slice(0, 10), status: 'ATIVO' },
  });
  if (!aeronavePassed) return finish(manifest, false);
  const aeronaveId = aeronaveJson?.data?.id;

  // ── 2. Criar voo ─────────────────────────────────────────────────────
  const dataProg = nowIsoDate();
  const { json: vooJson, passed: vooPassed } = await call({
    operation: 'criar_voo',
    method: 'POST',
    path: '/api/controle-voos/voos',
    actor: adminA,
    tenant: 'A',
    expectedStatus: 201,
    body: {
      prefixo: `E2E-${manifest.runId}`,
      data_programacao: dataProg,
      origem_id: catA.origemId,
      destino_id: catA.destinoId,
      tipo_voo_id: catA.tipoVooId,
      natureza_voo_id: catA.naturezaVooId,
      aeronave_id: aeronaveId,
      horario_previsto_partida: `${dataProg}T10:00:00Z`,
      horario_previsto_chegada: `${dataProg}T11:00:00Z`,
      observacoes: 'Voo sintetico E2E',
    },
  });
  if (!vooPassed) return finish(manifest, false);
  const vooId = vooJson.data.id;
  let vooVersao = vooJson.data.versao;

  // ── 3. Editar voo com versao correta ────────────────────────────────
  const editOk = await call({
    operation: 'editar_voo_versao_correta',
    method: 'PATCH',
    path: `/api/controle-voos/voos/${vooId}`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
    body: { observacoes: 'Editado E2E', versao: vooVersao },
  });
  vooVersao = editOk.json?.data?.versao ?? vooVersao + 1;

  // ── 4. Editar com versao antiga -> 409 ──────────────────────────────
  await call({
    operation: 'editar_voo_versao_antiga_409',
    method: 'PATCH',
    path: `/api/controle-voos/voos/${vooId}`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 409,
    body: { observacoes: 'Tentativa com versao velha', versao: vooVersao - 1 },
  });

  // ── 5. Duas edicoes concorrentes, mesma versao ──────────────────────
  const concurrentBody = { versao: vooVersao };
  const [concA, concB] = await Promise.all([
    call({
      operation: 'edicao_concorrente_voo_A',
      method: 'PATCH',
      path: `/api/controle-voos/voos/${vooId}`,
      actor: adminA,
      tenant: 'A',
      expectedStatus: [200, 409],
      body: { observacoes: 'Concorrente A', ...concurrentBody },
    }),
    call({
      operation: 'edicao_concorrente_voo_B',
      method: 'PATCH',
      path: `/api/controle-voos/voos/${vooId}`,
      actor: adminA,
      tenant: 'A',
      expectedStatus: [200, 409],
      body: { observacoes: 'Concorrente B', ...concurrentBody },
    }),
  ]);
  const concurrentStatuses = [concA.status, concB.status].sort();
  report.push({
    operation: 'edicao_concorrente_voo_matriz',
    method: 'PATCH',
    route: `/api/controle-voos/voos/${vooId}`,
    expected_status: '[200,409]',
    observed_status: JSON.stringify(concurrentStatuses),
    operation_id: vooId,
    tenant: 'A',
    result: concurrentStatuses[0] === 200 && concurrentStatuses[1] === 409 ? 'PASS' : 'FAIL',
    duration_ms: 0,
  });
  vooVersao = concA.status === 200 ? concA.json.data.versao : concB.json.data.versao;

  // ── 6. Criar RDV ─────────────────────────────────────────────────────
  const { json: rdvJson } = await call({
    operation: 'criar_rdv',
    method: 'PUT',
    path: `/api/controle-voos/voos/${vooId}/rdv`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: [200, 201],
    body: {
      numero: `RDV-E2E-${manifest.runId}`,
      data_voo: dataProg,
      horario_decolagem_real: `${dataProg}T10:05:00Z`,
      horario_pouso_real: `${dataProg}T10:55:00Z`,
      combustivel_decolagem: 500,
      combustivel_pouso: 400,
      combustivel_consumo: 100,
      pob: 2,
    },
  });
  let rdvVersao = rdvJson?.data?.versao ?? 1;

  // ── 7. Criar etapa ───────────────────────────────────────────────────
  await call({
    operation: 'criar_etapa',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/etapas`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 201,
    body: {
      versao: rdvVersao,
      numero_etapa: 1,
      origem_icao: 'OR' + 'A' + manifest.runId,
      destino_icao: 'DE' + 'A' + manifest.runId,
      horario_decolagem: `${dataProg}T10:05:00Z`,
      horario_pouso: `${dataProg}T10:55:00Z`,
      combustivel_inicio: 500,
      combustivel_fim: 400,
    },
  });
  rdvVersao += 1;

  // ── 7.5 Criar setor + funcionario via cadastro CANONICO (Funcionarios) ──
  // funcionarios.setor_id e exigido por trigger real (achado em staging:
  // trg_funcionarios_setor_required_insert), nao por NOT NULL simples.
  // CPF precisa de digito verificador valido (isValidCPF real, nao mock).
  await call({
    operation: 'criar_setor_canonico',
    method: 'POST',
    path: '/api/setores',
    actor: adminA,
    tenant: 'A',
    expectedStatus: 201,
    body: {
      codigo: `E2E${manifest.runId}`.slice(0, 20),
      nome: `E2E Synthetic Setor ${manifest.runId}`,
    },
  });

  const { json: funcJson, passed: funcPassed } = await call({
    operation: 'criar_funcionario_canonico',
    method: 'POST',
    path: '/api/funcionarios',
    actor: adminA,
    tenant: 'A',
    expectedStatus: 201,
    body: {
      nome: `CV E2E Synthetic Crew ${manifest.runId}`,
      cpf: syntheticCpf('111222333'),
      email: `cv.e2e.crew.${manifest.runId}@synthetic.invalid`,
      setor: `E2E Synthetic Setor ${manifest.runId}`,
      codigo_anac: `E2E-${manifest.runId}`,
    },
  });
  if (!funcPassed) return finish(manifest, false);
  const funcionarioId = funcJson?.data?.id;

  // ── 8. Adicionar tripulante ──────────────────────────────────────────
  const { json: tripJson } = await call({
    operation: 'adicionar_tripulante',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/tripulantes`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 201,
    body: { funcionario_id: funcionarioId, funcao: 'PIC' },
  });
  const tripulanteId = tripJson?.data?.id;

  // ── 9. Editar tripulante com CAS ─────────────────────────────────────
  await call({
    operation: 'editar_tripulante_cas',
    method: 'PUT',
    path: `/api/controle-voos/voos/${vooId}/tripulantes/${tripulanteId}`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
    body: { versao: rdvVersao, observacoes: 'Editado via E2E' },
  });
  rdvVersao += 1;

  // ── 10. Adicionar abastecimento ──────────────────────────────────────
  await call({
    operation: 'adicionar_abastecimento',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/abastecimentos`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 201,
    body: {
      versao: rdvVersao,
      data_hora: `${dataProg}T09:50:00Z`,
      fornecedor: 'Fornecedor E2E',
      combustivel_abastecido: 500,
      unidade: 'L',
    },
  });
  rdvVersao += 1;

  // ── 11. Upload de anexo R2 ───────────────────────────────────────────
  const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic bytes, arquivo sintetico minimo
  const form = new FormData();
  form.set('anexo', new File([pngBytes], 'recibo-e2e.png', { type: 'image/png' }));
  const { json: anexoJson } = await call({
    operation: 'upload_anexo_r2',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/abastecimentos/anexo`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 201,
    isMultipart: true,
    body: form,
  });
  const anexoKey = anexoJson?.data?.anexo_r2_key;

  // ── 12. Vincular anexo (novo abastecimento referenciando a chave) ──
  const { json: abastComAnexo } = await call({
    operation: 'vincular_anexo_abastecimento',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/abastecimentos`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 201,
    body: {
      versao: rdvVersao,
      data_hora: `${dataProg}T09:55:00Z`,
      fornecedor: 'Fornecedor E2E com anexo',
      combustivel_abastecido: 100,
      unidade: 'L',
      anexo_r2_key: anexoKey,
    },
  });
  rdvVersao += 1;
  const abastecimentoComAnexoId = abastComAnexo?.data?.id;

  // ── 13. Baixar anexo autenticado ─────────────────────────────────────
  await call({
    operation: 'baixar_anexo_autenticado',
    method: 'GET',
    path: `/api/controle-voos/voos/${vooId}/abastecimentos/${abastecimentoComAnexoId}/anexo`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
    expectJson: false,
  });

  // ── Preparo: finalizar preenchimento antes de enviar ─────────────────
  await call({
    operation: 'finalizar_preenchimento_rdv',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/rdv/finalizar-preenchimento`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
  });

  // ── 14. Enviar RDV ────────────────────────────────────────────────────
  await call({
    operation: 'enviar_rdv',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/rdv/enviar`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
    body: { versao: rdvVersao },
  });
  rdvVersao += 1;

  // ── 15. Iniciar revisao (coordenacao) ────────────────────────────────
  await call({
    operation: 'iniciar_revisao',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/rdv/iniciar-revisao`,
    actor: coordA,
    tenant: 'A',
    expectedStatus: 200,
    body: { versao: rdvVersao },
  });
  rdvVersao += 1;

  // ── 16. Devolver ──────────────────────────────────────────────────────
  await call({
    operation: 'devolver_rdv',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/rdv/devolver`,
    actor: coordA,
    tenant: 'A',
    expectedStatus: 200,
    body: { versao: rdvVersao, justificativa: 'Ajustar combustivel (E2E sintetico)' },
  });
  rdvVersao += 1;

  // ── 17. Corrigir (piloto reedita apos devolucao, status volta a rascunho) ──
  await call({
    operation: 'corrigir_apos_devolucao',
    method: 'PUT',
    path: `/api/controle-voos/voos/${vooId}/rdv`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
    body: {
      versao: rdvVersao,
      ocorrencias: 'Corrigido apos devolucao (E2E)',
    },
  });

  await call({
    operation: 'refinalizar_preenchimento_rdv',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/rdv/finalizar-preenchimento`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
  });

  // ── 18. Reenviar ──────────────────────────────────────────────────────
  await call({
    operation: 'reenviar_rdv',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/rdv/enviar`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
    body: { versao: rdvVersao },
  });
  rdvVersao += 1;

  await call({
    operation: 'iniciar_revisao_2',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/rdv/iniciar-revisao`,
    actor: coordA,
    tenant: 'A',
    expectedStatus: 200,
    body: { versao: rdvVersao },
  });
  rdvVersao += 1;

  // ── 19. Aprovar (separacao de funcoes: aprovador != quem preencheu) ──
  await call({
    operation: 'aprovar_rdv',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/rdv/aprovar`,
    actor: aprovA,
    tenant: 'A',
    expectedStatus: 200,
    body: { versao: rdvVersao },
  });
  rdvVersao += 1;

  // ── 20. Finalizar ─────────────────────────────────────────────────────
  await call({
    operation: 'finalizar_rdv',
    method: 'POST',
    path: `/api/controle-voos/voos/${vooId}/rdv/finalizar`,
    actor: aprovA,
    tenant: 'A',
    expectedStatus: 200,
    body: { versao: rdvVersao },
  });
  rdvVersao += 1;

  // ── 21. Gerar PDF ─────────────────────────────────────────────────────
  await call({
    operation: 'gerar_pdf_relatorio',
    method: 'GET',
    path: `/api/controle-voos/voos/${vooId}/rdv/relatorio-petrobras`,
    actor: coordA,
    tenant: 'A',
    expectedStatus: 200,
    expectJson: false,
  });

  // ── 22. Export (jornadas operacionais) ───────────────────────────────
  await call({
    operation: 'export_jornadas',
    method: 'GET',
    path: `/api/controle-voos/jornadas?data_inicio=${dataProg}&data_fim=${dataProg}`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
  });

  // ── 23. Consultar historico (detalhe do voo + RDV com timestamps) ────
  await call({
    operation: 'consultar_historico_voo',
    method: 'GET',
    path: `/api/controle-voos/voos/${vooId}`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
  });
  await call({
    operation: 'consultar_historico_rdv',
    method: 'GET',
    path: `/api/controle-voos/voos/${vooId}/rdv`,
    actor: adminA,
    tenant: 'A',
    expectedStatus: 200,
  });

  // ── 24. Preview contrato FRMS (dry-run) ──────────────────────────────
  await call({
    operation: 'frms_contract_preview_dry_run',
    method: 'GET',
    path: `/api/controle-voos/frms/contract-preview?from=${dataProg}&to=${dataProg}`,
    actor: coordA,
    tenant: 'A',
    expectedStatus: 200,
  });

  // ── Validacoes negativas ──────────────────────────────────────────────

  // viewer recebe 403 em mutacao
  await call({
    operation: 'viewer_403_em_mutacao',
    method: 'PATCH',
    path: `/api/controle-voos/voos/${vooId}`,
    actor: viewerA,
    tenant: 'A',
    expectedStatus: 403,
    body: { observacoes: 'viewer nao pode', versao: vooVersao },
  });

  // tenant B nao acessa voo do tenant A
  await call({
    operation: 'tenant_b_nao_acessa_voo_tenant_a',
    method: 'GET',
    path: `/api/controle-voos/voos/${vooId}`,
    actor: adminB,
    tenant: 'B',
    expectedStatus: 404,
  });
  await call({
    operation: 'tenant_b_nao_acessa_rdv_tenant_a',
    method: 'GET',
    path: `/api/controle-voos/voos/${vooId}/rdv`,
    actor: adminB,
    tenant: 'B',
    expectedStatus: 404,
  });
  await call({
    operation: 'tenant_b_nao_acessa_tripulantes_tenant_a',
    method: 'GET',
    path: `/api/controle-voos/voos/${vooId}/tripulantes`,
    actor: adminB,
    tenant: 'B',
    expectedStatus: 404,
  });
  await call({
    operation: 'tenant_b_nao_acessa_abastecimentos_tenant_a',
    method: 'GET',
    path: `/api/controle-voos/voos/${vooId}/abastecimentos`,
    actor: adminB,
    tenant: 'B',
    expectedStatus: 404,
  });
  await call({
    operation: 'tenant_b_nao_baixa_anexo_tenant_a',
    method: 'GET',
    path: `/api/controle-voos/voos/${vooId}/abastecimentos/${abastecimentoComAnexoId}/anexo`,
    actor: adminB,
    tenant: 'B',
    expectedStatus: 404,
    expectJson: false,
  });

  // empresa_id do payload e ignorado/rejeitado
  await call({
    operation: 'payload_empresa_id_rejeitado',
    method: 'POST',
    path: '/api/controle-voos/voos',
    actor: adminA,
    tenant: 'A',
    expectedStatus: 400,
    body: {
      prefixo: `E2E-SPOOF-${manifest.runId}`,
      data_programacao: dataProg,
      origem_id: catA.origemId,
      destino_id: catA.destinoId,
      tipo_voo_id: catA.tipoVooId,
      natureza_voo_id: catA.naturezaVooId,
      horario_previsto_partida: `${dataProg}T10:00:00Z`,
      horario_previsto_chegada: `${dataProg}T11:00:00Z`,
      empresa_id: manifest.empresaB.id,
    },
  });

  // impersonacao bloqueada em operacao critica de outro tenant
  const { json: impersonateJson } = await call({
    operation: 'impersonate_tentativa_cross_tenant',
    method: 'POST',
    path: '/api/auth/impersonate',
    actor: adminA,
    tenant: 'A',
    expectedStatus: [403, 404],
    body: { userId: adminB.id },
  });
  void impersonateJson;

  return finish(manifest, true);
}

function finish(manifest, ranFully) {
  const passCount = report.filter((r) => r.result === 'PASS').length;
  const failCount = report.filter((r) => r.result === 'FAIL').length;

  const summary = {
    runId: manifest.runId,
    baseUrl: BASE_URL,
    ranFully,
    totalOperations: report.length,
    passed: passCount,
    failed: failCount,
    generatedAt: new Date().toISOString(),
    operations: report,
  };

  const reportDir = mkdtempSync(join(tmpdir(), 'cv-e2e-report-'));
  const reportPath = join(reportDir, 'e2e-report.json');
  writeFileSync(reportPath, JSON.stringify(summary, null, 2), { mode: 0o600 });
  chmodSync(reportPath, 0o600);

  log(`Relatorio: ${reportPath}`);
  log(`Total=${report.length} PASS=${passCount} FAIL=${failCount}`);
  process.stdout.write(`${reportPath}\n`);

  if (failCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  log(`ERRO FATAL: ${err.message}`);
  finish({ runId: 'unknown' }, false);
  process.exitCode = 1;
});
