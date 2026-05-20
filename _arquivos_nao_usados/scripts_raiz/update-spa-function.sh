#!/bin/bash

# Ler o index.html e extrair os hashes
INDEX_FILE="dist/client/index.html"

if [ ! -f "$INDEX_FILE" ]; then
  echo "❌ Erro: $INDEX_FILE não encontrado"
  exit 1
fi

# Extrair os hashes dos arquivos JS usando sed
INDEX_HASH=$(sed -n 's/.*index-\([a-zA-Z0-9_-]*\).js.*/\1/p' "$INDEX_FILE" | head -1)
VENDOR_HASH=$(sed -n 's/.*vendor-\([a-zA-Z0-9_-]*\).js.*/\1/p' "$INDEX_FILE" | head -1)
ROUTER_HASH=$(sed -n 's/.*router-\([a-zA-Z0-9_-]*\).js.*/\1/p' "$INDEX_FILE" | head -1)

echo "✅ Hashes extraídos:"
echo "   index-$INDEX_HASH.js"
echo "   vendor-$VENDOR_HASH.js"
echo "   router-$ROUTER_HASH.js"

# Gerar a função Pages
cat > functions/[[path]].ts << EOF
/**
 * Cloudflare Pages Function - SPA Routing
 * Auto-gerado: $(date)
 */

export const onRequest = async ({ request, next }: any): Promise<Response> => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Deixar passar assets, API e outros recursos estáticos
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/images/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.json') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.woff2')
  ) {
    return next();
  }

  // Para qualquer outra rota, servir index.html
  const response = await next();
  
  if (response.status === 404) {
    return new Response(
      \`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AirTrust</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    </style>
    <script type="module" crossorigin src="/assets/index-$INDEX_HASH.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/vendor-$VENDOR_HASH.js">
    <link rel="modulepreload" crossorigin href="/assets/router-$ROUTER_HASH.js">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>\`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      }
    );
  }

  return response;
};
EOF

echo "✅ Função Pages atualizada: functions/[[path]].ts"
