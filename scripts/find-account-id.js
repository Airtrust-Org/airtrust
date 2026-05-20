#!/usr/bin/env node

/**
 * Script para encontrar o Account ID da Cloudflare
 */

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!API_TOKEN) {
  console.error('❌ CLOUDFLARE_API_TOKEN não definido.');
  console.error('   Configure no .env antes de rodar.');
  process.exit(1);
}

async function findAccount() {
  console.log('🔍 Buscando Account ID...\n');

  const res = await fetch('https://api.cloudflare.com/client/v4/accounts', {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    console.error('❌ Erro ao buscar accounts:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  if (data.result && data.result.length > 0) {
    console.log('📋 Accounts encontrados:\n');
    data.result.forEach((account) => {
      console.log(`   Nome: ${account.name}`);
      console.log(`   ID: ${account.id}`);
      console.log(`   Type: ${account.type || 'standard'}\n`);
    });

    const firstAccount = data.result[0];
    console.log(`✅ Use este Account ID no .env:`);
    console.log(`   CLOUDFLARE_ACCOUNT_ID=${firstAccount.id}\n`);
  } else {
    console.error('❌ Nenhum account encontrado.');
  }
}

findAccount().catch((err) => {
  console.error('❌ Erro inesperado:', err);
  process.exit(1);
});
