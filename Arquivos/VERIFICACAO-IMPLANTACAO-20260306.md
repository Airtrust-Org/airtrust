# Verificacao de Implantacao - 2026-03-06

Verificacao pura. Nenhum codigo de produto foi alterado nesta etapa; apenas leitura de arquivos locais, consultas D1 remotas e chamadas HTTP reais.

## Resultado Geral

| Item              | Descricao                      | Arquivo/Evidencia                                                                                                                                                                                                                                                            | Status     |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------- | --- |
| P1-BUG14          | cma_valido unificado           | `worker-airtrust/src/routes/escalas-disponibilidade.ts` sem match; backend real em `worker-airtrust/src/routes/escalas.ts:565,590,618`; modal com `cma_valido` em `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx:130,1283`                      | ⚠          |
| P1-BUG15          | preview dias FOL               | `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx:460-484,1177-1215`                                                                                                                                                                               | ✓          |
| P1-BUG18          | invalidateQueries apos alocar  | `src/react-app/pages/escalas/hooks/mutations/useAdicionarTripulacao.ts` nao existe; invalidacoes reais em `src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts:637-664,821`; `staleTime: 0` em `:407,430,449,525,553,596,1080,1116`                                 | ⚠          |
| P1-BOTAO          | botao Mes Completo removido    | nenhum match em `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx`                                                                                                                                                                                 | ✓          |
| P2-MIG240         | migration domain_events        | `worker-airtrust/migrations/0240_domain_events.sql` existe                                                                                                                                                                                                                   | ✓          |
| P2-MIG242         | migration escala_alertas       | `worker-airtrust/migrations/0242_escala_alertas.sql` existe                                                                                                                                                                                                                  | ✓          |
| P2-HELPER         | getTripulanteOperacional       | `worker-airtrust/src/shared/getTripulanteOperacional.ts` existe                                                                                                                                                                                                              | ✓          |
| P2-ENDPOINT       | tripulantes-operacionais       | prompt procurou em `worker-airtrust/src/routes/escalas-disponibilidade.ts`; rota real montada por `worker-airtrust/src/routes/escalas-core.ts:43,69` para `worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts`; API prod respondeu 404 para entrada invalida     | ⚠          |
| P2-EMIT-QUAL      | qualificacoes emite events     | `worker-airtrust/src/routes/qualificacoes.ts` nao existe; emissao real em `worker-airtrust/src/routes/qualificacoes/historico.ts:18,43,59-60,72,981,1174,1270,1418,1573`                                                                                                     | ⚠          |
| P2-EMIT-FRMS      | frms emite events              | `worker-airtrust/src/routes/frms.ts:22,427,435,456,464,516,523-526`                                                                                                                                                                                                          | ✓          |
| P2-BUS            | BroadcastChannel moduloBus     | `src/react-app/lib/moduloBus.ts:48,52,55,76`                                                                                                                                                                                                                                 | ✓          |
| P3-HANDLERS       | handlers por modulo            | `worker-airtrust/src/shared/handlers/*.ts` existem (`escalasHandlers.ts`, `frmsHandlers.ts`, `hospedagemHandlers.ts`, `index.ts`, etc.)                                                                                                                                      | ✓          |
| P3-PROCESSOR      | eventProcessor                 | `worker-airtrust/src/shared/eventProcessor.ts` existe                                                                                                                                                                                                                        | ✓          |
| P3-MIDDLEWARE     | middleware universal           | `worker-airtrust/src/middleware/domainEventProcessor.ts` existe                                                                                                                                                                                                              | ✓          |
| P3-MIDDLEWARE-REG | middleware registrado          | prompt citou `main.ts`; registro real em `worker-airtrust/src/index.ts:38,180`                                                                                                                                                                                               | ⚠          |
| P3-CRON           | cron alertas diarios           | `worker-airtrust/src/cron/alertasDiarios.ts` existe                                                                                                                                                                                                                          | ✓          |
| P3-CRON-REG       | cron registrado                | `worker-airtrust/wrangler.toml:92` (`crons = [...]`) e `scheduled` implementado em `worker-airtrust/src/index.ts`                                                                                                                                                            | ✓          |
| P3-USEBUS         | useModuloBus universal         | `src/react-app/lib/useModuloBus.ts` existe                                                                                                                                                                                                                                   | ✓          |
| P3-USEBUS-REG     | useModuloBus em EscalasPage    | `src/react-app/pages/escalas/EscalasCalendarioPage.tsx` nao existe; `src/react-app/pages/escalas/EscalasPage.tsx:34,207` ainda usa `useEventosModulo`, nao `useModuloBus`                                                                                                    | ⚠          |
| P3-HEALTH         | endpoint health integracoes    | prompt citou `routes/admin*.ts`; endpoint real em `worker-airtrust/src/index.ts:845`; API prod 200                                                                                                                                                                           | ⚠          |
| P4-C01-MIG        | migration unique aeronave      | `worker-airtrust/migrations/0243_unique_tripulacao_aeronave.sql` nao existe; em producao nao ha indice unico correspondente e ainda existem duplicidades                                                                                                                     | ✗          |
| P4-C01-BACK       | validacao 409 no backend       | prompt citou `worker-airtrust/src/routes/escalas.ts`; guarda real em `worker-airtrust/src/routes/escalas-tripulacoes.ts:83-91,489-497`; API prod retorna 409 com payload real (`aeronave`), mas o payload do prompt (`aeronave_id`) retornou 201                             | ⚠          |
| P4-C01-FRONT      | botao desabilitado no front    | nenhum match para `aeronaveJaAlocada                                                                                                                                                                                                                                         | podeAlocar | JA_ALOCADA`em`src/react-app/pages/escalas/\*\*` | ✗   |
| P4-C03-BACK       | DELETE tripulacao              | rota real em `worker-airtrust/src/routes/escalas-tripulacoes.ts:363-397`; producao retornou 200 para ID inexistente, nao 404                                                                                                                                                 | ⚠          |
| P4-C03-FRONT      | botao Trash no front           | `src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx:937-951` mostra acao `Remover tripulacao` com `Trash2`                                                                                                                                               | ✓          |
| P4-C06            | modal max-h scroll             | `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx:1278` (`max-h-[430px] overflow-y-auto`) e `src/components/ui/Modal.tsx` foi endurecido anteriormente                                                                                             | ✓          |
| P4-C07            | padrao 15x15 default           | `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx:338-339`                                                                                                                                                                                         | ✓          |
| P4-C08-MIG        | migration usuario_preferencias | `worker-airtrust/migrations/0244_usuario_preferencias.sql` nao existe; tabela existe em producao e codigo real usa `0245` + autocriacao em runtime                                                                                                                           | ⚠          |
| P4-C08-ROUTE      | route preferencias             | `worker-airtrust/src/routes/preferencias.ts` nao existe; rota real em `worker-airtrust/src/routes/escalas-preferencias.ts`, montada por `worker-airtrust/src/routes/escalas-core.ts:45,71`; `/api/preferencias` em prod retorna 404, `/api/escalas/preferencias` retorna 200 | ⚠          |
| P4-C08-FRONT      | botao salvar config            | prompt citou `src/react-app/pages/escalas/pages/ConfiguracaoEscalaPage.tsx` (inexistente); fluxo real em `src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx:974-995` salva via `salvarExibirNome`, mas sem botao explicito `Salvar Preferencias`                        | ⚠          |
| P4-C09-BACK       | PUT evento                     | prompt citou `worker-airtrust/src/routes/escalas.ts`; rota real em `worker-airtrust/src/routes/escalas-eventos.ts:111-112`; prod retornou 400 com payload invalido, nao 405                                                                                                  | ⚠          |
| P4-C09-HOOK       | useEditarEvento hook           | `src/react-app/pages/escalas/hooks/mutations/useEditarEvento.ts` nao existe; atualizacao real em `src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts:795,836` e consumo em `src/react-app/pages/escalas/components/EscalaCalendario/CelulaEvento.tsx:45,85`        | ⚠          |
| P4-C10-MIG        | migration tipos_evento_config  | `worker-airtrust/migrations/0245_escala_tipos_evento_config.sql` nao existe; migration real e `worker-airtrust/migrations/0230_escalas_tipos_evento_config.sql`; tabela/API existem em prod                                                                                  | ⚠          |
| P4-C11            | botao duplicado removido       | busca literal por `Alocar Tripulante` retornou 3 ocorrencias em `EscalasPage.tsx:888,897` e `GradeGantt.tsx:772`; so uma e CTA acionavel, duas sao textos instrutivos                                                                                                        | ⚠          |

## Banco de Producao

| Tabela/Index                            | Existe? | Linhas corrompidas?                                                                                                                                           |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| domain_events                           | ✓       | N/A                                                                                                                                                           |
| escala_alertas                          | ✓       | N/A                                                                                                                                                           |
| usuario_preferencias                    | ✓       | N/A                                                                                                                                                           |
| escala_tipos_evento_config              | ⚠       | prompt pediu `escala_tipos_evento_config`, mas a tabela real em producao e `escalas_tipos_evento_config`                                                      |
| uniq_tripulacao_aeronave_escala (index) | ✗       | nao existe indice unico correspondente; indices reais: `idx_escala_tripulacoes_escala`, `idx_escala_tripulacoes_pic`, `sqlite_autoindex_escala_tripulacoes_1` |
| aeronaves sem modelo_id                 | ⚠       | query literal falhou (`no such column: modelo_id`); no schema real, consulta por `modelo` vazio retornou 0 linhas                                             |
| tripulacoes duplicadas por aeronave     | ✗       | 2 grupos em producao: `03f1ca12-15fe-4bff-ac52-987baf8a2dea / PS-CDV AW139 / 2` e `9ad63f4d-940f-463b-a077-8c9553a4bd97 / PR-BGE SK76 / 2`                    |
| pilotos sem habilitacao                 | ⚠       | query literal falhou (`no such table: funcionario_habilitacoes`); schema real usa `funcionarios_aeronaves`                                                    |

### Evidencia D1 literal do prompt

- `SELECT name FROM sqlite_master ... ('domain_events','escala_alertas','usuario_preferencias','escala_tipos_evento_config')` retornou 3 tabelas: `domain_events`, `escala_alertas`, `usuario_preferencias`.
- `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%uniq%tripulac%aeronave%';` retornou vazio.
- `SELECT escala_id, aeronave_id ...` falhou com `no such column: aeronave_id`.
- `SELECT prefixo, id FROM aeronaves WHERE modelo_id IS NULL ...` falhou com `no such column: modelo_id`.
- `SELECT ... FROM funcionario_habilitacoes ...` falhou com `no such table: funcionario_habilitacoes`.
- `SELECT tipo, COUNT(*), MAX(created_at) ... FROM domain_events ...` retornou eventos nas ultimas 24h, inclusive `FUNCIONARIO_ATUALIZADO`, `DOCUMENTO_ENVIADO`, `DOCUMENTO_EXCLUIDO`, `TRIPULANTE_REMOVIDO`, `TRIPULANTE_ALOCADO`.
- `SELECT chave, valor, updated_at FROM usuario_preferencias ...` retornou `escala.exibir_nome = completo` atualizado em `2026-03-06T16:06:35.805Z`.

## API em Producao

| Endpoint                                  | HTTP esperado | HTTP real                                                     | Status |
| ----------------------------------------- | ------------- | ------------------------------------------------------------- | ------ |
| GET /api/escalas/tripulantes-operacionais | 400           | 404                                                           | ⚠      |
| GET /api/admin/integracoes/health         | 200           | 200                                                           | ✓      |
| GET /api/preferencias                     | 200           | 404                                                           | ✗      |
| PUT /api/preferencias                     | 200           | 404                                                           | ✗      |
| DELETE /api/escalas/:id/tripulacoes/:tid  | 404           | 200                                                           | ⚠      |
| PUT /api/escalas/:id/eventos/:eid         | 404           | 400                                                           | ⚠      |
| POST duplicado mesma aeronave             | 409           | 201 com payload do prompt / 409 com payload real (`aeronave`) | ⚠      |
| GET /api/escalas/tipos-evento-config      | 200           | 200                                                           | ✓      |

### Evidencia HTTP adicional

- `GET /api/escalas/preferencias` retornou `200`.
- `PUT /api/escalas/preferencias/exibir-nome` retornou `200`.

## Itens Nao Implementados (✗)

- P4-C01-MIG: nao existe a migration `0243_unique_tripulacao_aeronave.sql`, nao existe indice unico correspondente em producao e ainda ha duplicidades reais em `escala_tripulacoes`.
- P4-C01-FRONT: nao encontrei validacao de duplicidade de aeronave no frontend (`aeronaveJaAlocada|podeAlocar|JA_ALOCADA`).
- API: `GET /api/preferencias` retorna 404.
- API: `PUT /api/preferencias` retorna 404.

## Itens Parciais (⚠)

- P1-BUG14: `cma_valido` existe, mas nao no arquivo citado pelo prompt (`escalas-disponibilidade.ts`); o backend atual usa `escalas.ts`.
- P1-BUG18: a logica existe, mas consolidada em `useEscalasQuery.ts`, nao nos arquivos `useAdicionarTripulacao.ts` / `useEscalaQuery.ts` pedidos pelo prompt.
- P2-ENDPOINT: a rota existe e esta deployada, mas foi implementada em modulo proprio (`escalas-tripulantes-operacionais.ts`) e nao em `escalas-disponibilidade.ts`.
- P2-EMIT-QUAL: a emissao existe em `qualificacoes/historico.ts`, nao em `routes/qualificacoes.ts`.
- P3-MIDDLEWARE-REG: middleware registrado em `src/index.ts`, nao em `main.ts`.
- P3-USEBUS-REG: `useModuloBus` existe, mas `EscalasPage` segue usando `useEventosModulo`.
- P3-HEALTH: endpoint existe, mas esta em `src/index.ts`, nao em `routes/admin*.ts`.
- P4-C01-BACK: o backend bloqueia duplicidade com payload atual (`aeronave`), mas o payload literal do prompt (`aeronave_id`) nao prova isso.
- P4-C03-BACK: DELETE existe, mas producao respondeu 200 para ID inexistente em vez de 404.
- P4-C08-MIG: tabela/funcionalidade existem, mas o arquivo de migration pedido nao; a implementacao real usa `0245` e autocriacao em runtime.
- P4-C08-ROUTE: a rota real esta sob `/api/escalas/preferencias`, nao `/api/preferencias`.
- P4-C08-FRONT: persistencia existe, mas nao ha botao explicito `Salvar Preferencias` no caminho citado pelo prompt.
- P4-C09-BACK: PUT evento existe, mas no modulo `escalas-eventos.ts` e com resposta `400` para payload invalido.
- P4-C09-HOOK: nao existe `useEditarEvento.ts`; a atualizacao esta incorporada em `useEscalaMutations`/`useEscalasQuery.ts`.
- P4-C10-MIG: a tabela/config existe, mas a migration real e `0230_escalas_tipos_evento_config.sql`, nao `0245_escala_tipos_evento_config.sql`.
- P4-C11: a contagem literal do texto `Alocar Tripulante` ainda da 3, embora so um CTA acionavel tenha sido encontrado.
- Banco: varias queries literais do prompt usam schema antigo (`aeronave_id`, `modelo_id`, `funcionario_habilitacoes`) e falham no D1 atual.

## Decisao Final

- [ ] TUDO IMPLANTADO - sistema pode ir para uso
- [x] PARCIALMENTE IMPLANTADO - 4 itens com ✗ e varios itens com ⚠ (schema/payload/path divergentes do prompt)
- [ ] NAO IMPLANTADO - requer sprint de implementacao

### Conclusao objetiva

O estado real nao sustenta um "tudo implantado". Ha funcionalidades efetivamente deployadas e operacionais (integracoes health, tipos de evento, preferencias sob `/api/escalas/preferencias`, eventos de dominio recentes, guarda de duplicidade no backend com payload atual), mas o prompt dos ultimos 4 blocos nao bate 1:1 com o codigo/schema/contrato publicados. O principal bloqueio concreto e de producao continua sendo integridade de tripulacoes por aeronave: ainda ha duplicidades reais no banco e nao ha indice unico correspondente em D1.
