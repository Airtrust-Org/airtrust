# AIRTRUST SIMULADORES OPTIONAL AUTH TENANT SCOPE CLOSURE v0.5

Data: 2026-06-04
Branch: `main`
HEAD base auditado: `66072b1`

## Objetivo

Fechar o risco residual deixado após `SEC-02`, validando todos os usos de `optionalAuth()` no fluxo de simuladores e separando:

- catálogo global legítimo;
- dado operacional tenant-scoped que precisa de `auth()` e filtro de `empresa_id`.

## Problema confirmado

O estado anterior ainda mantinha três módulos de simuladores com leitura `GET` sob `optionalAuth()`:

- `simuladores-relatorios.ts`
- `simuladores-equipamentos.ts`
- `simuladores-modelos.ts`

Esses módulos consultavam tabelas com `empresa_id` ou dados operacionais ligados a funcionários/agendamentos/modelos por empresa. Isso permitia leitura sem token ou sem escopo tenant explícito para dados de operação, frota, treinamento e relatório.

## Matriz de mapeamento

| Arquivo | Endpoint | Tabelas | Tem `empresa_id` | Estado final | Classificação |
| --- | --- | --- | --- | --- | --- |
| `simuladores-catalogo.ts` | `GET /categorias`, `GET /manobras` | `manobras_categorias`, `manobras` | não | `optionalAuth()` preservado | `GLOBAL_REFERENCE_ALLOWED` |
| `simuladores-modelos.ts` | `GET/POST/PUT/DELETE /tipos-sessao*`, `GET/POST/PUT/DELETE /modelos-sessao*` | `tipos_sessao`, `modelos_sessao`, `qualificacoes_tipos`, `modelos_sessao_checks` | sim | migrado para `auth()` + filtros tenant | `TENANT_SCOPED_REQUIRES_AUTH` |
| `simuladores-relatorios.ts` | `GET /uso`, `GET /tripulantes`, `GET /desempenho` | `simuladores`, `simulador_agendamentos`, `fichas_sessao`, `funcionarios` | sim | migrado para `auth()` + filtros tenant | `TENANT_SCOPED_REQUIRES_AUTH` |
| `simuladores-equipamentos.ts` | `GET /alertas`, `GET /tipos-check`, `GET /`, `GET /:id`, mutações por ID | `simuladores`, `qualificacoes_tipos`, `alertas_reforco`, `funcionarios` | sim ou vínculo indireto | migrado para `auth()` + filtros tenant | `TENANT_SCOPED_REQUIRES_AUTH` |
| `simuladores-equipamentos.ts` | `GET /health` | sem leitura tenant | não aplicável | público, sem dado operacional | `GLOBAL_REFERENCE_ALLOWED` |
| `simuladores-fichas.ts` | rota inteira | já usava `auth()` | sim | sem mudança comportamental; import morto removido | já protegido |
| `simuladores-sessoes.ts` | rota inteira | já usava `auth()` | sim | sem mudança comportamental; import morto removido | já protegido |

## Tabelas globais confirmadas

As únicas tabelas de simuladores mantidas como catálogo global nesta etapa são:

- `manobras_categorias`
- `manobras`

Elas permanecem como referência compartilhada e justificam a exceção de `optionalAuth()` em `simuladores-catalogo.ts`.

## Correções aplicadas

### 1. `simuladores-relatorios.ts`

- remoção de `optionalAuth()` runtime;
- `auth()` obrigatório para todos os endpoints;
- filtros `empresa_id = ?` em:
  - `simuladores`;
  - `simulador_agendamentos`;
  - `fichas_sessao`;
  - `funcionarios`.

Resultado esperado:

- sem auth retorna `401`;
- tenant A não recebe horas, sessões, tripulantes ou desempenho de tenant B.

### 2. `simuladores-equipamentos.ts`

- `GET /health` preservado como rota pública sem dados tenant-scoped;
- `GET /alertas`, `GET /tipos-check`, `GET /`, `GET /:id` e mutações exigem `auth()`;
- filtros `empresa_id = ?` em:
  - `simuladores`;
  - `qualificacoes_tipos`;
  - `funcionarios` usados para ancorar `alertas_reforco`;
- inserts e updates de `simuladores` passaram a respeitar `empresa_id`.

Resultado esperado:

- sem auth retorna `401` nas rotas tenant-scoped;
- listagem e detalhe de simuladores ficam isolados por empresa;
- alertas só aparecem quando ligados a funcionário da empresa autenticada.

### 3. `simuladores-modelos.ts`

- remoção de `optionalAuth()` runtime;
- `auth()` obrigatório em todos os endpoints;
- filtros `empresa_id = ?` em:
  - `tipos_sessao`;
  - `modelos_sessao`;
  - joins com `qualificacoes_tipos`;
- normalização auxiliar de `modelo_aeronave` passou a rodar só dentro da empresa autenticada;
- inserts/clones/imports de `modelos_sessao` passaram a persistir `empresa_id`;
- validação explícita para impedir vínculo de:
  - `tipo_sessao_id` de outra empresa;
  - `qualificacao_tipo_id` de outra empresa;
  - `checks_ids` fora da empresa autenticada.

Resultado esperado:

- sem auth retorna `401`;
- tenant A não enxerga tipos/modelos/checks de tenant B;
- utilitários de manutenção/importação deixam de escrever transversalmente em outros tenants.

## Testes regressivos

Arquivos alterados/criados:

- `worker-airtrust/src/__tests__/security/optional-auth-tenant-exposure.test.ts`
- `worker-airtrust/src/__tests__/routes/simuladores-optional-auth-tenant-scope.test.ts`

Cobertura adicionada:

- `401` sem auth para:
  - `GET /uso`
  - `GET /`
  - `GET /modelos-sessao`
- prova de isolamento por tenant para:
  - relatórios;
  - equipamentos;
  - modelos;
- pin da allowlist de `optionalAuth()` em simuladores reduzida para:
  - `simuladores-catalogo.ts`

## Exceções preservadas

Exceções legítimas mantidas:

- `simuladores-catalogo.ts`
  - motivo: serve apenas `manobras_categorias` e `manobras`, confirmadas como catálogo global.
- `simuladores-equipamentos.ts -> GET /health`
  - motivo: health check sem leitura de dados operacionais tenant-scoped.

## Riscos residuais

- `qualificacoes/historico.ts` ainda importa `optionalAuth`, mas não o invoca no runtime deste fluxo.
- O schema histórico ainda pode impor unicidade global em alguns códigos de simuladores; isso não reabre o vazamento sem auth, mas pode merecer revisão de produto/schema em trilha separada.

## Status final

`SIMULADORES_OPTIONAL_AUTH_SCOPE = RESOLVED`

Evidência para o status:

- nenhum endpoint tenant-scoped de simuladores permanece com `optionalAuth()` runtime;
- o catálogo global legítimo ficou explicitamente allowlisted;
- os testes estáticos e de rota cobrem `401` e isolamento por tenant;
- não houve migration nova, D1 remoto nem deploy.
