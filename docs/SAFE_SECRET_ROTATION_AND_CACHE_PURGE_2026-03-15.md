# Safe Secret Rotation And Cache Purge

Data: 2026-03-15

## Estado validado

- Worker production lista hoje `CF_BROWSER_API_TOKEN`, `EDAPP_API_TOKEN`, `JWT_SECRET` e `SENDGRID_FROM_EMAIL` em `wrangler secret list --env production`.
- `EDAPP_API_TOKEN` foi publicado com sucesso em production e validado em duas frentes:
  - chamada direta `GET https://rest.edapp.com/v2/users` retornou `200`
  - chamada autenticada ao endpoint do Worker `GET /api/integracoes/edapp/usuarios-disponiveis` retornou `200`
- `EDAPP_WEBHOOK_SECRET` ainda nao aparece nessa listagem e continua pendencia operacional, a menos que ja exista em outro ambiente/conta fora deste shell.
- Zone ID da Cloudflare para `airtrust.online`: `06d5dbd6978ab476c77a9a8956b3f2a1`.
- O `CLOUDFLARE_API_TOKEN` disponivel neste shell falhou com `Authentication error` ao chamar a API de purge da zone; para purge automatizado, o token precisa de permissao real de `Cache Purge` nessa zone.

## Checklist exato do token Cloudflare

No painel `Cloudflare Dashboard`:

1. Avatar no canto superior direito.
2. `My Profile`.
3. `API Tokens`.
4. `Create Token`.
5. `Create Custom Token`.

Preencher assim:

- `Token name`: `airtrust-cache-purge-production`
- `Permissions`:
  - `Zone` -> `Cache Purge` -> `Edit`
  - `Zone` -> `Zone` -> `Read`
- `Zone Resources`:
  - `Include`
  - `Specific zone`
  - `airtrust.online`

Depois de criado, exportar no shell:

```bash
export CLOUDFLARE_API_TOKEN="<novo-token-com-cache-purge>"
export CLOUDFLARE_ZONE_ID="06d5dbd6978ab476c77a9a8956b3f2a1"
export CLOUDFLARE_DOMAIN="https://airtrust.online"
```

## Purge de cache

Purge seletivo no dominio real:

```bash
cd /Users/filipedaumas/Airtrust
export CLOUDFLARE_ZONE_ID="06d5dbd6978ab476c77a9a8956b3f2a1"
export CLOUDFLARE_DOMAIN="https://airtrust.online"
./scripts/purge-cloudflare-cache.sh
```

Purge completo apenas em emergencia:

```bash
cd /Users/filipedaumas/Airtrust
export CLOUDFLARE_ZONE_ID="06d5dbd6978ab476c77a9a8956b3f2a1"
export CLOUDFLARE_DOMAIN="https://airtrust.online"
./scripts/purge-cloudflare-cache.sh --all
```

## Rotacao segura de secrets do Worker

Listar o inventario atual:

```bash
cd /Users/filipedaumas/Airtrust/worker-airtrust
npx wrangler secret list --env production
```

Rotacionar `JWT_SECRET` com valor novo gerado localmente:

```bash
cd /Users/filipedaumas/Airtrust/worker-airtrust
openssl rand -base64 64 | tr -d '\n' | npx wrangler secret put JWT_SECRET --env production
```

Configurar ou rotacionar `EDAPP_WEBHOOK_SECRET`:

```bash
cd /Users/filipedaumas/Airtrust/worker-airtrust
printf '%s' "$EDAPP_WEBHOOK_SECRET_NEW" | npx wrangler secret put EDAPP_WEBHOOK_SECRET --env production
```

Configurar ou rotacionar `EDAPP_API_TOKEN`:

```bash
cd /Users/filipedaumas/Airtrust/worker-airtrust
printf '%s' "$EDAPP_API_TOKEN_NEW" | npx wrangler secret put EDAPP_API_TOKEN --env production
```

## Ordem recomendada

1. Gerar novo `JWT_SECRET`.
2. Obter novo token/secret do EdApp no provedor externo.
3. Publicar `EDAPP_WEBHOOK_SECRET` e `EDAPP_API_TOKEN` via `wrangler secret put`.
4. Fazer deploy do Worker.
5. Validar `/api/health`, login, SGSO smoke e testes de integracao EdApp.

## Validacao pos-rotacao

```bash
cd /Users/filipedaumas/Airtrust/worker-airtrust
npx wrangler deploy --env production

cd /Users/filipedaumas/Airtrust
curl -fsSL https://airtrust-api-production.airtrust.workers.dev/api/health | head -80
AIRTRUST_SMOKE_EMAIL='admin@airtrust.com' AIRTRUST_SMOKE_PASSWORD='Admin@123' WEB_BASE='https://airtrust.online' BASE='https://airtrust-api-production.airtrust.workers.dev' bash scripts/smoke-test-sgso.sh
```

## Observacao

- A rotacao real de `EDAPP_API_TOKEN` depende do valor novo emitido pelo EdApp. Sem esse valor, o passo seguro no repo e remover fallbacks hardcoded, nao adivinhar segredo.
