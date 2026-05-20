#!/usr/bin/env node

/**
 * Script para buscar automaticamente o ZONE_ID da Cloudflare
 * para o domínio airtrust.pages.dev
 */

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!API_TOKEN) {
  console.error('❌ CLOUDFLARE_API_TOKEN não definido.');
  console.error('   Configure no .env antes de rodar.');
  process.exit(1);
}

async function findZoneId() {
  console.log('🔍 Buscando Zone ID para domínio airtrust...');

  const res = await fetch('https://api.cloudflare.com/client/v4/zones', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    console.error('❌ Erro ao buscar zones:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  // Procurar zona que contém "airtrust" ou "pages.dev"
  const zones = data.result || [];
  const airtrustZone = zones.find(
    (z) => z.name.includes('airtrust') || z.name.includes('pages.dev'),
  );

  if (!airtrustZone) {
    console.log('\n📋 Zones disponíveis:');
    zones.forEach((z) => {
      console.log(`   - ${z.name} (ID: ${z.id})`);
    });
    console.log('\n❌ Nenhuma zona com "airtrust" ou "pages.dev" encontrada.');
    console.log('   Copie o Zone ID correto da lista acima e adicione em .env');
    process.exit(1);
  }

  console.log(`\n✅ Zone encontrada: ${airtrustZone.name}`);
  console.log(`   Zone ID: ${airtrustZone.id}`);
  console.log('\n📝 Adicione esta linha no seu .env:');
  console.log(`   CLOUDFLARE_ZONE_ID=${airtrustZone.id}`);
}

findZoneId().catch((err) => {
  console.error('❌ Erro inesperado:', err);
  process.exit(1);
});
