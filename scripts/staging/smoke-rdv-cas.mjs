#!/usr/bin/env node

import {
  assert,
  extractAccessToken,
  fetchJson,
  login,
  maskEmail,
} from '../smoke-auth-common.mjs';

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const EXPECTED_API_URL = process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL;

async function authFetch(baseUrl, token, path, options = {}) {
  const res = await fetchJson(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return { status: res.status, json: res.json };
}

function validatePayloadField(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Validação falhou: Campo ${fieldName} não pode ser nulo ou vazio.`);
  }
}

function validateVooPayload(payload) {
  validatePayloadField(payload.prefixo, 'prefixo');
  validatePayloadField(payload.data_programacao, 'data_programacao');
  validatePayloadField(payload.aeronave_id, 'aeronave_id');
  validatePayloadField(payload.origem_id, 'origem_id');
  validatePayloadField(payload.destino_id, 'destino_id');
  validatePayloadField(payload.tipo_voo_id, 'tipo_voo_id');
  validatePayloadField(payload.natureza_voo_id, 'natureza_voo_id');
  validatePayloadField(payload.horario_previsto_partida, 'horario_previsto_partida');
  validatePayloadField(payload.horario_previsto_chegada, 'horario_previsto_chegada');
  validatePayloadField(payload.status, 'status');
}

// Identificador curto e unico por execucao, usado em todo campo sujeito a
// UNIQUE(empresa_id, numero) em cv_rdv_operacional. Sem isso, reexecucoes do
// smoke reusavam os mesmos literais ("v1".."v4", "concorrencia") e colidiam
// com RDVs residuais de execucoes anteriores (o cleanup cancela o voo, mas
// nunca libera o `numero` do RDV) — ver staging run 30213419151.
function buildRunKey() {
  const runId = process.env.GITHUB_RUN_ID;
  if (runId) {
    const attempt = process.env.GITHUB_RUN_ATTEMPT || '1';
    return `rdv-${runId}-${attempt}`;
  }
  return `rdv-local-${Date.now()}`;
}

// Marcador de prefixo usado por TODO voo sintetico criado por este smoke
// (ver `vooPayload.prefixo` abaixo) — unica base aceita para reconhecer um
// residuo como inequivocamente proprio deste teste na FASE 4 de cleanup.
const SMOKE_PREFIX_MARKER = 'QA-E2E-';

// Voos sinteticos deixados por execucoes anteriores deste mesmo smoke,
// bloqueados por bugs ja corrigidos (500 de UNIQUE, numero nao-unico,
// cleanup sem versao/motivo) — ver staging runs 30212619886, 30213419151,
// 30215582951, 30216095703. Lista fechada e historica: nao e um mecanismo
// generico de limpeza em massa, so uma tentativa pontual de cancelar o que
// ficou para tras nessa investigacao, sempre revalidando por API antes de
// tocar em qualquer um.
const KNOWN_RESIDUAL_VOO_IDS = [22, 23, 24, 25, 26];

// Estados de cv_voos a partir dos quais `statusTransitions` (controle-voos.ts)
// permite transicionar para 'cancelado'. Fora daqui o PATCH responde 409
// CONTROLE_VOOS_INVALID_TRANSITION — motivo para pular, nao tocar.
const CANCELLABLE_STATUSES = new Set(['planejado', 'liberado_operacionalmente']);

// Busca deterministicamente (via catalogo oficial, nunca ID fixo) um motivo
// operacional ativo do tipo 'cancelamento' para esta empresa. O catalogo ja
// ordena por tipo ASC, ordem ASC, nome ASC — o primeiro resultado e sempre o
// mesmo motivo, de forma reproduzivel. Sem motivo valido, aborta sem criar
// nenhum dado (nenhum voo sintetico chega a ser criado).
async function fetchCancellationMotivoId(baseUrl, token) {
  const res = await authFetch(baseUrl, token, '/api/controle-voos/catalogos/motivos?tipo=cancelamento');
  const motivos = res.json?.data || [];
  const motivo = motivos[0];
  if (!motivo || !motivo.id) {
    throw new Error(
      `Nenhum motivo operacional ativo do tipo 'cancelamento' encontrado no catalogo (${res.status} - ${JSON.stringify(res.json)}). Abortando sem criar dados.`,
    );
  }
  return motivo.id;
}

// Helper reutilizavel: cancela um voo sintetico pelo endpoint oficial,
// enviando todos os campos exigidos pelo contrato de PATCH /voos/:id
// (versao para o CAS de cv_voos, cancelado_motivo_id para a transicao de
// cancelamento). Nunca usa SQL. Nunca deve ser lido como hard-delete: a
// linha permanece na tabela com status 'cancelado', unico cleanup que a
// API expõe.
async function cancelSyntheticFlight(baseUrl, token, { vooId, versao, canceladoMotivoId }) {
  const res = await authFetch(baseUrl, token, `/api/controle-voos/voos/${vooId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelado', versao, cancelado_motivo_id: canceladoMotivoId }),
  });
  const ok = res.status >= 200 && res.status < 300 && res.json?.data?.status === 'cancelado';
  return { ok, status: res.status, json: res.json };
}

// FASE 4: tenta cancelar um residuo conhecido SOMENTE se todos os criterios
// abaixo forem verdadeiros, lidos via API oficial imediatamente antes de
// agir (nunca reaproveita estado antigo): pertence a este tenant (GET
// escopado por empresa_id — 404 se for de outra empresa), prefixo
// inequivocamente deste smoke, status ainda permite a transicao para
// cancelado, e versao atual obtida na hora. Qualquer duvida => pula e
// documenta, nunca toca.
async function cleanupResidualFlight(baseUrl, token, canceladoMotivoId, vooId) {
  const getRes = await authFetch(baseUrl, token, `/api/controle-voos/voos/${vooId}`);
  if (getRes.status !== 200 || !getRes.json?.data) {
    console.log(`[E2E] Residuo ${vooId}: ignorado (nao encontrado neste tenant; status ${getRes.status}).`);
    return;
  }

  const flight = getRes.json.data;
  if (!String(flight.prefixo || '').includes(SMOKE_PREFIX_MARKER)) {
    console.log(`[E2E] Residuo ${vooId}: ignorado (prefixo '${flight.prefixo}' nao identifica voo sintetico deste smoke).`);
    return;
  }
  if (!CANCELLABLE_STATUSES.has(flight.status)) {
    console.log(`[E2E] Residuo ${vooId}: ignorado (status '${flight.status}' nao permite cancelamento).`);
    return;
  }
  if (typeof flight.versao !== 'number') {
    console.log(`[E2E] Residuo ${vooId}: ignorado (versao atual nao pode ser determinada).`);
    return;
  }

  const result = await cancelSyntheticFlight(baseUrl, token, {
    vooId,
    versao: flight.versao,
    canceladoMotivoId,
  });
  if (result.ok) {
    console.log(`[E2E] Residuo ${vooId}: cancelado com sucesso (cleanup via API; nao e hard-delete).`);
  } else {
    console.error(`[E2E] Residuo ${vooId}: CLEANUP_FALHOU (${result.status} - ${JSON.stringify(result.json)})`);
  }
}

async function run() {
  console.log(`\n[E2E] Iniciando E2E Sintético do RDV CAS no ambiente: ${EXPECTED_API_URL}`);

  const email = process.env.QA_EXAMINER_ADMIN_EMAIL;
  const password = process.env.QA_EXAMINER_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('As credenciais QA_EXAMINER_ADMIN_* nao estao configuradas no ambiente.');
  }

  console.log(`[E2E] Login como Administrador QA: ${maskEmail(email)}`);
  const adminRes = await login(EXPECTED_API_URL, email, password);
  const token = extractAccessToken(adminRes, email);
  assert(token, 'Falha ao obter token do Administrador QA');

  const runKey = buildRunKey();
  console.log(`[E2E] Prefixo unico desta execucao: ${runKey}`);

  // FASE 2: resolvido ANTES de qualquer criacao de dado — se o catalogo nao
  // tiver motivo de cancelamento ativo, a execucao para aqui sem criar o
  // voo sintetico.
  const canceladoMotivoId = await fetchCancellationMotivoId(EXPECTED_API_URL, token);
  console.log(`[E2E] Motivo operacional de cancelamento resolvido via catalogo: ID ${canceladoMotivoId}`);

  // vooId so e conhecido apos a etapa 1; declarado aqui para o cleanup no
  // finally poder usa-lo mesmo se uma etapa posterior falhar.
  let vooId;

  try {
    // 1. Criar um voo sintético
    console.log('\n[E2E] 1. Criar voo sintético...');

    const aeronavesPayload = await authFetch(EXPECTED_API_URL, token, '/api/aeronaves');
    const aeronaves = aeronavesPayload.json?.data || [];
    const aeronave = aeronaves.find(a => (a.prefixo || '').includes('QA')) || aeronaves[0];
    assert(aeronave, 'Nenhuma aeronave encontrada para criar o voo.');

    const aeroportosPayload = await authFetch(EXPECTED_API_URL, token, '/api/controle-voos/catalogos/aeroportos');
    const aeroportos = aeroportosPayload.json?.data || [];
    const aeroporto = aeroportos.find(a => (a.nome || '').toLowerCase().includes('smoke') || (a.nome || '').toLowerCase().includes('qa') || (a.nome || '').toLowerCase().includes('teste')) || aeroportos[0];
    assert(aeroporto && aeroporto.id, 'Nenhum aeroporto encontrado para criar o voo.');

    const tiposPayload = await authFetch(EXPECTED_API_URL, token, '/api/controle-voos/catalogos/tipos');
    const tipos = tiposPayload.json?.data || [];
    const tipo = tipos.find(t => (t.nome || '').toLowerCase().includes('smoke') || (t.nome || '').toLowerCase().includes('qa') || (t.nome || '').toLowerCase().includes('teste')) || tipos[0];
    assert(tipo && tipo.id, 'Nenhum tipo de voo válido encontrado no catálogo.');

    const naturezasPayload = await authFetch(EXPECTED_API_URL, token, '/api/controle-voos/catalogos/naturezas');
    const naturezas = naturezasPayload.json?.data || [];
    const natureza = naturezas.find(n => (n.nome || '').toLowerCase().includes('smoke') || (n.nome || '').toLowerCase().includes('qa') || (n.nome || '').toLowerCase().includes('teste')) || naturezas[0];
    assert(natureza && natureza.id, 'Nenhuma natureza de voo válida encontrada no catálogo.');

    const vooPayload = {
      prefixo: `QA-E2E-${runKey}`,
      data_programacao: new Date().toISOString().split('T')[0],
      aeronave_id: aeronave.id,
      origem_id: aeroporto.id,
      destino_id: aeroporto.id,
      tipo_voo_id: tipo.id,
      natureza_voo_id: natureza.id,
      horario_previsto_partida: new Date().toISOString(),
      horario_previsto_chegada: new Date(Date.now() + 3600000).toISOString(),
      status: 'planejado'
    };

    validateVooPayload(vooPayload);

    const criarVooRes = await authFetch(EXPECTED_API_URL, token, '/api/controle-voos/voos', {
      method: 'POST',
      body: JSON.stringify(vooPayload)
    });

    vooId = criarVooRes.json?.data?.id;
    assert(vooId, `Falha ao criar voo sintético: ${JSON.stringify(criarVooRes.json)}`);
    console.log(`[E2E] Voo sintético criado: ID ${vooId}`);

    // 2. Criar rascunho inicial com versão 1
    console.log('\n[E2E] 2. Criar rascunho inicial do RDV...');
    const rdvPayloadV1 = {
      versao: 0,
      numero: `${runKey}-v1`,
      data_voo: new Date().toISOString().split('T')[0]
    };

    const putRdvRes1 = await authFetch(EXPECTED_API_URL, token, `/api/controle-voos/voos/${vooId}/rdv`, {
      method: 'PUT',
      body: JSON.stringify(rdvPayloadV1)
    });
    assert(putRdvRes1.json?.data?.versao === 1, `Versão esperada 1, recebida ${putRdvRes1.json?.data?.versao} (${putRdvRes1.status} - ${JSON.stringify(putRdvRes1.json)})`);
    console.log(`[E2E] Rascunho inicial salvo. Versão atual: ${putRdvRes1.json.data.versao}`);

    // 3. Atualizar 1->2
    console.log('\n[E2E] 3. Atualizar rascunho 1 -> 2...');
    const rdvPayloadV2 = {
      versao: 1,
      numero: `${runKey}-v2`
    };
    const putRdvRes2 = await authFetch(EXPECTED_API_URL, token, `/api/controle-voos/voos/${vooId}/rdv`, {
      method: 'PUT',
      body: JSON.stringify(rdvPayloadV2)
    });
    assert(putRdvRes2.json?.data?.versao === 2, `Versão esperada 2, recebida ${putRdvRes2.json?.data?.versao} (${putRdvRes2.status} - ${JSON.stringify(putRdvRes2.json)})`);

    // 4. Atualizar 2->3
    console.log('\n[E2E] 4. Atualizar rascunho 2 -> 3...');
    const rdvPayloadV3 = {
      versao: 2,
      numero: `${runKey}-v3`
    };
    const putRdvRes3 = await authFetch(EXPECTED_API_URL, token, `/api/controle-voos/voos/${vooId}/rdv`, {
      method: 'PUT',
      body: JSON.stringify(rdvPayloadV3)
    });
    assert(putRdvRes3.json?.data?.versao === 3, `Versão esperada 3, recebida ${putRdvRes3.json?.data?.versao} (${putRdvRes3.status} - ${JSON.stringify(putRdvRes3.json)})`);

    // 5. Atualizar 3->4
    console.log('\n[E2E] 5. Atualizar rascunho 3 -> 4...');
    const rdvPayloadV4 = {
      versao: 3,
      numero: `${runKey}-v4`
    };
    const putRdvRes4 = await authFetch(EXPECTED_API_URL, token, `/api/controle-voos/voos/${vooId}/rdv`, {
      method: 'PUT',
      body: JSON.stringify(rdvPayloadV4)
    });
    assert(putRdvRes4.json?.data?.versao === 4, `Versão esperada 4, recebida ${putRdvRes4.json?.data?.versao} (${putRdvRes4.status} - ${JSON.stringify(putRdvRes4.json)})`);

    // 6, 7 e 8. Concorrência: abrir duas sessões com a mesma versão (4) e enviar
    console.log('\n[E2E] 6, 7 e 8. Teste de concorrência com versão 4 (CAS)...');
    const payloadConcorrenteV4 = {
      versao: 4,
      numero: `${runKey}-concorrencia`
    };

    const prom1 = authFetch(EXPECTED_API_URL, token, `/api/controle-voos/voos/${vooId}/rdv`, {
      method: 'PUT',
      body: JSON.stringify(payloadConcorrenteV4)
    });
    const prom2 = authFetch(EXPECTED_API_URL, token, `/api/controle-voos/voos/${vooId}/rdv`, {
      method: 'PUT',
      body: JSON.stringify(payloadConcorrenteV4)
    });

    const [res1, res2] = await Promise.all([prom1, prom2]);

    console.log('[E2E] Resultado Promise 1:', res1.json?.data ? `Sucesso (Versão: ${res1.json.data.versao})` : `Erro ${res1.status} - ${JSON.stringify(res1.json)}`);
    console.log('[E2E] Resultado Promise 2:', res2.json?.data ? `Sucesso (Versão: ${res2.json.data.versao})` : `Erro ${res2.status} - ${JSON.stringify(res2.json)}`);

    let sucessoCount = 0;
    let conflitoCount = 0;

    if (res1.json?.data?.versao === 5) sucessoCount++;
    if (res2.json?.data?.versao === 5) sucessoCount++;

    if (res1.status === 409) conflitoCount++;
    if (res2.status === 409) conflitoCount++;

    assert(sucessoCount === 1, `Esperava exatamente 1 sucesso concorrente, teve ${sucessoCount}`);
    assert(conflitoCount === 1, `Esperava exatamente 1 conflito 409, teve ${conflitoCount}`);
    console.log('[E2E] Proteção de CAS (409) validada com sucesso.');

    console.log('\n✅ E2E Sintético do RDV CAS concluído com sucesso!');
  } finally {
    // Cleanup: cancelar (via endpoint oficial) o voo sintético desta execução,
    // mesmo que uma assertion acima tenha falhado. Isto NAO e um hard-delete
    // nem restaura o baseline de staging: a API nao expoe rota de exclusao
    // definitiva, entao a linha do voo/RDV permanece com status 'cancelado'
    // — residuo conhecido e documentado, nao um estado limpo.
    if (vooId) {
      console.log(`\n[E2E] Executando cleanup (cancelamento) do voo sintético ${vooId}...`);
      try {
        // PATCH /voos/:id exige `versao` (CAS de cv_voos, independente do CAS
        // de cv_rdv_operacional exercitado acima) — buscar o estado atual do
        // voo imediatamente antes do PATCH, em vez de reaproveitar a versao
        // da criacao, para o cleanup continuar correto mesmo se algum passo
        // futuro do teste vier a alterar o voo.
        const vooAtualRes = await authFetch(EXPECTED_API_URL, token, `/api/controle-voos/voos/${vooId}`);
        const vooVersaoAtual = vooAtualRes.json?.data?.versao;
        if (vooAtualRes.status !== 200 || typeof vooVersaoAtual !== 'number') {
          console.error(`[E2E] CLEANUP_FALHOU: nao foi possivel ler a versao atual do voo ${vooId} (${vooAtualRes.status} - ${JSON.stringify(vooAtualRes.json)})`);
        } else {
          const result = await cancelSyntheticFlight(EXPECTED_API_URL, token, {
            vooId,
            versao: vooVersaoAtual,
            canceladoMotivoId,
          });
          if (result.ok) {
            console.log(`[E2E] Voo ${vooId} cancelado com sucesso (cleanup via API; resíduo de linha cancelada é esperado, não um hard-delete nem restauração do baseline).`);
          } else {
            console.error(`[E2E] CLEANUP_FALHOU: cancelamento do voo ${vooId} retornou ${result.status} - ${JSON.stringify(result.json)}`);
          }
        }
      } catch (cleanupErr) {
        console.error(`[E2E] CLEANUP_FALHOU: excecao ao cancelar o voo ${vooId}:`, cleanupErr);
      }
    } else {
      console.log('\n[E2E] Cleanup ignorado: nenhum voo sintético chegou a ser criado nesta execução.');
    }

    // FASE 4: melhor esforco, so mexe em cada residuo conhecido se todos os
    // criterios de identidade forem confirmados via API imediatamente antes.
    console.log('\n[E2E] Tentando cleanup dos residuos conhecidos (22-26) — somente se inequivocamente QA...');
    for (const residualVooId of KNOWN_RESIDUAL_VOO_IDS) {
      try {
        await cleanupResidualFlight(EXPECTED_API_URL, token, canceladoMotivoId, residualVooId);
      } catch (residualErr) {
        console.error(`[E2E] Residuo ${residualVooId}: CLEANUP_FALHOU (excecao):`, residualErr);
      }
    }
  }
}

run().catch(e => {
  console.error('\n❌ E2E Sintético falhou:');
  console.error(e);
  process.exit(1);
});
