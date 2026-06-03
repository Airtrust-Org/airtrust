# AirTrust - Remaining Audit Findings Closure Plan v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `8ca0bcd326570a105fb64a25ada942c5de668f76`
**Modo:** Sprint consolidada de fechamento documental dos achados remanescentes. Sem migration remota, sem schema remoto, sem deploy, sem alteracao de dados reais.

## 1. Resumo executivo

O AirTrust entrou numa fase em que os achados remanescentes ja nao sao de correcao rapida de codigo em producao. O que resta se divide em tres grupos:

1. governanca e rollout controlado (`Audit v2`, `RBAC/Suporte v2`, `Data Quality`, smoke com empresa esperada);
2. DDL residual com dependencias estruturais (`R01`, `R04`, `R09`);
3. cobertura e higiene de engenharia (EVD/beta, status residual, observabilidade, R2 metadata).

Nesta sprint consolidada, a decisao correta foi **nao executar nenhuma correcao de runtime ou migration**. O estado atual real pede documentacao mais precisa e uma ordem unica de fechamento, nao mais microfases paralelas.

## 2. O que ja foi fechado

| Achado | Status | Evidencia |
|---|---|---|
| `R03` - link de treinamentos planejados | RESOLVED | `0386` aplicada em producao, fallback removido, Worker/API deployado |
| `0385` - `audit_events_v2` schema | APPLIED_SCHEMA_READY_FOR_FLAG_PLAN | migration aplicada em producao; writer/flag seguem controlados |
| Version reporting | RESOLVED | `d65fc9e fix(observability): align health and version reporting` |
| Scripts D1 legados | RESOLVED | wrapper/allowlist/guards ativos; `ops:guard` PASS |
| Module gating baseline | RESOLVED/PARTIAL | contratos minimos e guards principais ativos |

## 3. O que ainda falta

| Achado | Status | Bloqueio | Proxima acao | Modelo recomendado |
|---|---|---|---|---|
| `R01` - SIGVOOS runtime DDL | MIGRATION_CHAIN_BLOCKED_BY_0354 | `0354` depende de `integracoes_sigvoos_config` antes da `0387` numa cadeia limpa | definir baseline/chain plan antes de qualquer apply/remocao | GPT-5.5 Altissimo |
| `R04` - Documentos bootstrap DDL | DESIGN_READY | nao existe migration canonica unica para `documentos` | extrair schema alvo e planejar `0388_documentos_canonical_schema.sql` | GPT-5.5 Alta |
| `R09` - `qualificacoes/shared.ts` dynamic DDL | OPEN_VERIFICATION_REQUIRED | helper ainda faz `ALTER TABLE` dinamico em runtime | provar cobertura de migrations e so entao remover | GPT-5.4 Alta |
| Audit v2 | READY_FOR_STAGING_FLAG_TEST | schema aplicado, mas flag/paridade ainda nao validadas em staging aprovado | executar staging flag test + rollback por flag | GPT-5.5 Altissimo |
| RBAC/Suporte v2 | IMPLEMENTATION_READY | depende do foundation audit-first e de migration de papeis | implementar schema + dual-read depois do Audit v2 | GPT-5.5 Altissimo |
| Data Quality | PARTIAL/OPEN | checks ainda ficaram `SKIPPED` em snapshot incompleto | executar em staging/schema completo | GPT-5.4 Alta |
| Smoke com empresa esperada | PARTIAL | env vars nao configuradas | configurar `AIRTRUST_EXPECTED_EMPRESA_ID` ou `CODIGO` e reexecutar | GPT-5.4 Baixa |

## 4. R01 - SIGVOOS

Estado real:
- `0387_integracoes_sigvoos_base_tables.sql` existe e cobre as 3 tabelas base + 4 indices.
- `0354_auditoria_critica_schema_hardening.sql` ainda faz `ALTER TABLE integracoes_sigvoos_config`.
- o teste local da Sprint Z1.1 provou que uma cadeia limpa falha na `0354` antes da `0387`.

Conclusao:
- nao e seguro aplicar/remover fallback apenas com `0387`;
- nao e seguro reescrever `0354` cegamente, porque ela ja faz parte da historia aplicada;
- a proxima acao correta e um **baseline/chain plan** para ambientes novos, nao uma migration remota imediata.

## 5. R04 - Documentos

Estado real:
- `runApiBootstrap()` continua chamando `ensureDocumentosTableExists()`;
- o helper cria `documentos` e 5 indices no startup;
- as migrations historicas (`0136`, `0137`, `0138`, `0165`) nao equivalem a um schema canonico unico.

Conclusao:
- `R04` continua aberto, mas nao deve ser atacado nesta sprint sem extracao segura do schema alvo;
- a proxima acao correta e definir o schema canonico final e preparar a `0388`.

## 6. R09 - Qualificacoes shared.ts

Estado real:
- `worker-airtrust/src/routes/qualificacoes/shared.ts` ainda executa `ensureHistoricoSchema()`;
- o helper tenta adicionar `renovada`, `local` e `modalidade`;
- as migrations historicas mostram que essas colunas aparecem em varios pontos da cadeia (`0032`, `0075`, `0097`, `0107`, `0113`, `0139`, `0176`, `0200`, `0325`), mas a historia nao e linear o suficiente para remover o helper sem prova dedicada.

Conclusao:
- `R09` nao esta pronto para ser marcado como resolvido;
- tambem nao exige GPT-5.5 por padrao nesta fase;
- a proxima acao correta e uma sprint curta de verificacao/readiness e, se a prova fechar, remocao local com teste.

## 7. Audit v2

Estado real:
- schema `audit_events_v2` aplicado em producao via `0385`;
- writer canonico versionado;
- dual-write continua atras de flag;
- readiness local concluida;
- falta apenas validacao controlada em staging/paridade operacional antes de ampliar cobertura.

Conclusao:
- o pendente principal nao e mais schema;
- o pendente principal e **ativacao controlada**.

## 8. RBAC/Suporte v2

Estado real:
- design, readiness gate, phased plan, rollback e matriz de testes estao prontos;
- runtime ainda usa fallback legado de plataforma;
- implementacao depende da ordem `audit-first`.

Conclusao:
- nao ha trabalho seguro de runtime para esta sprint;
- o proximo passo correto continua sendo a foundation depois do Audit v2 staging flag test.

## 9. Data Quality

Estado real:
- runner existe;
- SQL ja foi validado;
- faltam checks completos em ambiente com schema/snapshot aprovados;
- o smoke autenticado ainda nao fechou empresa esperada por falta de env var.

Conclusao:
- este e o grupo de pendencias mais adequado para DeepSeek/GPT-5.4;
- tambem e o grupo mais barato de fechar antes de mexer novamente em schema/governanca.

## 10. Ordem final recomendada

1. Fechar `Smoke + Data Quality` em ambiente aprovado.
2. Executar `Audit v2 Staging Flag Test` com schema ja aplicado e rollback por flag.
3. Implementar `RBAC/Suporte v2 Foundation` somente depois da paridade minima do Audit v2.
4. Executar `R09 Readiness/Verification Sprint` e remover o helper se a prova fechar.
5. Planejar `R04 Documentos Canonical Schema` (`0388`) com schema alvo validado.
6. Planejar `R01 SIGVOOS Baseline/Chain` antes de qualquer apply/remocao do fallback.
7. Expandir `EVD/Beta`, `status residual`, `observabilidade` e `R2 metadata`.

## 11. O que pode ser feito com 5.4/DeepSeek

- Smoke autenticado com empresa esperada.
- Data Quality completo em staging/snapshot aprovado.
- Sprint curta de verificacao do `R09`.
- Cobertura de testes beta/EVD.
- Expansao de `status-codes`.
- Auditorias de performance, observabilidade e repository pattern read-only.

## 12. O que realmente exige 5.5

- Audit v2 staging flag test/paridade controlada.
- RBAC/Suporte v2 com migration de papeis e dual-read.
- `R04` se envolver definicao/aplicacao de schema canonico de `documentos`.
- `R01` enquanto depender de baseline, cadeia historica e possivel estrategia de rebuild para ambientes novos.

## 13. Criterio de encerramento das auditorias

As auditorias remanescentes so podem ser consideradas encerradas quando:

1. Audit v2 tiver schema aplicado, flag validada e rollout/paridade aprovados.
2. RBAC/Suporte v2 estiver persistido, auditavel e sem dependencia do fallback legado.
3. Data Quality estiver sem `SKIPPED` relevantes em ambiente aprovado.
4. `R01`, `R04` e `R09` nao dependerem mais de DDL runtime.
5. Smoke autenticado com empresa esperada estiver documentado como `PASS`.
