# AirTrust - Remaining Audit Findings Closure Plan v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `8ca0bcd326570a105fb64a25ada942c5de668f76`
**Modo:** Sprint consolidada de fechamento documental dos achados remanescentes. Sem migration remota, sem schema remoto, sem deploy, sem alteracao de dados reais.

> **Addendum 2026-06-04:** após o fechamento principal, a etapa ampla de cleanup/governança/superfície pública foi consolidada em `docs/AIRTRUST_REPOSITORY_CLEANUP_GOVERNANCE_PUBLIC_SURFACE_v0_5.md`. Este plano continua válido para `DQ-01`, `MIG-01`, Audit v2 e RBAC/Suporte v2.
>
> **Addendum 2026-06-04 — 0389 Controlled Schema Execution:** a `0389` foi aplicada com sucesso em `staging` sob gate, snapshot schema-only, rollback explícito e wrappers dedicados. `RBAC_SUPPORT_V2` avança para `SCHEMA_APPLIED_READY_FOR_GRADUAL_ENFORCEMENT`. `AUDIT_V2` permanece conservador em `READY_FOR_CONTROLLED_SCHEMA_MIGRATION` porque `audit_events_v2` nao existe nesse target no estado atual.
>
> **Addendum 2026-06-04 — Block 4 Controlled Closure:** a `0385_audit_events_v2.sql` foi aplicada com sucesso em `staging` sob gate específico, snapshot e rollback dedicados. O escopo controlado de enforcement foi ativado em rotas sensíveis de certificados/admin, sem deploy e sem remoção do fallback legado. Status atuais: `RBAC_SUPPORT_V2 = GRADUAL_ENFORCEMENT_ACTIVE_FOR_CONTROLLED_SCOPE` e `AUDIT_V2 = PARITY_VALIDATED_FOR_CONTROLLED_SCOPE`.
>
> **Addendum 2026-06-04 — Block 5 Product/Performance/Scale:** `VALIDATION_BASELINE = PASS` apos reconciliacao real do `npx tsc --noEmit --pretty false`. `PRODUCT_PERFORMANCE_SCALE = VALIDATED_IN_STAGING_FOR_CONTROLLED_SCOPE` com smoke publico staging read-only, diagnostico D1 staging read-only e guards/testes locais. Nao houve deploy, producao, DQ-01, MIG-01 ou migration/apply.

## 1. Resumo executivo

O AirTrust entrou numa fase em que os achados remanescentes ja nao sao de correcao rapida de codigo em producao. O que resta se divide em tres grupos:

1. governanca e rollout controlado (`Audit v2`, `RBAC/Suporte v2`, `Data Quality`, smoke com empresa esperada);
2. integridade historica de migrations (`MIG-01`), agora com readiness formal de rebaseline controlado, ainda sem execucao real;
3. DDL residual com dependencias estruturais (R01 = RESOLVED; R09 = RESOLVED; R04 = RESOLVED; stream DDL runtime encerrado para SIGVOOS/Documentos/Qualificacoes);
4. cobertura e higiene de engenharia (EVD/beta, status residual, observabilidade, R2 metadata).

Nesta sprint consolidada, a decisao correta foi **nao executar nenhuma correcao de runtime ou migration**. O estado atual real pede documentacao mais precisa e uma ordem unica de fechamento, nao mais microfases paralelas.

**Addendum OP-1:** a sprint operacional consolidada foi executada em modo read-only. Resultado: smoke autenticado na sessao atual `SKIPPED_AUTH_REQUIRED`, empresa esperada nao validada, Data Quality local `PASS=5 WARN=4 FAIL=0 SKIPPED=5`, Audit v2 reconfirmado como `READY_FOR_STAGING_FLAG_TEST`. Decisao operacional atual: `CONDITIONAL GO`.

**Addendum OP-2:** o staging operational gate foi reexecutado sem credencial efemera/read-only e sem target staging/snapshot completo configurado no ambiente do processo. Resultado: smoke autenticado continuou `SKIPPED_AUTH_REQUIRED`, empresa esperada permaneceu nao validada, Data Quality repetiu `PASS=5 WARN=4 FAIL=0 SKIPPED=5`, Audit v2 permaneceu `READY_FOR_STAGING_FLAG_TEST`. Decisao operacional atual: `CONDITIONAL GO`.

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
| `R01` - SIGVOOS runtime DDL | RESOLVED | fallback runtime removido; bootstrap preservado; replay/bootstrap tests e ausência de DDL/runtime PASS | nenhuma — seguir apenas com reauditoria independente opcional | GPT-5.5 Altissimo |
| `R04` - Documentos bootstrap DDL | ✅ RESOLVED (Sprint R04.7, 2026-06-04) | `0388` já aplicada e probe pós-apply PASS desde R04.5; bootstrap runtime removido na Sprint R04.6; deploy Worker/API executado na R04.7 (APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9), smoke pós-deploy PASS (3/3 público, read-only PASS). R04 = RESOLVED. | Nenhuma — concluído | — |
| `R09` - `qualificacoes/shared.ts` dynamic DDL | ✅ RESOLVED (Sprint R09, 2026-06-03) | ALTER TABLE removido; `renovada`=0200+; `local`/`modalidade`=removidas por 0200; active path ja era no-op | Nenhuma | — |
| `MIG-01` - Migration Integrity | RESOLVED_FOR_CONTROLLED_SCOPE | baseline SQL de schema gerado a partir do snapshot `staging`, replayado em SQLite limpo, sem `d1_migrations`, sem `0389`, sem D1 remoto e sem edicao historica | nenhuma para o escopo controlado; proximo bloco e aplicar `0389` | — |
| Audit v2 | PARITY_VALIDATED_FOR_CONTROLLED_SCOPE | `0385` aplicada em `staging`; `audit_events_v2` presente; helper legado+canônico e sanitização preservados no escopo controlado | ampliar cobertura operacional sem perder o fallback legado/canônico | GPT-5.5 Altissimo |
| RBAC/Suporte v2 | GRADUAL_ENFORCEMENT_ACTIVE_FOR_CONTROLLED_SCOPE | `0389` + enforcement gradual aplicados em rotas sensíveis de certificados/admin; grants/sessões/justificativa auditável validados no escopo pequeno | ampliar enforcement só após nova validação controlada; não remover fallback ainda | GPT-5.5 Altissimo |
| Data Quality | RESOLVED_FOR_CONTROLLED_SCOPE | `staging` foi materializado com snapshot/rollback/approval; gates PASS; diagnóstico pré/pós ficou `PASS=9 WARN=0 FAIL=0 SKIPPED=5`; apply remoto autorizado em `funcionarios` concluiu com `changed=0` e `remaining=0` | manter `DQ-02` separado para cobertura futura de schema completo, sem reabrir `DQ-01` | GPT-5.4 Alta |
| Smoke com empresa esperada | PARTIAL | sem credencial efemera/read-only e sem `AIRTRUST_EXPECTED_EMPRESA_*` tambem na OP-2 | configurar `AIRTRUST_EXPECTED_EMPRESA_ID` ou `CODIGO` e reexecutar | GPT-5.4 Baixa |
| Product/performance/scale staging | VALIDATED_IN_STAGING_FOR_CONTROLLED_SCOPE | validado por smoke publico read-only, D1 read-only e guards/testes locais; sem load test amplo | usar Bloco 6 para release gate/reauditoria final; load test fica separado se cliente externo amplo exigir | GPT-5.5 Alta |
| Auth/tenant residual final | RESOLVED | `AUTH-RESIDUAL-01` e `AUTH-RESIDUAL-02` fechados localmente; `AUTH_TENANT = CONFIRMED_CLOSED` | nenhuma acao local pendente | — |

## 4. R01 - SIGVOOS

Estado real:
- `0387_integracoes_sigvoos_base_tables.sql` existe e cobre as 3 tabelas base + 4 indices.
- `0354_auditoria_critica_schema_hardening.sql` ainda faz `ALTER TABLE integracoes_sigvoos_config`.
- o teste local da Sprint Z1.1 provou que uma cadeia limpa falha na `0354` antes da `0387`.

Conclusao:
- nao e seguro aplicar/remover fallback apenas com `0387`;
- nao e seguro reescrever `0354` cegamente, porque ela ja faz parte da historia aplicada;
- a proxima acao correta e um **baseline/chain plan** para ambientes novos, nao uma migration remota imediata.

## 5. R04 - Documentos — RESOLVED (Sprint R04.7, 2026-06-04)

Estado real (pós-Sprint R04.7):
- ~~`runApiBootstrap()` continua chamando `ensureDocumentosTableExists()` no startup~~ **BOOTSTRAP REMOVIDO NA SPRINT R04.6.**
- `auto-migration-documentos.ts` deletado do runtime (`git rm src/utils/auto-migration-documentos.ts`).
- `api-bootstrap.ts` limpo — `import { ensureDocumentosTableExists }` e `await ensureDocumentosTableExists(db)` removidos.
- Guard test `no-runtime-ddl-hot-paths.test.ts` atualizado — `api-bootstrap.ts` removido de `DOCUMENTED_EXCEPTIONS`, R04 documentado como `RESOLVED` nos comentários.
- Testes: `documentos-canonical-schema` (8/8), `no-runtime-ddl-hot-paths` (13/13), `tenant-isolation` (12/12) todos PASS.
- **Sprint R04.7 (2026-06-04):** deploy Worker/API executado (`APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9`). Smoke pós-deploy: read-only PASS, public-only PASS (3/3). `/api/version` e `/api/health` confirmados funcionais. Deploy Pages: NÃO.
- 9 lacunas originais (L1-L9) — a `0388` e o probe estrutural remoto já mitigaram as lacunas estruturais de `documentos`; bootstrap removido sem impacto porque a migration `0388` já garante o schema canônico nos ambientes novos.
- Histórico mantido como referência: o probe estrutural confirmou baseline parcial/legada, a Sprint R04.3 fechou o desenho, a Sprint R04.4 versionou a migration, a Sprint R04.5 executou o apply oficial (`0387` + `0388` via fila pendente) com probe pós-apply PASS.

Conclusao:
- **`R04` = RESOLVED.**
- Bootstrap removido com segurança: migration `0388` já aplicada em produção (R04.5), probe pós-apply PASS, código morto eliminado (R04.6), deploy + smoke concluídos (R04.7).
- Ordem segura executada: apply 0388 (R04.5) → probe pos-migration PASS (R04.5) → remover bootstrap (R04.6) → deploy + smoke (R04.7) ✅ COMPLETO.
- Itens explicitamente adiados/não tocados pela `0388`: `historico_id`, `idx_documentos_historico`, `sha256_hash`, `idx_documentos_sha256`, `pasta_virtual.documento_id`, qualquer DDL em `certificados_templates` e os indices de `0200` baseados em colunas fantasmas.
- Documentos detalhados: `docs/AIRTRUST_DOCUMENTOS_DDL_R04_READINESS_v0_5.md` e `docs/AIRTRUST_DOCUMENTOS_0388_CANONICAL_SCHEMA_DESIGN_v0_5.md`.

## 6. R09 - Qualificacoes shared.ts ✅ RESOLVED (Sprint R09, 2026-06-03)

Estado real (pos-Sprint R09):
- `shared.ts` era dead code — nunca importado; o active path em `historico-helpers.ts:131` ja era no-op.
- O ALTER TABLE foi removido e substituido por no-op documentado com comentario `R09-RESOLVED`.
- Colunas: `renovada` = presente no schema final via migrations 0107/0200/0325; `local`/`modalidade` = intencionalmente removidas pela migration 0200.
- O DDL removido era anti-migration — adicionaria de volta colunas removidas.
- Teste dedicado: `qualificacoes-historico-shared-schema.test.ts`.

**R09 = RESOLVED. Nenhuma acao pendente.**

## 7. Audit v2

Estado real:
- schema `audit_events_v2` aplicado em producao via `0385`;
- writer canonico versionado;
- `0385` aplicada tambem em `staging` no bloco 4;
- paridade controlada validada para o escopo pequeno atual;
- ampliacao operacional continua atras de decisao controlada.

Conclusao:
- o pendente principal nao e mais schema nem paridade minima;
- o pendente principal e **ampliacao controlada** sem perder fallback legado/canonico.

## 8. RBAC/Suporte v2

Estado real:
- design, readiness gate, phased plan, rollback e matriz de testes estao prontos;
- `0389` aplicada em `staging` e enforcement gradual ativo no escopo sensivel selecionado;
- fallback legado de plataforma continua preservado por decisao de rollout.

Conclusao:
- nao ha trabalho seguro de ampliacao ampla sem nova janela controlada;
- o proximo passo correto e expandir enforcement apenas depois de novo smoke/validacao operacional.

## 9. Migration Integrity

Estado real:
- o diretorio canonico `worker-airtrust/migrations/` hoje tem 361 arquivos `.sql`;
- 30 prefixos numericos duplicados permanecem historicos;
- 3 nomes canonicos seguem fora do padrao `NNNN_snake_case.sql`;
- `0058 -> 0059` continua documentado como risco historico de replay no relatorio de staging;
- `0354 -> 0387` continua sendo a prova local concreta de dependencia fora de ordem, mitigada apenas para ambientes novos via bootstrap;
- a sprint atual criou o guard `migration-governance.test.ts`, pinando duplicatas, nomes fora do padrao, `CREATE TEMP TABLE` e `PRAGMA foreign_keys = OFF`.

Conclusao:
- o stream DDL runtime esta fechado e `MIG-01` esta resolvido para o escopo controlado atual;
- a cadeia historica ampla ainda pode exigir rebaseline/squash futuro para ambientes novos;
- a governanca local segue impedindo regressao silenciosa.

## 10. Data Quality

Estado real:
- runner existe;
- SQL ja foi validado;
- `DQ-01` foi validado em `staging` com snapshot/rollback/approval e apply com `0` candidatos;
- a sprint atual endureceu caminhos criticos de simuladores (`/instrutores`, participantes e fallback de checks) para que integridade de tenant e de referencias nao fique so implícita no schema;
- o smoke autenticado ainda nao fechou empresa esperada por falta de env var.

Conclusao:
- `DQ-01` nao deve ser reaberto no bloco atual;
- o residual correto e `DQ-02`, separado, para cobertura futura de schema completo e smoke autenticado com empresa esperada.

## 11. Ordem final recomendada

1. Reauditoria final Opus / release gate sem alterar schema.
2. Smoke autenticado com empresa esperada, se o gate de release exigir credencial efemera/read-only.
3. Ampliar `RBAC/Suporte v2` somente apos nova validacao operacional controlada.
4. Planejar load test amplo separado se o objetivo mudar de piloto/controlado para cliente externo amplo.
5. ~~`R09 Readiness/Verification Sprint`~~ **CONCLUÍDO** (Sprint R09, 2026-06-03).
6. ~~Remover o bootstrap de Documentos~~ ✅ CONCLUÍDO (Sprint R04.6 + R04.7). A `0388` já estava aplicada e sondada; o bootstrap foi removido (R04.6: `auto-migration-documentos.ts` deletado, `api-bootstrap.ts` limpo, guard test atualizado). Deploy Worker/API executado (R04.7: APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS 3/3). **R04 = RESOLVED.**
7. `R01 SIGVOOS Runtime Fallback Removal` — **CONCLUÍDO** na Sprint R01.4. O bootstrap/runbook foi preservado e o runtime DDL saiu integralmente do código.
8. Expandir `EVD/Beta`, `status residual`, `observabilidade` e `R2 metadata`.

**Estado operacional atual:** `CONDITIONAL GO` para piloto/controlado; nao e `GO` pleno para cliente externo amplo enquanto smoke autenticado com empresa esperada e eventual load test amplo nao estiverem fechados. `DQ-01`, `MIG-01`, `Audit v2`, `RBAC/Suporte v2` e `Product/performance/scale` estao validados apenas para escopos controlados.

## 12. O que pode ser feito com 5.4/DeepSeek

- Smoke autenticado com empresa esperada.
- `DQ-02` futuro em staging/snapshot aprovado, sem reabrir `DQ-01`.
- Smoke publico/read-only e checks de regressao operacional.
- ~~Sprint curta de verificacao do `R09`~~ **CONCLUÍDO** (Sprint R09, 2026-06-03).
- ~~R04 migration aplicada / bootstrap removido~~ ✅ CONCLUÍDO (Sprint R04.5: `0388` aplicada + probe pós-apply PASS; Sprint R04.6: bootstrap removido, `auto-migration-documentos.ts` deletado, `api-bootstrap.ts` limpo; Sprint R04.7: deploy Worker/API APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS 3/3. R04 = RESOLVED.)
- Cobertura de testes beta/EVD.
- Expansao de `status-codes`.
- Auditorias de performance, observabilidade e repository pattern read-only.

## 13. O que realmente exige 5.5

- Ampliacao de Audit v2 alem do escopo controlado atual.
- Ampliacao de RBAC/Suporte v2 alem do enforcement gradual atual.
- Load test amplo e decisao de escala 5+ empresas, se o objetivo sair de piloto/controlado.
- ~~`R04` se envolver deploy do Worker/API e smoke pós-deploy~~ ✅ CONCLUÍDO (Sprint R04.7, 2026-06-04). Deploy Worker/API APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS (3/3). R04 = RESOLVED.
- `R01` enquanto depender de baseline, cadeia historica e possivel estrategia de rebuild para ambientes novos.

## 14. Criterio de encerramento das auditorias

As auditorias remanescentes so podem ser consideradas encerradas quando:

1. Audit v2 tiver rollout amplo aprovado, alem da paridade controlada atual.
2. RBAC/Suporte v2 estiver ampliado e sem dependencia do fallback legado, quando essa remocao for aprovada.
3. `DQ-02` tiver ambiente aprovado e checks completos, sem reabrir `DQ-01`.
4. `R01` nao depender mais de DDL runtime. Isso foi atingido na Sprint R01.4: `ensureSigvoosTables()` e os 10 call sites sairam do runtime, o bootstrap local permaneceu preservado e **`R01 = RESOLVED`**. `R04` = RESOLVED (Sprint R04.6 + R04.7: bootstrap removido, deploy + smoke PASS). `R09` = RESOLVED (Sprint R09, 2026-06-03).
5. Smoke autenticado com empresa esperada estiver documentado como `PASS`.
6. Load test amplo for concluido, se o objetivo for cliente externo amplo ou 5+ empresas.

**Addendum Sprint R04.6 (2026-06-03):** o bootstrap runtime de Documentos foi removido, fechando o ciclo R04 iniciado no Sprint R04.1. Ações executadas: `auto-migration-documentos.ts` deletado; `api-bootstrap.ts` limpo (import + call); guard test atualizado com R04 documentado como RESOLVED nos comentários; 3 suites de teste PASS (8/8, 13/13, 12/12). **R04 = RUNTIME_FALLBACK_REMOVED_PENDING_DEPLOY.** Nenhuma migration nova, nenhum schema remoto alterado, nenhum backfill, nenhum dado tocado. Naquele momento, R01 permanecia o único resíduo runtime ativo (`0387_APPLIED_IN_PRODUCTION_BUT_CHAIN_0354_STILL_NEEDS_RECONCILIATION`). Próximo passo da época: deploy do Worker/API + smoke pós-deploy → R04 = RESOLVED.

**Addendum Sprint R04.7 (2026-06-04):** o deploy do Worker/API foi executado com sucesso (`APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9`). Smoke pós-deploy: read-only PASS, public-only PASS (3/3). `/api/version` e `/api/health` confirmados funcionais. Deploy Pages: NÃO. **R04 = RESOLVED.**

**Addendum Sprint R01 Chain Reconciliation (2026-06-03):** achado de bloqueio de replay limpo formalizado para R01. Nenhuma migration anterior à `0354` cria `integracoes_sigvoos_config`. `0354` falha em cadeia limpa; `0387` aplicada em produção não resolve cadeia. Testes locais 8/8 PASS. `ensureSigvoosTables()` preservado. **R01 = MIGRATION_APPLIED_CHAIN_RECONCILIATION_REQUIRED.** Doc de decisão: `docs/AIRTRUST_SIGVOOS_MIGRATION_CHAIN_RECONCILIATION_v0_5.md`.

**Addendum Sprint R01 Baseline Strategy (2026-06-03):** estratégia de resolução definida. Editar `0354` rejeitado; `0389` isolada insuficiente. Curto prazo: `scripts/bootstrap-new-environment.sql` para novos ambientes. Longo prazo: squash/rebaseline. `ensureSigvoosTables()` preservado até condições documentadas em `AIRTRUST_SIGVOOS_R01_BASELINE_STRATEGY_v0_5.md` atendidas. Próxima fase: R01-bootstrap.

**Addendum Sprint R01 Bootstrap + Replay Closure (2026-06-04):** `scripts/bootstrap-new-environment.sql` foi criado com DDL puro das tabelas base SIGVOOS exigidas antes da `0354`, sem dados reais, sem backfill, sem tenant real e sem dependência de D1 remoto. O teste local agora prova explicitamente que: sem bootstrap, o replay limpo falha na `0354`; com bootstrap, a cadeia atravessa `0354`; o bootstrap é idempotente; e o fluxo não depende de dados reais nem de D1 remoto. `ensureSigvoosTables()` foi preservado. **R01 = BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE.** Próximo passo: executar o runbook em ambiente novo/staging aprovado antes de propor a remoção do fallback.

**Addendum Sprint R01 Staging/New Environment Gate + Runtime Fallback Removal Readiness (2026-06-04):** o bootstrap foi reaudidado, a prova negativa sem bootstrap foi preservada, a prova positiva com bootstrap permaneceu PASS e o gate local-isolado de novo ambiente passou. O inventário do fallback runtime foi fechado em 10 call sites concentrados em 2 arquivos. `ensureSigvoosTables()` continua preservado nesta etapa, mas a conclusão mudou para **`R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL`**. Próximo passo: sprint final de remoção do fallback + auditoria final.

**Addendum Sprint R01.4 Runtime Fallback Removal + Final Audit Closure (2026-06-04):** `ensureSigvoosTables()` foi removido de `sigvoos-frms.ts`, os 10 call sites foram eliminados de runtime, o bootstrap `scripts/bootstrap-new-environment.sql` foi preservado e o teste dedicado `sigvoos-no-runtime-ddl.test.ts` passou a garantir ausência de DDL/runtime SIGVOOS. Nenhuma migration histórica foi editada, nenhuma migration nova foi criada, nenhum D1 remoto foi acessado e nenhum deploy foi executado. **`R01 = RESOLVED`**. `AUDIT_CURRENT_CLOSURE = CLOSED` para o stream R01/DDL residual. Próxima etapa recomendada: reauditoria independente com Opus.

**Addendum Sprint AH Data Quality + Migration Integrity (2026-06-04):** `MIG-01` foi reclassificado para **`PARTIAL_REQUIRES_FUTURE_REBASELINE`**. A sprint criou `migration-governance.test.ts`, congelando 30 prefixos duplicados, 3 nomes fora do padrao e os principais construtos historicos hostis ao runner do D1, sem editar migrations aplicadas. `DQ-01` permaneceu parcial, mas os caminhos criticos de simuladores agora validam tenant e referencias antes de ler/escrever: `GET /instrutores`, participantes de sessao e fallback de checks foram endurecidos e cobertos por `simuladores-sessoes-data-quality.test.ts`. Nenhum D1 remoto, deploy, migration nova, backfill ou saneamento de dados reais foi executado.

**Addendum Sprint AI Migration Rebaseline + Data Quality Backfill Readiness (2026-06-04):** `MIG-01` avancou para **`READY_FOR_CONTROLLED_REBASELINE`**. A sprint criou `AIRTRUST_MIGRATION_REBASELINE_READINESS_v0_5.md` e `audit-migration-chain-readiness.sh`, explicitando corte, validacao local, staging e rollback sem tocar migrations historicas. `DQ-01` avancou para **`READY_FOR_CONTROLLED_BACKFILL`** com `AIRTRUST_DATA_QUALITY_BACKFILL_READINESS_v0_5.md` e `audit-data-quality-readiness.sh`, separando risco, deteccao, migration eventual, backfill e decisao manual. Nenhum D1 remoto, deploy, migration nova ou backfill real foi executado.

**Addendum Sprint AJ DQ-01 Controlled Backfill Gate (2026-06-04):** a etapa atual tentou avançar da readiness para a execução, mas parou corretamente no gate de ambiente. Não havia `AIRTRUST_DQ01_*` configurado para staging aprovado, nenhum snapshot/rollback foi fornecido à sessão e não houve autorização explícita para tocar banco alvo. A sprint criou `AIRTRUST_DQ01_CONTROLLED_BACKFILL_EXECUTION_v0_5.md`, `dq01-controlled-backfill-gate.sh` e `dq01-controlled-backfill-gate.test.ts`. **`DQ-01 = BACKFILL_EXECUTION_BLOCKED_BY_ENVIRONMENT_READINESS`**.

**Addendum Sprint AK Controlled Execution Environment Contract (2026-06-04):** a sprint atual consolidou o pacote operacional compartilhado dos dois streams. Foram adicionados `AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md`, `AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md`, `controlled-execution-gate.sh`, `mig01-controlled-rebaseline-gate.sh` e os testes de contrato do gate. O bloqueio operacional circunstancial de DQ deixou de ser o status mestre do stream e tanto `DQ-01` quanto `MIG-01` passam a **`READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`**, ainda sem target real aprovado na sessão.

**Addendum Audit Cycle Final Closure (2026-06-04):** os gates existentes foram executados sem env de ambiente controlado e bloquearam corretamente. Nenhum backfill, rebaseline, D1 remoto, deploy, migration nova ou edição de migration histórica foi executado. `DQ-01` e `MIG-01` passam a **`BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE`**. `ARCH-01` passa a **`MITIGATED_WITH_GUARDS`** com `architecture-performance-guard.test.ts`.

**Addendum Sprint AL DQ01 Controlled Environment Package (2026-06-04):** um pacote rastreável de ambiente controlado foi materializado para `DQ-01` em `local-copy`, sem tocar `staging` nem `production`. A sprint criou `AIRTRUST_DQ01_CONTROLLED_ENVIRONMENT_PACKAGE_v0_5.md`, `docs/controlled-execution/dq01-target-evidence-20260604.md`, `docs/controlled-execution/dq01-rollback-plan-20260604.md` e o wrapper read-only `scripts/run-dq01-local-copy-backfill-readonly.sh`. Também foi criado um snapshot local não rastreado em `.wrangler/state`, e os gates `controlled-execution-gate.sh` e `dq01-controlled-backfill-gate.sh` passaram com esse pacote, sem backfill real. **`DQ-01 = READY_FOR_CONTROLLED_BACKFILL_EXECUTION`**.

**Addendum DQ01 Local Copy Backfill Execution (2026-06-04):** o comando mutante local-only `scripts/run-dq01-local-copy-backfill-apply.sh` foi criado, testado e executado contra `local-copy` com snapshot/rollback. Resultado: `registro_ativo_deleted_at_inconsistente` foi de `17` para `0`; os demais WARNs foram preservados por exigirem decisão de negócio. Nenhum D1 remoto, staging, produção, deploy, `MIG-01` ou `0389` foi usado. **`DQ-01 = LOCAL_COPY_BACKFILL_VALIDATED_READY_FOR_STAGING`**; **`MIG-01 = WAITING_FOR_DQ_STAGING_OR_CONTROLLED_DECISION`**.

**Addendum DQ01 Staging Controlled Backfill Execution (2026-06-04):** `staging` foi finalmente materializado como ambiente controlado canônico para `DQ-01`, com approval, evidence doc, snapshot SQL + SQLite, rollback e safe commands próprios. Os três gates passaram e o diagnóstico pré em `staging` ficou `PASS=9 WARN=0 FAIL=0 SKIPPED=5`. O apply remoto autorizado em `funcionarios` encontrou `0` candidatos para `soft_delete_status_alignment`, executou `changed=0` e preservou `remaining=0`; o snapshot pós-janela repetiu o mesmo hash do dump e as mesmas contagens. **`DQ-01 = RESOLVED_FOR_CONTROLLED_SCOPE`**; **`MIG-01 = READY_FOR_CONTROLLED_REBASELINE_AFTER_DQ`**.

**Addendum MIG01 Controlled Rebaseline Execution (2026-06-04):** `MIG-01` foi executado como rebaseline controlado de artefato a partir do snapshot SQLite pos-DQ de `staging`. Os gates passaram, o baseline SQL gerado excluiu `d1_migrations`, preservou `0389` fora do escopo e foi replayado em SQLite limpo com `PRAGMA integrity_check = ok`. Resultado estrutural: `225` tabelas, `585` indices, `21` triggers e `10` views. Nao houve D1 remoto, deploy, producao, DQ novo, apply da `0389` ou edicao de migration historica. **`MIG-01 = RESOLVED_FOR_CONTROLLED_SCOPE`**; **`RBAC_SUPPORT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`**; **`AUDIT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`**.

**Addendum Final Local Residual Closure + Controlled Execution Bridge (2026-06-04):** a auditoria residual Opus apontou dois padrões finais de auth/tenant. `AUTH-RESIDUAL-01` foi resolvido em `syncEscalaEventosExternos.ts` com remoção de `f.empresa_id IS NULL`. `AUTH-RESIDUAL-02` foi resolvido em `escalas-tripulacoes.ts` com `empresa_id = ?` nos lookups operacionais de aeronave/PIC. A busca local também levou ao hardening de `sgso-next-gen-extra.ts`. `AUTH_TENANT = CONFIRMED_CLOSED`; `LOCAL_AUDIT_CLOSURE = COMPLETE_WITH_ENVIRONMENT_BLOCKERS`.

**Addendum Product / Performance / Scale Hardening (2026-06-04):** a sprint local não tocou DQ/MIG/`0389`, não executou D1 remoto e não fez deploy. O foco foi segurança operacional de produto e regressão local. Resultado: `GET /historico-notas/:funcionarioId` em simuladores passou a aplicar clamp seguro de `limit`; o smoke local foi ampliado para `dashboard/qualificacoes`, `dashboard/licencas` e `GET /evd`; e o `architecture-performance-guard.test.ts` passou a congelar `SELECT *` em rotas críticas via allowlist explícita. Status consolidado: **`PRODUCT_PERFORMANCE_SCALE = MITIGATED_WITH_LOCAL_GUARDS_AND_SMOKE`**. Risco residual correto: **`PARTIAL_REQUIRES_STAGING_MEASUREMENT`** para hotspots herdados de FRMS/SGSO/LMS/escalas.
