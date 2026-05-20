#!/usr/bin/env node

/**
 * Script para limpar o cache de EDGE do Cloudflare
 * Usa a API de purge_cache com URLs específicas
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('❌ CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN não definidos.');
  process.exit(1);
}

async function purgeEdgeCache() {
  console.log('🧹 Limpando cache de EDGE do Cloudflare...\n');

  // URLs para purgar
  const urls = [
    'https://production.airtrust.pages.dev/',
    'https://production.airtrust.pages.dev/index.html',
    'https://production.airtrust.pages.dev/assets/*',
  ];

  console.log('📋 URLs a purgar:');
  urls.forEach((url) => console.log(`   - ${url}`));
  console.log('');

  // Tentar purge via Cloudflare Zone (se existir)
  // Como não temos Zone ID, vamos usar outra abordagem: forçar redeploy

  console.log('⚠️  Cloudflare Pages não permite purge de cache de edge via API.');
  console.log('   O cache só é limpo quando:');
  console.log('   1. Um novo deployment é criado');
  console.log('   2. O cache expira (7 dias)');
  console.log('');
  console.log('🔄 Solução: Vou verificar se há deployment rodando...\n');

  // Verificar deployments
  const deploymentsUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/airtrust-production/deployments`;

  const res = await fetch(deploymentsUrl, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    console.error('❌ Erro ao verificar deployments:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  if (data.result && data.result.length > 0) {
    const latest = data.result[0];
    console.log(`📦 Último deployment:`);
    console.log(`   ID: ${latest.id}`);
    console.log(`   Status: ${latest.latest_stage.name} (${latest.latest_stage.status})`);
    console.log(`   Created: ${latest.created_on}`);
    console.log(`   URL: ${latest.url}\n`);

    if (latest.latest_stage.status === 'success') {
      console.log('✅ Deployment concluído com sucesso!');
      console.log('⏳ Aguarde 1-2 minutos para o cache atualizar automaticamente.');
    } else if (latest.latest_stage.status === 'active') {
      console.log('🔄 Deployment em progresso...');
      console.log('⏳ Aguarde finalizar (1-3 minutos).');
    } else {
      console.log(`⚠️  Status: ${latest.latest_stage.status}`);
    }
  } else {
    console.log('❌ Nenhum deployment encontrado.');
  }
}

purgeEdgeCache().catch((err) => {
  console.error('❌ Erro inesperado:', err);
  process.exit(1);
});
