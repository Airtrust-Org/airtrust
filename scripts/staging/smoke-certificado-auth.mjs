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
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    return { status: res.status, ok: res.ok, json };
  } else {
    const blob = await res.blob();
    return { status: res.status, ok: res.ok, blob };
  }
}

async function run() {
  console.log(`\n[E2E] Iniciando E2E Sintético do Certificado Auth no ambiente: ${EXPECTED_API_URL}`);

  const email = process.env.STAGING_SMOKE_EMAIL;
  const password = process.env.STAGING_SMOKE_PASSWORD;

  if (!email || !password) {
    throw new Error('As credenciais STAGING_SMOKE_* nao estao configuradas no ambiente.');
  }

  console.log(`[E2E] Login como Smoke User: ${maskEmail(email)}`);
  const authRes = await login(EXPECTED_API_URL, email, password);
  const token = extractAccessToken(authRes, email);
  assert(token, 'Falha ao obter token do Smoke User');

  const HISTORICO_INEXISTENTE = 999999999;
  const DOCUMENTO_INEXISTENTE = 999999999;

  // 1. Testar 401 (sem token)
  console.log('\n[E2E] 1. Testando 401 (Sem Autenticação)...');
  const res401List = await authFetch(EXPECTED_API_URL, null, `/api/certificados/historico/${HISTORICO_INEXISTENTE}/certificados`);
  assert(res401List.status === 401, `Esperava 401 na listagem, recebeu ${res401List.status}`);
  
  const res401Stream = await authFetch(EXPECTED_API_URL, null, `/api/pasta-virtual/stream/${DOCUMENTO_INEXISTENTE}`);
  assert(res401Stream.status === 401, `Esperava 401 no stream, recebeu ${res401Stream.status}`);
  console.log('[E2E] 401 validado corretamente.');

  // 2. Testar 404 (documento inexistente, mas com auth)
  console.log('\n[E2E] 2. Testando 404 (Com Autenticação, ID inexistente)...');
  const res404List = await authFetch(EXPECTED_API_URL, token, `/api/certificados/historico/${HISTORICO_INEXISTENTE}/certificados`);
  // A rota de listagem pode retornar 200 com array vazio ou 404 dependendo de como a API trata historicos inexistentes.
  assert(res404List.status === 404 || (res404List.status === 200 && Array.isArray(res404List.json.data) && res404List.json.data.length === 0), `Esperava 404 ou 200 vazio na listagem, recebeu ${res404List.status}`);
  
  const res404Stream = await authFetch(EXPECTED_API_URL, token, `/api/pasta-virtual/stream/${DOCUMENTO_INEXISTENTE}`);
  assert(res404Stream.status === 404, `Esperava 404 no stream, recebeu ${res404Stream.status}`);
  console.log('[E2E] 404 validado corretamente.');

  // NOTA: Para validar o download e 403, precisaríamos de uma fixture de documento existente.
  // Como não temos garantia de que o STAGING_SMOKE_EMAIL possui um documento no Staging,
  // o teste de download não falhará o build, mas tentará buscar um documento caso consigamos listar algum!
  
  console.log('\n[E2E] Procurando documentos do usuario para teste de download...');
  const matriculasRes = await authFetch(EXPECTED_API_URL, token, '/api/lms/meus-cursos');
  if (matriculasRes.status === 200 && matriculasRes.json?.data?.length > 0) {
    const historico = matriculasRes.json.data.find(m => m.qualificacao_historico_id);
    if (historico) {
      console.log(`[E2E] Historico encontrado: ${historico.qualificacao_historico_id}. Buscando certificados...`);
      const certsRes = await authFetch(EXPECTED_API_URL, token, `/api/certificados/historico/${historico.qualificacao_historico_id}/certificados`);
      if (certsRes.status === 200 && certsRes.json?.data?.length > 0) {
        const docId = certsRes.json.data[0].documento_id || certsRes.json.data[0].id;
        console.log(`[E2E] Documento encontrado: ${docId}. Testando download...`);
        const downloadRes = await authFetch(EXPECTED_API_URL, token, `/api/pasta-virtual/stream/${docId}`);
        assert(downloadRes.status === 200, `Download falhou com status ${downloadRes.status}`);
        assert(downloadRes.blob && downloadRes.blob.size > 0, 'O arquivo baixado está vazio!');
        console.log('[E2E] Download de certificado existente validado com sucesso.');
      }
    }
  }

  console.log('\n✅ E2E Sintético do Certificado Auth concluído com sucesso!');
}

run().catch(e => {
  console.error('\n❌ E2E Sintético falhou:');
  console.error(e);
  process.exit(1);
});
