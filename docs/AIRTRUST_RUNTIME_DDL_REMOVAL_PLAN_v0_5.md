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
- `runtime/api-bootstrap.ts` / `auto-migration-documentos.ts` permanecem como bootstrap de runtime.
  A Sprint R04.2 executou o probe estrutural remoto read-only e confirmou baseline parcial/legado em produção: `documentos` sem `historico_id`/`sha256_hash`, com `empresa_id DEFAULT 1`, sem índice nominal `idx_documentos_uuid`; `pasta_virtual.documento_id` ausente; `certificados_templates` presente. A Sprint R04.3 fechou o desenho documental da `0388`: incluir apenas `documentos` aderente à baseline real + índices seguros, sem tocar os itens legados controvertidos. Próxima ação: versionar/testar a `0388` conforme esse desenho.

## Migrations futuras necessárias

1. ~~Aplicar `0386_solicitacoes_treinamento_planejado_link.sql`~~ ✅ CONCLUÍDO (Sprint X.5).
2. ~~Deployar o Worker/API sem o fallback de R03~~ ✅ CONCLUÍDO (Sprint X.5).
3. Criar migration explícita para `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos` e índices associados.
4. Consolidar `documentos` em `0388_documentos_canonical_schema.sql` com base na baseline remota já capturada e no desenho aprovado na Sprint R04.3, então aposentar `auto-migration-documentos.ts`.

## Riscos de remover sem migration

- `services/treinamentos-planejados-integration.ts` pode quebrar writes de sincronização para solicitações já aprovadas se as colunas de link não existirem.
- `services/sigvoos-frms.ts` pode indisponibilizar leitura/escrita de configuração, eventos e mapeamentos SIGVOOS se as tabelas base não estiverem provisionadas.
- `auto-migration-documentos.ts` ainda protege ambientes com schema drift; a Sprint R04.2 confirmou que a própria produção atual é parcial/legada e a Sprint R04.3 definiu um desenho conservador para a `0388`, então a remoção só pode ocorrer depois de versionamento, apply e probe pós-migration.

## Ordem recomendada das próximas fases

1. ~~Aplicar `0386_solicitacoes_treinamento_planejado_link.sql`~~ ✅ CONCLUÍDO (Sprint X.5).
2. ~~Deployar o Worker/API com segurança depois da aplicação da migration~~ ✅ CONCLUÍDO (Sprint X.5).
3. Migrar todas as tabelas base de SIGVOOS e remover `ensureSigvoosTables` dos serviços e rotas.
4. Canonicalizar `documentos` em migration única e remover `api-bootstrap`/`auto-migration-documentos`.
5. Revisitar `qualificacoes` e `simuladores` para retirar os `ensure*` remanescentes já cobertos por migration.

---

## Sprint V — DDL Runtime Residual Design (2026-06-03)

**Status:** PARTIAL → R03 RESOLVED, R09 RESOLVED, R04 0388_DESIGN_READY, R01 MIGRATION_CHAIN_BLOCKED_BY_0354. Sprint V executado em modo read-only/docs-only. Sprints X.0–X.4 fizeram probe, versionaram migration e removeram fallback local. Sprint X.5 aplicou `0386` em produção e deployou o Worker/API. Sprint Z0 mapeou integralmente R01 (SIGVOOS). Sprint Z1 criou `0387` e o teste local. Sprint Z1.1 provou a falha da cadeia limpa em `0354`, então o fallback permanece bloqueado por desenho de sequência. Sprint R09 (2026-06-03) removeu o ALTER TABLE de `shared.ts`. Sprint R04.2 (2026-06-03) registrou o probe estrutural remoto de produção para R04 e a Sprint R04.3 fechou o desenho documental da `0388`. Próximo: versionar/testar a `0388` conforme o desenho aprovado.

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
| R01 | `services/sigvoos-frms.ts` | `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos` — 3 tabelas base + 4 índices sem migration | `0387_integracoes_sigvoos_base_tables.sql` (criada no Sprint Z1). **Status: MIGRATION_CHAIN_BLOCKED_BY_0354.** Doc: `AIRTRUST_SIGVOOS_DDL_R01_READINESS_v0_5.md` e `AIRTRUST_SIGVOOS_MIGRATION_CHAIN_AUDIT_v0_5.md` |
| R03 | `services/treinamentos-planejados-integration.ts` | `solicitacoes_treinamento.treinamento_planejado_id`, `status_pre_agendamento`, `idx_solicitacoes_treinamento_planejado` — 2 colunas + 1 índice parcial | `0386_solicitacoes_treinamento_planejado_link.sql` (`MIGRATION_VERSIONED_RUNTIME_FALLBACK_REMOVED_PENDING_APPLY`) |
| R04 | `utils/auto-migration-documentos.ts` + `runtime/api-bootstrap.ts` | `documentos` — produção confirmada como baseline parcial/legada; desenho da migration canônica conservadora já fechado, faltando versionar/testar/aplicar | `0388_documentos_canonical_schema.sql` — 0388_DESIGN_READY (Sprint R04.3, 2026-06-03) |

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
| Fase 3 | M3 — `0388` (Documentos canonico) | Remover R04 — **0388_DESIGN_READY Sprint R04.3** | MEDIO |
| Fase 4 | R01 baseline/chain plan | Destravar `0354 -> 0387` antes de qualquer apply/remocao | ALTO |

### Documentos produzidos

- `AIRTRUST_RUNTIME_DDL_RESIDUAL_DESIGN_v0_5.md` — inventário completo, classificação, lacunas, ordem
- `AIRTRUST_DDL_RESIDUAL_MIGRATION_READINESS_v0_5.md` — pré-condições, migrations detalhadas, validação, rollback

### Status na matriz

DDL_RUNTIME = PARTIAL (R03 = RESOLVED apos apply 0386 + deploy X.5; R09 = RESOLVED Sprint R09 2026-06-03; R04 = 0388_DESIGN_READY Sprint R04.3 2026-06-03; R01 = MIGRATION_CHAIN_BLOCKED_BY_0354 Sprint Z1.1).
