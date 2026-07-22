# Staging Environment Stabilization 2026-07-01

## Status atual

O staging reconstruido pelo PR #226 ficou com schema valido, `0412` aplicada e Worker publicado em `https://airtrust-api-staging.airtrust.workers.dev`, mas sem dados-base de autenticacao e tenant.

Estado confirmado em `2026-07-02`:

- `usuarios = 0`
- `usuarios_empresas = 0`
- `empresas ativas = 0`
- `qualificacoes_tipos = 0`
- `qualificacoes_historico = 0`
- `qualificacoes_formatos = 0`
- `lms_cursos = 0`

Consequencia: o bloqueio do smoke autenticado nao e mais "falta de token manual". O bloqueio estrutural e a ausencia de fixture minima de tenant/usuario no novo D1 staging.

## Decisao

Nao usar token manual persistido.

O caminho estabilizado passa a ser:

1. Semear fixture fake minima apenas no D1 staging novo.
2. Guardar apenas `email` e `senha` em secrets de runtime.
3. Fazer login em `/api/auth/login` para obter token efemero.
4. Executar smoke read-only com esse token.

Token nao deve ser commitado, impresso nem armazenado em arquivo.
O smoke de staging deve usar `scripts/smoke-staging-auth.mjs`; o smoke de producao, quando necessario, deve usar `scripts/smoke-production-auth.mjs`.

## Fixture smoke

Fixture minima proposta:

- Empresa fake:
  - codigo: `airtrust_smoke`
  - nome: `AirTrust Smoke Tenant`
- Usuario fake:
  - nome: `Smoke Staging Admin`
  - email: vindo de `STAGING_SMOKE_EMAIL`
  - perfil global: `ADMIN`
- Vinculo tenant:
  - `usuarios_empresas.role = 'admin'`
  - `is_primary = 1`

Essa fixture e suficiente para:

- login;
- resolucao de `empresa_id`;
- escopo tenant;
- acesso read-only admin aos endpoints de smoke.

Nao depende de `funcionario_id`, nao usa PII real e nao toca producao.

## Secrets necessarios

Secrets/variaveis de ambiente para o smoke:

- `STAGING_API_BASE_URL`
  - default operacional: `https://airtrust-api-staging.airtrust.workers.dev`
- `STAGING_SMOKE_EMAIL`
- `STAGING_SMOKE_PASSWORD`
- opcional: `STAGING_D1_NAME`
  - default: `airtrust-db-staging-baseline-20260701`

Recomendacao:

- GitHub Actions secrets para execucao automatizada;
- ou env vars locais em janela controlada;
- nunca token fixo;
- nunca senha em documento versionado.

## Scripts

### 1. Smoke autenticado

Arquivo:

- [scripts/smoke-staging-auth.mjs](<AIRTRUST_ROOT>/scripts/smoke-staging-auth.mjs)

Comando:

```bash
npm run smoke:staging:auth
```

Comportamento:

- valida `/api/health`;
- valida `/api/version`;
- valida smoke negativo sem token:
  - `/api/auth/me`
  - `/api/qualificacoes/formatos`
  - `/api/qualificacoes/tipos`
  - `/api/qualificacoes/historico`
  - `/api/lms/cursos`
- se houver `STAGING_SMOKE_EMAIL` e `STAGING_SMOKE_PASSWORD`:
  - faz login;
  - obtem token em runtime;
  - nao imprime token;
  - valida os mesmos endpoints com `Bearer`;
  - imprime apenas status, contagens e amostras estruturais;
  - falha em status inesperado, corpo nao-JSON, shape invalido ou incoerencia basica de tenant.
- se os secrets nao estiverem presentes:
  - roda apenas a validacao negativa;
  - reporta `AUTH_SMOKE_SKIPPED`.

### 2. Seed controlado da fixture fake

Arquivo:

- [scripts/seed-staging-smoke-user.mjs](<AIRTRUST_ROOT>/scripts/seed-staging-smoke-user.mjs)

Dry-run:

```bash
node scripts/seed-staging-smoke-user.mjs
```

Apply no D1 staging novo:

```bash
STAGING_SMOKE_EMAIL='smoke.staging.test@example.invalid' \
STAGING_SMOKE_PASSWORD='***' \
node scripts/seed-staging-smoke-user.mjs --apply
```

Propriedades:

- idempotente;
- reexecutavel;
- atualiza hash de senha para o valor secreto corrente;
- nao grava token;
- nao grava senha em arquivo versionado;
- escreve apenas no D1 staging novo.

### 3. Doctor de staging

Arquivo:

- [scripts/staging-doctor.mjs](<AIRTRUST_ROOT>/scripts/staging-doctor.mjs)

Comando:

```bash
npm run staging:doctor
```

Comportamento:

- valida branch e working tree quando ha contexto git util;
- confirma que `worker-airtrust/wrangler.toml` aponta para:
  - `ENVIRONMENT = "staging"`
  - `name = "airtrust-api-staging"`
  - `database_name = "airtrust-db-staging-baseline-20260701"`
- valida `https://airtrust-api-staging.airtrust.workers.dev`;
- confirma `health`, `version`, smoke negativo e smoke autenticado;
- confirma que `https://airtrust-api.airtrust.workers.dev` nao e aceito como producao canonica;
- nao imprime senha, token, JWT ou cookie.

### 4. Workflow manual de staging

Arquivo:

- [.github/workflows/smoke-staging.yml](<AIRTRUST_ROOT>/.github/workflows/smoke-staging.yml)

Uso:

- disparo manual via `workflow_dispatch`;
- usa `STAGING_API_BASE_URL`, `STAGING_SMOKE_EMAIL`, `STAGING_SMOKE_PASSWORD` dos GitHub Secrets;
- roda smoke de staging e staging-doctor;
- nao faz seed automatico, nao faz deploy e nao toca producao.

## Como interpretar o resultado

`GO para smoke autenticado` significa:

- fixture fake minima existe no staging novo;
- login retorna `200`;
- rotas sem token retornam `401`;
- rotas com token retornam `200`;
- JSON valido;
- sem erro de schema;
- sem indicio basico de cross-tenant.

`NO-GO` significa um dos seguintes:

- secrets ausentes para a etapa autenticada;
- fixture ainda nao semeada;
- login falha;
- status HTTP inesperado;
- body nao-JSON;
- shape estrutural quebrado;
- incoerencia basica de tenant.

## Frontend staging

Nao executar deploy de frontend nesta fase.

Estado atual:

- existe worker frontend staging em [worker-frontend/wrangler.toml](<AIRTRUST_ROOT>/worker-frontend/wrangler.toml:1);
- o frontend reconhece `main.airtrust.pages.dev` e roteia para a API de staging em [src/react-app/config/api.ts](<AIRTRUST_ROOT>/src/react-app/config/api.ts:33);
- o workflow atual de Pages continua production-only em [.github/workflows/deploy-airtrust.yml](<AIRTRUST_ROOT>/.github/workflows/deploy-airtrust.yml:285).

Diretriz:

- nao usar o workflow atual de Pages para staging;
- abrir PR separado no futuro para um `deploy-frontend-staging.yml` ou fluxo equivalente com projeto/branch de staging explicitos.

## Relacao com PR #226

O PR #226 reconstruiu o staging D1 e apontou `env.staging` para o novo banco. Este documento adiciona a camada operacional que faltava:

- fixture fake minima;
- secrets de login em runtime;
- smoke autenticado repetivel;
- abandono definitivo do token manual.

## Seguranca do seed — Guards de protecao

O script `scripts/seed-staging-smoke-user.mjs` possui as seguintes protecoes:

### 1. D1 alvo bloqueado por allowlist

- **Unico D1 permitido**: `airtrust-db-staging-baseline-20260701`
- **Bloqueados explicitamente**: `airtrust-db`, `airtrust-db-staging`, `airtrust-db-prod`, e qualquer nome contendo `production` ou `prod`.
- A validacao ocorre **antes de qualquer outra operacao**, inclusive em dry-run.

### 2. Confirmacao explicita exigida para `--apply`

- `--apply` requer `--confirm-staging-baseline` ou `CONFIRM_STAGING_D1=airtrust-db-staging-baseline-20260701`.
- Sem confirmacao: dry-run funciona, `--apply` falha fechado.

### 3. Empresa soft-deletada — politica de reativacao

- O codigo da fixture smoke e `airtrust_smoke`, reservado exclusivamente para este fim.
- Guard em JavaScript verifica se o nome/codigo da empresa contem "smoke". Sem isso, o seed falha.
- A query SQL upsert reativa empresa soft-deletada com o mesmo codigo, mas apenas para fixture smoke.

### 4. Senha/token nunca impressos

- `STAGING_SMOKE_PASSWORD` usada apenas para gerar o hash bcrypt.
- Nenhuma mensagem de log ou erro imprime a senha em claro.
- Email mascarado em logs: `sm***@dominio`.

### 5. Testes de seguranca

Arquivo: `scripts/__tests__/staging-smoke-seed.test.mjs` (13 testes)
Cobre: D1 production/staging bloqueados; D1 desconhecido bloqueado; confirmacao explicita exigida; empresa sem "smoke" falha; senha nunca aparece em output.

## Proibicoes

- nao tocar producao;
- nao aplicar migration em producao;
- nao executar DML em producao;
- nao fazer deploy em producao;
- nao imprimir senha, token, JWT ou cookie;
- nao armazenar token em arquivo;
- nao usar `airtrust-api.airtrust.workers.dev` como producao canonica;
- nao alterar `env.production`;
- nao disparar workflow de Pages production;
- nao imprimir tokens/senhas;
- nao armazenar token em arquivo;
- nao mexer no PR #168;
- seed so pode mirar `airtrust-db-staging-baseline-20260701`;
- `--apply` exige confirmacao explicita;
- empresa soft-deletada com mesmo codigo sem "smoke" no nome e bloqueio/saneamento manual.
