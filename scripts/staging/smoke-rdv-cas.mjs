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
    prefixo: `QA-E2E-${Date.now()}`,
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

  const vooId = criarVooRes.json?.data?.id;
  assert(vooId, `Falha ao criar voo sintético: ${JSON.stringify(criarVooRes.json)}`);
  console.log(`[E2E] Voo sintético criado: ID ${vooId}`);

  // 2. Criar rascunho inicial com versão 1
  console.log('\n[E2E] 2. Criar rascunho inicial do RDV...');
  const rdvPayloadV1 = {
    versao: 0,
    numero: "v1",
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
    numero: "v2"
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
    numero: "v3"
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
    numero: "v4"
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
    numero: "concorrencia"
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

  // Cleanup: Cancelar o voo para não deixar sujeira
  // Nota: A API atual não permite DELETAR voos em produção/staging, e não há rota
  // oficial exposta para hard-delete. O cleanup residual inevitável (linhas mantidas na tabela
  // com status 'cancelado') está documentado. Gates devem ser avaliados se isso for crítico.
  console.log('\n[E2E] Executando cleanup do voo sintético...');
  await authFetch(EXPECTED_API_URL, token, `/api/controle-voos/voos/${vooId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelado' })
  });
  console.log(`[E2E] Voo ${vooId} cancelado com sucesso. (Resíduos mantidos devido à ausência de hard-delete oficial).`);
  
  console.log('\n✅ E2E Sintético do RDV CAS concluído com sucesso!');
}

run().catch(e => {
  console.error('\n❌ E2E Sintético falhou:');
  console.error(e);
  process.exit(1);
});
