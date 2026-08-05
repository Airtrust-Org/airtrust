# Isolamento de Origens e Ambientes

**Frente:** 9 — Isolamento de Origens e Ambientes

**SHA-base:** `c3259a7967412c4a4219beba095f4b5515fb71b9`

**Branch:** `fix/preview-origin-environment-isolation-20260804`

## Objetivo

Impedir que builds de preview ou desenvolvimento usem a API de produção com credenciais.
A decisão é aplicada em duas barreiras:

1. O frontend resolve a API por host explícito e falha fechado para host desconhecido.
2. O Worker rejeita qualquer request com `Origin` não listado no `CORS_ORIGINS` do
   ambiente antes do Hono e de qualquer rota com efeito colateral.

Nenhuma regra usa wildcard ou regex para aceitar todos os subdomínios Pages.

## Matriz de ambientes

### Produção

Hosts oficiais:

- `airtrust.online`;
- `www.airtrust.online`;
- `airtrust.pages.dev`;
- `production.airtrust.pages.dev`.

API permitida: `https://api.airtrust.online/api`.

### Staging oficial

Host: `staging.airtrust.pages.dev`.

API permitida: `https://airtrust-api-staging.airtrust.workers.dev/api`.

### Host `main`

`main.airtrust.pages.dev` é bloqueado por ser ambíguo e não ser usado pelo workflow
oficial.

### Preview aprovado

Uma origem Pages adicional precisa ser incluída de forma exata no `CORS_ORIGINS` de
staging. O frontend exige `VITE_API_URL` de staging, e o Worker rejeita a origem se ela
não estiver listada.

### Preview arbitrário

Qualquer outro `*.pages.dev` falha fechado no frontend e recebe
`403 CORS_ORIGIN_DENIED` no Worker.

### Desenvolvimento local

`localhost` e `127.0.0.1`, nas portas declaradas, usam o proxy same-origin `/api`.
Não existe fallback para API remota.

### Host customizado

Um domínio não registrado exige uma URL HTTPS explícita. A API de produção permanece
proibida até o domínio entrar na allowlist oficial.

O workflow `.github/workflows/deploy-staging.yml` publica a branch Pages `staging`.
A PR #804 confirmou a mesma URL canônica e classificou `main.airtrust.pages.dev` como
alvo ambíguo ou proibido.

## CORS do Worker

### Produção

Origens permitidas:

- `https://airtrust.online`;
- `https://www.airtrust.online`;
- `https://airtrust.pages.dev`;
- `https://production.airtrust.pages.dev`.

Origens negadas:

- staging e `main.airtrust.pages.dev`;
- qualquer preview de branch não listado;
- `Origin: null`;
- origens com wildcard, path, query, fragmento ou credenciais;
- domínios parecidos, como `airtrust.pages.dev.evil.example`.

### Staging

A origem permitida por padrão é `https://staging.airtrust.pages.dev`.

Um preview adicional só pode ser autorizado por origem exata no `CORS_ORIGINS` de
staging. Ele nunca é aceito por sufixo ou regex. `main.airtrust.pages.dev` continua
negado até existir uma decisão oficial explícita.

### Desenvolvimento local

Somente as origens exatas de `localhost` e `127.0.0.1`, nas portas declaradas em
`worker-airtrust/wrangler.dev.toml` e no ambiente remoto `development`, são permitidas.

## Preflight e credenciais

- Uma origem permitida recebe `Access-Control-Allow-Origin` exato e
  `Access-Control-Allow-Credentials: true`.
- Uma origem negada recebe `403` na barreira `environment-entrypoint.ts`, antes das
  rotas e sem headers de autorização CORS.
- Requests sem `Origin` continuam permitidos para same-origin e clientes
  server-to-server.
- Wildcard com credenciais permanece proibido.

## Cookies LMS

A mudança não altera o contrato de sessão de assets:

- cookie `airtrust_lms_asset_token`;
- `HttpOnly`;
- `Secure` e `SameSite=None` fora do ambiente local;
- `Path=/api/lms/`;
- chamadas autenticadas com `credentials: include`;
- SCORM, H5P e asset-session na mesma arquitetura.

## Configuração do frontend

`VITE_API_URL` é validada contra o host:

- produção não pode apontar para staging;
- staging não pode apontar para produção;
- preview Pages exige a URL de staging explícita;
- `main.airtrust.pages.dev` falha mesmo com URL explícita enquanto permanecer ambíguo;
- host desconhecido exige configuração explícita e não pode apontar para produção;
- localhost continua no proxy local mesmo que uma URL remota seja fornecida.

O workflow oficial de staging já injeta
`VITE_API_URL=https://airtrust-api-staging.airtrust.workers.dev/api`.
Nenhum workflow temporário foi criado.

## Guard

Comando standalone:

```bash
node scripts/guard-no-production-preview-api.mjs
```

O guard detecta:

- `pages.dev` genérico roteado para produção;
- regex ampla de `*.airtrust.pages.dev`;
- wildcard com credentials;
- URL de produção em workflow de staging ou preview;
- branch Pages de staging configurada como `production`;
- origem de staging em CORS de produção e vice-versa;
- preview Pages não aprovado em produção;
- mistura de IDs D1, buckets ou APIs de staging e produção;
- remoção da barreira `environment-entrypoint.ts` do `main` do Worker.

A ativação no agregador obrigatório de CI pertence à Frente 6. Esta frente entrega o
script e os testes sem alterar `package.json` ou workflows oficiais, evitando
sobreposição de ownership.

## Testes

A cobertura adicionada inclui:

- hosts oficiais de produção;
- `production.airtrust.pages.dev`;
- staging oficial;
- `main.airtrust.pages.dev` negado;
- preview aprovado e arbitrário;
- domínio malicioso parecido;
- localhost e `127.0.0.1`;
- `VITE_API_URL` explícita, inválida e incompatível;
- host desconhecido;
- CORS credenciado;
- preflight `OPTIONS` permitido e negado;
- `Origin: null`;
- tentativa de preview acessar produção;
- cookie SCORM, H5P e asset-session;
- preservação do handler `scheduled` do Worker;
- detectores do guard.

## Dependências e conflitos

- **PR #807:** na revalidação imediatamente anterior ao commit, não alterava
  `src/react-app/config/api.ts` nem outro arquivo desta frente. Permanece a dependência
  semântica de o cliente consumir o `API_BASE_URL` canônico e preservar
  `credentials: include`.
- **PR #804:** sem sobreposição de arquivos. A URL oficial de staging e o bloqueio do
  host `main` foram alinhados semanticamente.
- **PR #808:** sem sobreposição de arquivos. Esta frente não toca migrations nem
  scripts de aplicação de schema.
- **Frente 6:** proprietária da ativação do guard no lint e na CI obrigatória.
- **PR #801:** o contrato `credentials: include` e o cookie de assets foram preservados.

## Migrations, deploy e secrets

- Nenhuma migration foi criada ou aplicada.
- Nenhum deploy foi executado.
- Nenhum DNS foi alterado.
- Nenhum secret foi alterado.
- Nenhum dado remoto foi acessado ou escrito.
- Nenhuma arquitetura de autenticação, token ou cache geral foi alterada.

## Riscos residuais

- Previews adicionais exigem inclusão explícita na configuração de staging.
- A ativação obrigatória do guard depende da Frente 6.
- A PR #807 pode exigir validação semântica após integração se alterar posteriormente o
  contrato de `API_BASE_URL`.
- A validação funcional real de SCORM e H5P cross-origin permanece um gate de staging
  não executado nesta frente.
