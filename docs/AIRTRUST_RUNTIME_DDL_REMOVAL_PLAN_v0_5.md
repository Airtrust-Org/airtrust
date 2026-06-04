# AirTrust Runtime DDL Removal Plan v0.5

## Escopo desta fase

Objetivo desta fase: remover DDL em runtime dos hot paths apenas quando a cobertura por migration existente for comprovada.

Critérios usados nesta execução:

- classe `A`: tabela/índice já coberto por migration numerada e removível sem alterar regra de negócio;
- classe `B`: cobertura parcial por migration;
- classe `C`: sem migration suficiente para remover com segurança;
- classe `D`: caminho legado ou operacional, fora de hot path HTTP normal;
- classe `E`: bootstrap/local/teste, não request-driven.

Rotas operacionais de migração manual (`admin-migration`, `admin-manual-migrations`, `admin-migrate`, `routes/migrations.ts`) ficaram fora do alvo de remoção desta fase porque não são hot paths de produção.

## Inventário de runtime DDL

| Arquivo / função | DDL runtime | Hot path / frequência | Cobertura por migration | Classe | Ação nesta fase |
| --- | --- | --- | --- | --- | --- |
| `worker-airtrust/src/routes/preferencias.ts` | `usuario_preferencias` + `idx_usuario_preferencias_lookup` | toda leitura/gravação de preferências | `0245_escalas_integridade_preferencias.sql` | A | removido |
| `worker-airtrust/src/routes/escalas-preferencias.ts` | `usuario_preferencias` + `idx_usuario_preferencias_lookup` | toda leitura/gravação de preferências de escalas | `0245_escalas_integridade_preferencias.sql` | A | removido |
| `worker-airtrust/src/routes/matriz-treinamento.ts` | `matriz_treinamento_funcao` + índices | toda leitura/gravação da matriz | `0360_matriz_treinamento_funcao.sql` | A | removido |
| `worker-airtrust/src/routes/frms-fira.ts` | `frms_fonte_calculo_competencia` + índices | comparação FIRA/SIGVOOS e escolha de fonte | `0361_frms_fonte_calculo_competencia.sql` | A | removido |
| `worker-airtrust/src/routes/alertas.ts` | `alertas_whatsapp_delivery` + índices | callback/status WhatsApp | `0320_alertas_whatsapp_delivery_tracking.sql` | A | removido |
| `worker-airtrust/src/utils/alert-whatsapp-templates-store.ts` | `alertas_whatsapp_templates` + índices | listagem/sync de templates | `0321_alertas_whatsapp_templates.sql` | A | removido |
| `worker-airtrust/src/routes/notificacoes-convocacao.ts` | acesso a `notificacoes_convocacao_*` e `treinamentos_convocacoes_email*` via `ensureConvocacaoEmailSchema` | toda leitura/gravação da configuração e envio | `0320_treinamentos_convocacao_email.sql` e `0359_setores_gestores_many_to_many.sql` | A | removido |
| `worker-airtrust/src/routes/treinamentos-planejados.ts` | `treinamentos_planejados`, `treinamentos_participantes`, chamadas de convocação | toda leitura/gravação da agenda | `0172_create_treinamentos_planejados.sql` e `0320_treinamentos_convocacao_email.sql` | A | removido no router |
| `worker-airtrust/src/services/treinamentos-convocacao-email.ts` | definição de `ensureConvocacaoEmailSchema` | indiretamente chamada por rotas de convocação | `0320_treinamentos_convocacao_email.sql` | A | função removida |
| `worker-airtrust/src/services/treinamentos-planejados-integration.ts` | `treinamentos_planejados`, `treinamentos_participantes`, ~~`ALTER TABLE solicitacoes_treinamento ADD COLUMN treinamento_planejado_id`~~, ~~`status_pre_agendamento`~~, ~~índice `idx_solicitacoes_treinamento_planejado`~~ | sync em writes de treinamento planejado | `0172_create_treinamentos_planejados.sql` cobre tabelas base; `0386_solicitacoes_treinamento_planejado_link.sql` cobre as colunas/índice de link em `solicitacoes_treinamento` | A (RESOLVED) | Sprint X.5: migration `0386` aplicada em produção + Worker/API deployado. R03 = RESOLVED. |
| `worker-airtrust/src/services/sigvoos-frms.ts` | `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos`, `sigvoos_mapeamento_manual`, `frms_jornada_pendente` + índices | leitura/config/importação SIGVOOS e reconciliação FRMS | `0352_sigvoos_frms_pendencias_e_enriquecimento.sql` cobre apenas `sigvoos_mapeamento_manual` e `frms_jornada_pendente`; `0354_auditoria_critica_schema_hardening.sql` adiciona `notificar_falha_email`; nenhuma migration encontrada para criação das tabelas `integracoes_sigvoos_*` | B/C | mantido, requer migration futura |
| `worker-airtrust/src/runtime/api-bootstrap.ts` + `worker-airtrust/src/utils/auto-migration-documentos.ts` | `documentos` + índices | bootstrap de runtime, não por request | cobertura legada/mista; há recriação e índices parciais em `0136_rebuild_all_funcionarios_old_refs.sql`, `0137_fix_certificados_completo.sql`, `0138_certificados_improvements.sql`, mas não há correspondência clara para todos os índices criados pelo helper | B/E | não tocado nesta fase |
| `worker-airtrust/src/routes/qualificacoes/tipos.ts` | colunas `carga_horaria_inicial`, `carga_horaria_recorrente` | reads/writes de tipos de qualificação | `0317_split_carga_horaria_and_tipo_treinamento.sql` | A | removido no Sprint W |
| `worker-airtrust/src/routes/qualificacoes/historico.ts` e `historico-write.ts` + helpers | colunas em `qualificacoes_historico`, `qualificacoes_tipos`, `modelos_aeronave` | writes/read de histórico | `0173_add_status_to_qualificacoes.sql`, `0317_split_carga_horaria_and_tipo_treinamento.sql`, `0183_add_modelo_to_modelos_aeronave.sql` | A | DDL removido dos helpers no Sprint W; call sites mantidos via no-op/backfill por compatibilidade |
| `worker-airtrust/src/routes/simuladores-modelos.ts` | coluna `modelo_aeronave` em `modelos_sessao` + índice | CRUD de modelos de simulador | `0184_add_modelo_aeronave_to_modelos_sessao.sql` | A | removido no Sprint W |

## Removido nesta fase

- Removidas chamadas `ensure*` de hot paths já cobertos por migrations em:
  `routes/preferencias.ts`,
  `routes/escalas-preferencias.ts`,
  `routes/matriz-treinamento.ts`,
  `routes/frms-fira.ts`,
  `routes/alertas.ts`,
  `routes/notificacoes-convocacao.ts`,
  `routes/treinamentos-planejados.ts`,
  `utils/alert-whatsapp-templates-store.ts`.
- Removidas funções órfãs:
  `ensureConvocacaoEmailSchema`,
  `ensureTreinamentosPlanejadosSchema`,
  `ensureWhatsAppDeliveryTable`,
  `ensureWhatsAppTemplatesTable`,
  `ensureFonteCalculoTable`,
  `ensureUsuarioPreferenciasTable`,
  `ensureSchema` da matriz.
- Adicionado teste de arquitetura:
  `worker-airtrust/src/__tests__/architecture/no-runtime-ddl-hot-paths.test.ts`.

## Não removido e motivo

- `services/treinamentos-planejados-integration.ts` não faz mais DDL runtime para `solicitacoes_treinamento`.
  A migration `0386_solicitacoes_treinamento_planejado_link.sql` foi versionada, aplicada em produção e o Worker/API foi deployado.
  ✅ R03 = RESOLVED. Nenhum risco restante.
- `services/sigvoos-frms.ts` ainda cria as tabelas `integracoes_sigvoos_*` em runtime.
  A cobertura encontrada em migrations é apenas parcial.
- ~~`runtime/api-bootstrap.ts` / `auto-migration-documentos.ts`~~ (AMBOS REMOVIDOS NO SPRINT R04.6).
  A Sprint R04.2 executou o probe estrutural remoto read-only e confirmou baseline parcial/legado em produção. A Sprint R04.3 fechou o desenho documental da `0388`. A Sprint R04.4 versionou a migration e o teste local dedicados. A Sprint R04.5 registrou o apply oficial da fila pendente (`0387` + `0388`) com probe pós-apply. **A Sprint R04.6 removeu definitivamente o bootstrap:** `auto-migration-documentos.ts` deletado, `api-bootstrap.ts` limpo (import + call removidos), guard test atualizado. ✅ CONCLUÍDO (Sprint R04.7): deploy Worker/API APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS (3/3 público, read-only PASS). R04 = RESOLVED.

## Migrations futuras necessárias

1. ~~Aplicar `0386_solicitacoes_treinamento_planejado_link.sql`~~ ✅ CONCLUÍDO (Sprint X.5).
2. ~~Deployar o Worker/API sem o fallback de R03~~ ✅ CONCLUÍDO (Sprint X.5).
3. Migration explícita `0387` já criada e aplicada em produção (Sprint R04.5). Resta reconciliar a cadeia `0354 -> 0387` antes de remover o fallback R01.
4. ~~Remover `auto-migration-documentos.ts` e o bootstrap correspondente~~ ✅ CONCLUÍDO (Sprint R04.6, 2026-06-03). Bootstrap removido: `auto-migration-documentos.ts` deletado, `api-bootstrap.ts` limpo, guard test atualizado. ✅ CONCLUÍDO (Sprint R04.7): deploy Worker/API APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS (3/3 público, read-only PASS). R04 = RESOLVED.

## Riscos de remover sem migration

- `services/treinamentos-planejados-integration.ts` pode quebrar writes de sincronização para solicitações já aprovadas se as colunas de link não existirem.
- `services/sigvoos-frms.ts` pode indisponibilizar leitura/escrita de configuração, eventos e mapeamentos SIGVOOS se as tabelas base não estiverem provisionadas.
- ~~`auto-migration-documentos.ts` já removido (Sprint R04.6).~~ A `0388` já estava aplicada em produção com probe pós-migration PASS desde a Sprint R04.5. O bootstrap foi removido com segurança: `auto-migration-documentos.ts` deletado, `api-bootstrap.ts` limpo, guard test atualizado, 3 suites de teste PASS. Risco controlado — ambiente novo depende apenas da migration `0388`, já aplicada.

## Ordem recomendada das próximas fases

1. ~~Aplicar `0386_solicitacoes_treinamento_planejado_link.sql`~~ ✅ CONCLUÍDO (Sprint X.5).
2. ~~Deployar o Worker/API com segurança depois da aplicação da migration~~ ✅ CONCLUÍDO (Sprint X.5).
3. Reconcilicar explicitamente a cadeia `0354 -> 0387` e só então remover `ensureSigvoosTables` dos serviços e rotas.
4. ~~Remover `api-bootstrap`/`auto-migration-documentos`~~ ✅ CONCLUÍDO (Sprint R04.6). Bootstrap removido: `auto-migration-documentos.ts` deletado; `api-bootstrap.ts` limpo; guard test atualizado; 3 suites de teste PASS. ~~Pendente: deploy + smoke pós-deploy~~ ✅ CONCLUÍDO (Sprint R04.7: deploy Worker/API APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS 3/3). R04 = RESOLVED.
5. Revisitar `qualificacoes` e `simuladores` para retirar os `ensure*` remanescentes já cobertos por migration.

---

## Sprint V — DDL Runtime Residual Design (2026-06-03)

**Status:** PARTIAL → R03 RESOLVED, R09 RESOLVED, R04 RESOLVED (Sprint R04.7), R01 0387_APPLIED_IN_PRODUCTION_BUT_CHAIN_0354_STILL_NEEDS_RECONCILIATION. Sprint V executado em modo read-only/docs-only. Sprints X.0–X.4 fizeram probe, versionaram migration e removeram fallback local. Sprint X.5 aplicou `0386` em produção e deployou o Worker/API. Sprint Z0 mapeou integralmente R01 (SIGVOOS). Sprint Z1 criou `0387` e o teste local. Sprint Z1.1 provou a falha da cadeia limpa em `0354`. Sprint R09 (2026-06-03) removeu o ALTER TABLE de `shared.ts`. Sprint R04.2 registrou o probe estrutural remoto de produção para R04, a Sprint R04.3 fechou o desenho documental da `0388`, a Sprint R04.4 versionou a migration e o teste local, a Sprint R04.5 registrou o apply oficial da fila pendente (`0387` + `0388`) com probe pós-apply, **a Sprint R04.6 removeu o bootstrap runtime de Documentos** (`auto-migration-documentos.ts` deletado, `api-bootstrap.ts` limpo, guard test atualizado) e **a Sprint R04.7 executou o deploy do Worker/API (APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9) + smoke pós-deploy PASS (3/3). R04 = RESOLVED.** Resta: reconciliação da cadeia limpa de R01.

### Inventário atualizado

A busca exaustiva por DDL em `worker-airtrust/src/` encontrou 20 ocorrências (excluindo docs/scripts), classificadas em:

| Classe | Quantidade | Descrição |
|---|---|---|
| RUNTIME_HOT_PATH | 3 | DDL executado em handlers de rota HTTP normal, sem migration correspondente |
| RUNTIME_HOT_PATH_COVERED | 6 | DDL em hot path mas já coberto por migration numerada |
| RUNTIME_BOOTSTRAP | 1 | DDL executado apenas no startup do worker |
| LEGACY_QUARANTINED | 4 | Rotas admin-only de migração manual |
| TEST_ONLY / FALSE_POSITIVE | 6 | Apenas em arquivos de teste ou regex de detecção |

### Resíduos confirmados (exigem migration)

| ID | Arquivo | Lacuna | Migration necessária |
|---|---|---|---|
| R01 | `services/sigvoos-frms.ts` | `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos` — 3 tabelas base + 4 índices sem migration histórica anterior à `0354` | `0387_integracoes_sigvoos_base_tables.sql` (criada no Sprint Z1 e aplicada em produção na Sprint R04.5). **Status: 0387_APPLIED_IN_PRODUCTION_BUT_CHAIN_0354_STILL_NEEDS_RECONCILIATION.** Doc: `AIRTRUST_SIGVOOS_DDL_R01_READINESS_v0_5.md` e `AIRTRUST_SIGVOOS_MIGRATION_CHAIN_AUDIT_v0_5.md` |
| R03 | `services/treinamentos-planejados-integration.ts` | `solicitacoes_treinamento.treinamento_planejado_id`, `status_pre_agendamento`, `idx_solicitacoes_treinamento_planejado` — 2 colunas + 1 índice parcial | `0386_solicitacoes_treinamento_planejado_link.sql` (`MIGRATION_VERSIONED_RUNTIME_FALLBACK_REMOVED_PENDING_APPLY`) |
| R04 | ~~`utils/auto-migration-documentos.ts`~~ (DELETED) + ~~`runtime/api-bootstrap.ts`~~ (LIMPO) | `documentos` — baseline parcial/legada confirmada; migration `0388` aplicada em produção, probe pós-apply concluído, bootstrap runtime removido na Sprint R04.6 | `0388_documentos_canonical_schema.sql` — RESOLVED (Sprint R04.7, 2026-06-04). Deploy Worker/API APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS (3/3). |

### Novos residuais encontrados (não documentados anteriormente)

| ID | Arquivo | DDL | Cobertura |
|---|---|---|---|
| R05 | `routes/qualificacoes/tipos.ts` | ALTER TABLE (2 colunas) | `0317` — coberto ✓ |
| R06 | `routes/qualificacoes/historico-helpers.ts` | ALTER TABLE (5 colunas em `qualificacoes_historico`) | `0173` + migrations antigas — coberto ✓ |
| R07 | `routes/qualificacoes/historico-helpers.ts` | ALTER TABLE (2 colunas em `qualificacoes_tipos`) | `0317` — coberto ✓ |
| R08 | `routes/qualificacoes/historico-helpers.ts` | ALTER TABLE + CREATE INDEX em `modelos_aeronave` | `0183` — coberto ✓ |
| R09 | `routes/qualificacoes/shared.ts` | ALTER TABLE dinâmico | ✅ RESOLVIDO (Sprint R09, 2026-06-03) — DDL removido; `renovada`=0200+, `local`/`modalidade`=removidas por 0200; active path (historico-helpers.ts) já é no-op |
| R10 | `routes/simuladores-modelos.ts` | ALTER TABLE + CREATE INDEX em `modelos_sessao` | `0184` — coberto ✓ |

### Ordem revisada (4 fases)

| Fase | Migration | Remoção | Risco |
|---|---|---|---|
| Pré-Fase | Nenhuma | Concluída no Sprint W — removidos R02, R05, R06, R07, R08, R10 | BAIXO |
| Gate X.0 | Probe read-only aprovado para `solicitacoes_treinamento` | Decidir formato real da M1 | MÉDIO |
| Fase 1 | M1 — `0386` (link Treinamentos) | Remover R03 | MÉDIO |
| Fase 2 | R09 — CONCLUÍDA (Sprint R09, 2026-06-03) | ALTER TABLE removido de `shared.ts`; colunas confirmadas: `renovada`=migration, `local`/`modalidade`=removidas por 0200 | — |
| Fase 3 | R04 bootstrap removal ✅ | R04 bootstrap removido (R04.6) + deploy + smoke PASS (R04.7) — **RESOLVED** | RESOLVED |
| Fase 4 | R01 baseline/chain plan | Destravar `0354 -> 0387` depois de `0387` já aplicada em produção, antes de qualquer remoção do fallback | ALTO |

### Documentos produzidos

- `AIRTRUST_RUNTIME_DDL_RESIDUAL_DESIGN_v0_5.md` — inventário completo, classificação, lacunas, ordem
- `AIRTRUST_DDL_RESIDUAL_MIGRATION_READINESS_v0_5.md` — pré-condições, migrations detalhadas, validação, rollback

### Status na matriz

DDL_RUNTIME = PARTIAL (R03 = RESOLVED; R09 = RESOLVED Sprint R09; R04 = RESOLVED Sprint R04.7 2026-06-04; R01 = MIGRATION_APPLIED_CHAIN_RECONCILIATION_REQUIRED).

**Addendum Sprint R01 Chain Reconciliation (2026-06-03):** achado de bloqueio de replay limpo formalizado. `0354` falha em cadeia limpa (`no such table: integracoes_sigvoos_config`); `0387` aplicada em produção não resolve cadeia. Testes locais 8/8 PASS. `ensureSigvoosTables()` preservado. DDL runtime remanescente: apenas R01. Doc de decisão: `docs/AIRTRUST_SIGVOOS_MIGRATION_CHAIN_RECONCILIATION_v0_5.md`.

**Addendum Sprint R01 Baseline Strategy (2026-06-03):** estratégia de resolução definida. Editar `0354` rejeitado; `0389` isolada insuficiente. Curto prazo: `scripts/bootstrap-new-environment.sql`. Longo prazo: squash/rebaseline. `ensureSigvoosTables()` preservado. Próxima fase: R01-bootstrap. Doc de estratégia: `docs/AIRTRUST_SIGVOOS_R01_BASELINE_STRATEGY_v0_5.md`.
