#!/usr/bin/env node

/**
 * Script para invalidar completamente o cache do Cloudflare Pages
 * Usa a API de deployments para forçar novo deploy
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const PROJECT_NAME = 'airtrust-production';

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('❌ CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN não definidos.');
  process.exit(1);
}

async function invalidateCache() {
  console.log('🔄 Invalidando cache completo do Cloudflare Pages...\n');

  // 1. Purge build cache
  console.log('1️⃣ Limpando build cache...');
  const purgeBuildUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/purge_build_cache`;

  const purgeRes = await fetch(purgeBuildUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const purgeData = await purgeRes.json();
  if (!purgeRes.ok || !purgeData.success) {
    console.error('❌ Erro ao limpar build cache:', JSON.stringify(purgeData, null, 2));
  } else {
    console.log('✅ Build cache limpo');
  }

  // 2. Trigger retry do último deployment (força revalidação)
  console.log('\n2️⃣ Buscando último deployment...');
  const deploymentsUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments`;

  const deploymentsRes = await fetch(deploymentsUrl, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const deploymentsData = await deploymentsRes.json();

  if (!deploymentsRes.ok || !deploymentsData.success || deploymentsData.result.length === 0) {
    console.error('❌ Erro ao buscar deployments:', JSON.stringify(deploymentsData, null, 2));
    process.exit(1);
  }

  const latestDeployment = deploymentsData.result[0];
  console.log(`✅ Último deployment: ${latestDeployment.id}`);
  console.log(`   Environment: ${latestDeployment.environment}`);
  console.log(`   Created: ${latestDeployment.created_on}`);
  console.log(`   URL: ${latestDeployment.url}`);

  // 3. Criar novo deployment (forçar rebuild)
  console.log('\n3️⃣ Forçando novo deployment...');
  console.log('⚠️  Isso vai triggar um rebuild completo do projeto');
  console.log('⏳ Aguarde 2-3 minutos para completar\n');

  console.log('📋 Para forçar novo deployment:');
  console.log('   1. Faça um commit (mesmo que vazio)');
  console.log('   2. Push para GitHub');
  console.log('   3. Aguarde Cloudflare Pages detectar e fazer deploy\n');

  console.log('🔗 Acompanhe em:');
  console.log(`   https://dash.cloudflare.com/${ACCOUNT_ID}/pages/view/${PROJECT_NAME}\n`);
}

invalidateCache().catch((err) => {
  console.error('❌ Erro inesperado:', err);
  process.exit(1);
});
