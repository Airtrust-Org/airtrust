#!/usr/bin/env node

/**
 * Script para listar projetos do Cloudflare Pages
 * e descobrir o Account ID
 */

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!API_TOKEN) {
  console.error('❌ CLOUDFLARE_API_TOKEN não definido.');
  process.exit(1);
}

async function findAccountFromPages() {
  console.log('🔍 Tentando descobrir Account ID via API do Pages...\n');

  // Tenta listar todos os memberships do usuário
  const res = await fetch('https://api.cloudflare.com/client/v4/memberships', {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    console.error('❌ Erro:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  if (data.result && data.result.length > 0) {
    console.log('📋 Memberships encontrados:\n');
    data.result.forEach((membership) => {
      console.log(`   Account: ${membership.account.name}`);
      console.log(`   Account ID: ${membership.account.id}\n`);
    });

    const firstAccount = data.result[0].account;
    console.log(`✅ Use este Account ID no .env:`);
    console.log(`   CLOUDFLARE_ACCOUNT_ID=${firstAccount.id}\n`);
  } else {
    console.error('❌ Nenhum membership encontrado.');
  }
}

findAccountFromPages().catch((err) => {
  console.error('❌ Erro inesperado:', err);
  process.exit(1);
});
