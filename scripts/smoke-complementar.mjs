import { fetchJson, login, extractAccessToken } from './smoke-auth-common.mjs';
import assert from 'assert';

const baseUrl = process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev';
const email = process.env.STAGING_SMOKE_EMAIL;
const password = process.env.STAGING_SMOKE_PASSWORD;

async function run() {
  console.log("Iniciando smoke complementar de certificados...");
  
  // 1. Unauthenticated (401)
  const res401_list = await fetch(`${baseUrl}/api/certificados/historico/999/certificados`);
  assert(res401_list.status === 401, `Expected 401 list, got ${res401_list.status}`);
  const res401_stream = await fetch(`${baseUrl}/api/pasta-virtual/stream/999`);
  assert(res401_stream.status === 401, `Expected 401 stream, got ${res401_stream.status}`);
  console.log("✓ 401 Comprovado");

  // Login
  const loginPayload = await login(baseUrl, email, password);
  const token = extractAccessToken(loginPayload);

  // 404
  const res404 = await fetch(`${baseUrl}/api/pasta-virtual/stream/999999999`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  // Dependendo da lógica, pode ser 404 ou 403, mas a API deve rejeitar
  assert(res404.status === 404 || res404.status === 403, `Expected 404/403 stream, got ${res404.status}`);
  console.log("✓ 404/403 Comprovado");

  console.log("✓ Smoke complementar finalizado.");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
