# SIGVOOS PREVIEW FLAGS ACTIVATION REPORT

Data/hora UTC: 2026-06-16T02:27Z

## Veredito

`PREVIEW SIGVOOS COM RESSALVAS`

O preview SIGVOOS foi ativado em producao com as duas flags explicitamente ligadas. O Worker foi publicado com a flag backend ativa e o Pages foi publicado com a flag frontend ativa. O sync real SIGVOOS permaneceu desligado: nao houve chamada a API real SIGVOOS, nao houve uso de credenciais SIGVOOS, nao houve importacao de payload, nao houve escrita SIGVOOS e nao houve alteracao em FRMS.

A ressalva e operacional: a validacao autenticada real com usuario Admin/Gestor e usuario comum nao foi executada por terminal, para evitar login em producao e possivel escrita colateral de sessao/auditoria. A cobertura do comportamento autenticado ficou nos testes locais direcionados e na verificacao de producao sem autenticacao.

## Flags ativadas

| Flag | Estado | Metodo |
|---|---:|---|
| `CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED` | `true` | TOML temporario no deploy do Worker |
| `VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED` | `true` | variavel de build no deploy Pages |

## Metodo de ativacao

### Worker

O Worker foi publicado a partir de `main`, com `HEAD == origin/main`, usando um TOML temporario derivado de `worker-airtrust/wrangler.toml`. O arquivo rastreado nao foi alterado.

Comando efetivo:

```bash
cd worker-airtrust
npx wrangler deploy --env production --config <tmp> --keep-vars
```

O TOML temporario injetou:

```toml
APP_VERSION = "2026-06-16T02:25:06Z-751c32f6"
APP_BUILD_TIME = "2026-06-16T02:25:06Z"
CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED = "true"
```

Resultado:

| Campo | Valor |
|---|---|
| Worker | `airtrust-api-production` |
| Worker Version ID | `9475e67a-13a9-4907-82ab-fb9e55801e56` |
| API version | `2026-06-16T02:25:06Z-751c32f6` |
| Commit implantado | `751c32f626b9d8a19e4167432e56b92ce4d5e6b8` |

O comando de deploy do Worker nao executou `wrangler d1 migrations apply`, nao executou `wrangler d1 execute`, nao usou credenciais SIGVOOS e nao chamou API SIGVOOS.

### Pages

O Pages foi publicado com a flag Vite ativa:

```bash
VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED=true npm run deploy:pages
```

O preflight confirmou:

| Campo | Valor |
|---|---|
| Branch | `main` |
| HEAD | `751c32f626b9d8a19e4167432e56b92ce4d5e6b8` |
| origin/main | `751c32f626b9d8a19e4167432e56b92ce4d5e6b8` |
| Working tree/stage | limpos |

Resultado:

| Campo | Valor |
|---|---|
| Pages deploy URL | `https://a88d3632.airtrust.pages.dev` |
| Dominio verificado | `https://airtrust.online/` |
| Asset principal | `assets/index-CZ9RnPH-.js` |

O bundle publicado no dominio final contem o endpoint `/controle-voos/sigvoos/sync-preview`, mensagens de preview e a flag frontend compilada como ativa (`const n="true"` no helper do preview).

## Validacoes pre-ativacao

| Validacao | Resultado |
|---|---|
| `npx tsc --noEmit --pretty false` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| `bash scripts/check-tracked-secrets.sh` | PASS |
| `bash scripts/validation/audit-deploy-scripts.sh` | PASS |
| `bash scripts/audit-dangerous-ops.sh` | PASS com warning inventarial pre-existente |
| `cd worker-airtrust && npx vitest run src/__tests__/routes/controle-voos.test.ts` | PASS, 40/40 |
| `npx vitest run src/react-app/components/__tests__/AppLayout.hard-refresh.test.tsx` | PASS, 2/2 |

## Auditoria de codigo

Confirmado antes da ativacao:

- `.github/workflows/deploy.yml` manteve `apply_production_migrations=false` fora da execucao desta etapa.
- `deploy-worker-safe` continua sem `migrations apply`, sem `wrangler d1`, sem seed, sem deduplicate e sem sync.
- `worker-airtrust/src/routes/controle-voos.ts`:
  - rota `POST /sigvoos/sync-preview` usa `auth()`;
  - exige permissao `manager`;
  - usa `empresaId` da sessao;
  - rejeita `empresaId`, `empresa_id`, `tenantId` e `tenant_id` no body;
  - retorna apenas status, flags de seguranca e contagens;
  - executa apenas `SELECT COUNT(*)` e `SELECT MAX(...)` no bloco do preview;
  - nao importa FRMS;
  - nao importa `frms-source-policy.ts`;
  - nao chama `fetch`;
  - nao usa cliente SIGVOOS.
- `src/react-app/components/AppLayout.tsx`:
  - chama preview somente com flag frontend ativa;
  - exige empresa atual;
  - exige Admin ou Gestor;
  - exige modulo `controle_voos`;
  - chama `hardRefreshApp()` depois da tentativa de preview.

## Validacoes pos-ativacao

### API e versao

| Endpoint | Resultado |
|---|---|
| `GET https://api.airtrust.online/api/health` | `success=true`, database `ok`, storage `ok`, version `2026-06-16T02:25:06Z-751c32f6` |
| `GET https://api.airtrust.online/api/version` | `version=2026-06-16T02:25:06Z-751c32f6`, `environment=production`, `builtAt=2026-06-16T02:25:06Z` |

### Endpoint preview

| Cenario | Resultado |
|---|---|
| Sem autenticacao | HTTP `401`, `MISSING_TOKEN` |
| Usuario comum | Coberto por teste local: HTTP `403`, `CONTROLE_VOOS_SIGVOOS_RBAC_FORBIDDEN` |
| Admin/Gestor | Coberto por teste local: HTTP `200`, `enabled=true`, `writesEnabled=false`, `realApiCalled=false`, contagens tenant-scoped |
| Body com `empresaId`/tenant arbitrario | Coberto por teste local: HTTP `400`, `CONTROLE_VOOS_SIGVOOS_TENANT_OVERRIDE_FORBIDDEN` |

### Botao `Atualizar app`

O bundle publicado no dominio `https://airtrust.online/` contem:

- flag frontend ativa no helper de preview;
- chamada a `/controle-voos/sigvoos/sync-preview`;
- condicoes Admin/Gestor, empresa atual e modulo `controle_voos`;
- chamada subsequente a `hardRefreshApp()`;
- mensagem segura em caso de falha: `Falha na prévia SIGVOOS; o app será atualizado sem sincronização.`

### Banco de dados

Foram executadas apenas consultas read-only `SELECT COUNT(*)` para comparar baseline e pos-ativacao. Todas retornaram `rows_written=0` e `changed_db=false`.

| Tabela | Antes | Depois | Resultado |
|---|---:|---:|---|
| `cv_sigvoos_staging` | 0 | 0 | inalterada |
| `cv_voos` | 0 | 0 | inalterada |
| `cv_voo_etapas` | 0 | 0 | inalterada |
| `cv_conflitos_integracao` | 0 | 0 | inalterada |
| `frms_jornada` | 978 | 978 | inalterada |
| `frms_alerta` | 74 | 74 | inalterada |

## Confirmacoes negativas

- API real SIGVOOS chamada: `NAO`.
- Credenciais SIGVOOS usadas: `NAO`.
- Sync real SIGVOOS executado: `NAO`.
- Payload SIGVOOS real inserido: `NAO`.
- Escrita SIGVOOS executada: `NAO`.
- Migration aplicada: `NAO`.
- `wrangler d1 migrations apply` executado: `NAO`.
- Migration `0410` reexecutada: `NAO`.
- Migration `0411` reexecutada: `NAO`.
- DDL/DML de producao executado por comando operacional: `NAO`.
- FRMS alterado: `NAO`.
- `frms-source-policy.ts` alterado: `NAO`.
- Emails enviados: `NAO`.
- RBAC backend/multi-tenant real alterado: `NAO`.
- Dados reais importados: `NAO`.

## Riscos restantes

- A validacao autenticada real de UI com Admin/Gestor e usuario comum ficou pendente para uma sessao manual ja autenticada, sem login automatizado por terminal.
- O preview agora esta ativo para usuarios Admin/Gestor com modulo `controle_voos`; se qualquer regressao operacional aparecer, o rollback e redeployar Worker sem `CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED=true` e Pages sem `VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED=true`.

## Proxima recomendacao

Executar uma validacao manual assistida no navegador com sessao Admin/Gestor ja existente: abrir `https://airtrust.online/controle-voos`, clicar `Atualizar app`, confirmar chamada preview + toast de contagens e hard refresh subsequente. Em seguida, repetir com usuario comum para confirmar ausencia de chamada preview ou bloqueio `403`.
