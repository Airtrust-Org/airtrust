/**
 * Script para limpar o cache do Cloudflare (Purge Everything ou URLs específicas)
 *
 * Requer variáveis de ambiente:
 * - CLOUDFLARE_ZONE_ID
 * - CLOUDFLARE_API_TOKEN (com permissão de Cache Purge)
 */

const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ZONE_ID || !API_TOKEN) {
  console.error('❌ CLOUDFLARE_ZONE_ID ou CLOUDFLARE_API_TOKEN não definidos.');
  console.error('   Configure no .env ou nas variáveis de ambiente antes de rodar.');
  process.exit(1);
}

const CLOUDFLARE_API = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`;

async function purgeEverything() {
  console.log('🧹 Enviando Purge Everything para Cloudflare...');

  const res = await fetch(CLOUDFLARE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ purge_everything: true }),
  });

  const data = (await res.json()) as unknown as {
    success: boolean;
    errors?: unknown[];
    messages?: unknown[];
  };

  if (!res.ok || !data.success) {
    console.error('❌ Erro ao limpar cache:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('✅ Cache limpo com sucesso no Cloudflare.');
}

async function purgeUrls(urls: string[]) {
  console.log('🧹 Enviando purge de URLs específicas para Cloudflare...');
  console.log(urls.map((u) => `  - ${u}`).join('\n'));

  const res = await fetch(CLOUDFLARE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: urls }),
  });

  const data = (await res.json()) as unknown as {
    success: boolean;
    errors?: unknown[];
    messages?: unknown[];
  };

  if (!res.ok || !data.success) {
    console.error('❌ Erro ao limpar cache (URLs):', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('✅ Cache limpo para URLs específicas.');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'all') {
    await purgeEverything();
    return;
  }

  if (args[0] === 'urls') {
    const urls = args.slice(1);
    if (urls.length === 0) {
      console.error('❌ Use: node cloudflare-purge-cache.js urls <url1> <url2> ...');
      process.exit(1);
    }
    await purgeUrls(urls);
    return;
  }

  console.error('Uso:');
  console.error('  npx ts-node scripts/cloudflare-purge-cache.ts all');
  console.error(
    '  npx ts-node scripts/cloudflare-purge-cache.ts urls https://seu-site.com/ https://seu-site.com/rota',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('❌ Erro inesperado no script de purge:', err);
  process.exit(1);
});
