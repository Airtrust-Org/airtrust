#!/usr/bin/env node

/**
 * Script para limpar cache do Cloudflare Pages
 * Não precisa de Zone ID, só de Account ID e API Token
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const PROJECT_NAME = 'airtrust-production'; // Nome do projeto Pages

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('❌ CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN não definidos.');
  console.error('   Configure no .env antes de rodar.');
  process.exit(1);
}

async function purgePages() {
  console.log(`🧹 Limpando cache do Pages: ${PROJECT_NAME}...`);

  // API do Pages para purge de cache
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/purge_build_cache`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    console.error('❌ Erro ao limpar cache do Pages:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('✅ Cache do Pages limpo com sucesso!');
  console.log('   Próximo deploy vai reconstruir tudo do zero.');
}

purgePages().catch((err) => {
  console.error('❌ Erro inesperado:', err);
  process.exit(1);
});
