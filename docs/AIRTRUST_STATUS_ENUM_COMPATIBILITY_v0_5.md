# AirTrust Status Enum Compatibility v0.5

Data: 2026-06-02
Branch auditada: `main`
HEAD auditado: `300ecb9b036d153c0da5fa654e7083f09fee412b`
Modo: compatibilidade sem migration, sem alteracao de dados reais e sem deploy.

## 1. Objetivo

Centralizar os status operacionais criticos usados por dashboard, simuladores, qualificacoes e treinamentos planejados para reduzir contagem errada, divergencia de filtro e regressao silenciosa.

## 2. Status canonicos

- Sessoes de simulador:
  - `AGENDADO`
  - `PENDENTE`
  - `CONCLUIDA`
  - `CANCELADA`
- Qualificacoes:
  - `PLANEJADA`
  - `CONCLUIDA`
  - `CANCELADA`
  - `RENOVADA`
  - `VALIDA`
  - `VENCIDA`

## 3. Status legados aceitos

- Sessoes:
  - `AGENDADA`
  - `PENDING`
  - `CONCLUIDO`
  - `CANCELADO`
- Qualificacoes:
  - `PLANEJADO`
  - `CONCLUIDO`
  - `CANCELADO`

## 4. Regras de leitura

- Leitura de metricas e filtros aceita variantes canonicas e legadas onde havia risco operacional.
- Dashboard passa a contar:
  - concluidas: `CONCLUIDA` + `CONCLUIDO`
  - demanda futura: `AGENDADO` + `AGENDADA` + `PENDENTE` + `PENDING`
  - utilizacao: `AGENDADO` + `AGENDADA` + `CONCLUIDA` + `CONCLUIDO`
- Qualificacoes planejadas passam a aceitar `PLANEJADA` e `PLANEJADO`.
- Cancelamentos passam a aceitar `CANCELADA` e `CANCELADO`.

## 5. Regras de escrita nova

- Escritas novas permanecem canonicas:
  - sessao concluida -> `CONCLUIDA`
  - qualificacao planejada -> `PLANEJADA`
  - qualificacao concluida -> `CONCLUIDA`
  - qualificacao cancelada -> `CANCELADA`
- Inputs legados aceitos por compatibilidade sao normalizados para o canonico apenas no momento da nova escrita.
- Nao houve conversao em massa de registros existentes.

## 6. Impacto em dashboard

- Queries centrais de taxa de conclusao, demanda futura, atividades recentes e utilizacao passaram a referenciar uma camada unica de status.
- O risco de contar apenas `CONCLUIDA` ou apenas `PENDENTE` em novas metricas diminui porque os conjuntos agora vivem em `worker-airtrust/src/lib/status/status-codes.ts`.

## 7. Impacto em simuladores

- Sincronizacao de qualificacoes concluidas por sessao aceita `PLANEJADA` e `PLANEJADO`.
- Recriacao de qualificacao planejada ignora `CANCELADA` e `CANCELADO` como registros ativos.
- Transicao de sessao concluida detecta tanto `CONCLUIDA` quanto `CONCLUIDO` para evitar perda de sincronizacao.

## 8. Impacto em qualificacoes

- Escrita manual de historico aceita variantes legadas de planejada/concluida e grava o canonico.
- Filtros de historico passam a reconhecer cancelada planejada em variantes legadas sem depender apenas de `deleted_at`.
- Upsert vindo de ficha evita regravar registro apenas por diferenca entre variante canonica e legado.

## 9. O que nao foi alterado

- Nao houve migration.
- Nao houve alteracao de schema.
- Nao houve atualizacao manual de banco real.
- Nao houve normalizacao retroativa de todos os status historicos.
- Nao houve refatoracao ampla do frontend.

## 10. Migracao futura opcional

- Sprint futura pode converter registros legados remanescentes para o canonico depois de auditoria e plano de rollback.
- Essa migracao so faz sentido depois que todas as leituras criticas estiverem protegidas por helpers centrais.

## 11. Como adicionar novo status

- Adicionar o codigo canonico em `worker-airtrust/src/lib/status/status-codes.ts`.
- Declarar explicitamente se o novo status entra em leitura de:
  - concluidas
  - agendadas
  - planejadas
  - canceladas
- Atualizar helpers e testes antes de usar o status em SQL ou filtros.

## 12. Testes obrigatorios

- `worker-airtrust/src/__tests__/status/status-codes.test.ts`
- `worker-airtrust/src/__tests__/services/dashboard-status-compatibility.test.ts`
- `worker-airtrust/src/__tests__/routes/simuladores-status-compatibility.test.ts`
- Suites existentes mantidas verdes para dashboard, simuladores, qualificacoes historico e treinamentos planejados.
