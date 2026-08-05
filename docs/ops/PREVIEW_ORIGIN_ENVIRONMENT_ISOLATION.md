# Isolamento de Origens e Ambientes

**Frente:** 9 — Isolamento de Origens e Ambientes  
**SHA-base:** `c3259a7967412c4a4219beba095f4b5515fb71b9`  
**Branch:** `fix/preview-origin-environment-isolation-20260804`

## Objetivo

Impedir que builds de preview ou desenvolvimento usem a API de produção com credenciais. A decisão é feita em duas barreiras:

1. o frontend resolve a API por host explícito e falha fechado para host desconhecido;
2. o Worker rejeita qualquer request com `Origin` não listado no `CORS_ORIGINS` do ambiente antes do Hono e de qualquer rota com efeito colateral.

Nenhuma regra usa wildcard ou regex para aceitar todos os subdomínios Pages.

## Matriz de ambientes

| Ambiente frontend | Hosts | API permitida | Comportamento sem configuração |
|---|---|---|---|
| Produção | `airtrust.online`, `www.airtrust.online`, `airtrust.pages.dev`, `production.airtrust.pages.dev` | `https://api.airtrust.online/api` | produção canônica |
| Staging oficial | `staging.airtrust.pages.dev` | `https://airtrust-api-staging.airtrust.workers.dev/api` | staging canônico |
| Host `main` | `main.airtrust.pages.dev` | nenhuma | bloqueado por ser ambíguo e não usado pelo workflow oficial |
| Preview aprovado | origem Pages exata aprovada no `CORS_ORIGINS` de staging | staging somente | frontend exige `VITE_API_URL`; Worker rejeita se a origem não estiver listada |
| Preview arbitrário | qualquer outro `*.pages.dev` | nenhuma por padrão | erro explícito no frontend e `403 CORS_ORIGIN_DENIED` no Worker |
| Local | `localhost`, `127.0.0.1` nas portas declaradas | proxy same-origin `/api` | não usa API remota por fallback |
| Host customizado | domínio não registrado | URL HTTPS explícita, nunca produção sem inclusão na allowlist oficial | erro explícito |

O workflow oficial `.github/workflows/deploy-staging.yml` publica a branch Pages `staging`. A PR #804 confirmou a mesma URL canônica e classifica `main.airtrust.pages.dev` como alvo ambíguo/proibido.

## CORS do Worker

### Produção

Permitidas:

- `https://airtrust.online`;
- `https://www.airtrust.online`;
- `https://airtrust.pages.dev`;
- `https://production.airtrust.pages.dev`.

Negadas:

- staging e `main.airtrust.pages.dev`;
- qualquer preview de branch não listado;
- `Origin: null`;
- origens com wildcard, path, query, fragmento ou credenciais;
- domínios parecidos, como `airtrust.pages.dev.evil.example`.

### Staging

Permitida por padrão:

- `https://staging.airtrust.pages.dev`.

Um preview adicional só pode ser autorizado adicionando sua origem exata ao `CORS_ORIGINS` de staging em mudança revisada. Ele nunca é aceito por sufixo ou regex. `main.airtrust.pages.dev` continua negado até existir decisão oficial explícita que substitua a configuração atual.

### Desenvolvimento local

Somente as origens exatas `localhost` e `127.0.0.1` nas portas declaradas em `worker-airtrust/wrangler.dev.toml` e no ambiente `development` remoto.

## Preflight e credenciais

- origem permitida: o Hono mantém `Access-Control-Allow-Origin` exato e `Access-Control-Allow-Credentials: true`;
- origem negada: a barreira `environment-entrypoint.ts` responde `403` antes das rotas e sem headers de autorização CORS;
- request sem `Origin`: permitido para same-origin e clientes server-to-server;
- wildcard com credenciais permanece proibido.

## Cookies LMS

A mudança não altera o contrato de sessão de assets:

- cookie `airtrust_lms_asset_token`;
- `HttpOnly`;
- `Secure` e `SameSite=None` fora do ambiente local;
- `Path=/api/lms/`;
- chamadas autenticadas continuam com `credentials: include`;
- SCORM, H5P e asset-session permanecem na mesma arquitetura.

## Configuração do frontend

`VITE_API_URL` é validada contra o host:

- produção não pode apontar para staging;
- staging não pode apontar para produção;
- preview Pages exige a URL de staging explícita;
- `main.airtrust.pages.dev` falha mesmo com URL explícita enquanto permanecer ambíguo;
- host desconhecido exige configuração explícita e não pode apontar para produção;
- localhost continua no proxy local mesmo que uma URL remota seja fornecida.

O workflow oficial de staging já injeta `VITE_API_URL=https://airtrust-api-staging.airtrust.workers.dev/api`; nenhum workflow temporário foi criado.

## Guard

Comando standalone:

```bash
node scripts/guard-no-production-preview-api.mjs
```

O guard detecta:

- `pages.dev` genérico roteado para produção;
- regex ampla de `*.airtrust.pages.dev`;
- wildcard com credentials;
- URL de produção em workflow de staging/preview;
- branch Pages de staging configurada como `production`;
- origem de staging em CORS de produção e vice-versa;
- preview Pages não aprovado em produção;
- mistura de IDs D1, buckets ou APIs de staging/produção;
- remoção da barreira `environment-entrypoint.ts` do `main` do Worker.

A ativação no agregador obrigatório de CI pertence à Frente 6. Esta frente entrega o script e os testes, sem alterar `package.json` nem workflows oficiais para evitar sobreposição de ownership.

## Testes

Cobertura adicionada para:

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
- preservação do cookie SCORM/H5P/asset-session;
- preservação do handler `scheduled` do Worker;
- detecção de regressões pelo guard.

## Dependências e conflitos

- **PR #807:** na revalidação imediatamente anterior ao commit, não alterava mais `src/react-app/config/api.ts` nem outro arquivo desta frente. Permanece dependência semântica: o cliente autenticado deve continuar consumindo o `API_BASE_URL` canônico e preservando `credentials: include`.
- **PR #804:** sem sobreposição de arquivos. A URL oficial de staging e o bloqueio do host `main` foram alinhados semanticamente.
- **PR #808:** sem sobreposição de arquivos; esta frente não toca migrations nem scripts de aplicação de schema.
- **Frente 6:** proprietária da ativação do guard no lint/CI obrigatório.
- **PR #801:** o contrato `credentials: include` e o cookie de assets foi preservado.

## Migrations, deploy e secrets

- nenhuma migration criada ou aplicada;
- nenhum deploy executado;
- nenhum DNS alterado;
- nenhum secret alterado;
- nenhum dado remoto acessado ou escrito;
- nenhuma mudança de autenticação, token ou cache geral.

## Riscos residuais

- previews adicionais exigem inclusão explícita na configuração de staging; sem isso falham por projeto;
- a ativação obrigatória do guard depende da Frente 6;
- a PR #807 pode exigir apenas validação semântica após integração, caso altere posteriormente o contrato de `API_BASE_URL`;
- validação funcional real de SCORM/H5P cross-origin permanece gate de staging, não executado nesta frente.
