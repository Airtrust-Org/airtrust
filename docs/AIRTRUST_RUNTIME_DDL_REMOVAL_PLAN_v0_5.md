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
| `worker-airtrust/src/services/treinamentos-planejados-integration.ts` | `treinamentos_planejados`, `treinamentos_participantes`, `ALTER TABLE solicitacoes_treinamento ADD COLUMN treinamento_planejado_id`, `status_pre_agendamento`, índice `idx_solicitacoes_treinamento_planejado` | sync em writes de treinamento planejado | `0172_create_treinamentos_planejados.sql` cobre tabelas base; nenhuma migration encontrada para as colunas/índice de link em `solicitacoes_treinamento` | B/C | mantido, requer migration futura |
| `worker-airtrust/src/services/sigvoos-frms.ts` | `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos`, `sigvoos_mapeamento_manual`, `frms_jornada_pendente` + índices | leitura/config/importação SIGVOOS e reconciliação FRMS | `0352_sigvoos_frms_pendencias_e_enriquecimento.sql` cobre apenas `sigvoos_mapeamento_manual` e `frms_jornada_pendente`; `0354_auditoria_critica_schema_hardening.sql` adiciona `notificar_falha_email`; nenhuma migration encontrada para criação das tabelas `integracoes_sigvoos_*` | B/C | mantido, requer migration futura |
| `worker-airtrust/src/runtime/api-bootstrap.ts` + `worker-airtrust/src/utils/auto-migration-documentos.ts` | `documentos` + índices | bootstrap de runtime, não por request | cobertura legada/mista; há recriação e índices parciais em `0136_rebuild_all_funcionarios_old_refs.sql`, `0137_fix_certificados_completo.sql`, `0138_certificados_improvements.sql`, mas não há correspondência clara para todos os índices criados pelo helper | B/E | não tocado nesta fase |
| `worker-airtrust/src/routes/qualificacoes/tipos.ts` | colunas `carga_horaria_inicial`, `carga_horaria_recorrente` | reads/writes de tipos de qualificação | `0317_split_carga_horaria_and_tipo_treinamento.sql` | A | fora do escopo desta fase |
| `worker-airtrust/src/routes/qualificacoes/historico.ts` e `historico-write.ts` + helpers | colunas em `qualificacoes_historico`, `qualificacoes_tipos`, `modelos_aeronave` | writes/read de histórico | `0173_add_status_to_qualificacoes.sql`, `0317_split_carga_horaria_and_tipo_treinamento.sql`, `0183_add_modelo_to_modelos_aeronave.sql` | A | fora do escopo desta fase |
| `worker-airtrust/src/routes/simuladores-modelos.ts` | coluna `modelo_aeronave` em `modelos_sessao` + índice | CRUD de modelos de simulador | `0184_add_modelo_aeronave_to_modelos_sessao.sql` | A | fora do escopo desta fase |

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

- `services/treinamentos-planejados-integration.ts` ainda faz `ALTER TABLE` em `solicitacoes_treinamento`.
  Não há migration encontrada para `treinamento_planejado_id`, `status_pre_agendamento` e `idx_solicitacoes_treinamento_planejado`.
- `services/sigvoos-frms.ts` ainda cria as tabelas `integracoes_sigvoos_*` em runtime.
  A cobertura encontrada em migrations é apenas parcial.
- `runtime/api-bootstrap.ts` / `auto-migration-documentos.ts` permanecem como bootstrap de runtime.
  A cobertura de schema observada para `documentos` é legada e não demonstra equivalência clara com todos os índices do helper.

## Migrations futuras necessárias

1. Criar migration para `solicitacoes_treinamento.treinamento_planejado_id`, `status_pre_agendamento` e `idx_solicitacoes_treinamento_planejado`.
2. Criar migration explícita para `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos` e índices associados.
3. Opcionalmente consolidar `documentos` em migration canônica única e aposentar `auto-migration-documentos.ts`.

## Riscos de remover sem migration

- `services/treinamentos-planejados-integration.ts` pode quebrar writes de sincronização para solicitações já aprovadas se as colunas de link não existirem.
- `services/sigvoos-frms.ts` pode indisponibilizar leitura/escrita de configuração, eventos e mapeamentos SIGVOOS se as tabelas base não estiverem provisionadas.
- `auto-migration-documentos.ts` pode ser a única proteção em ambientes antigos com schema drift.

## Ordem recomendada das próximas fases

1. Migrar `solicitacoes_treinamento` e remover `ensureSolicitacoesTreinamentoLinkSchema`.
2. Migrar todas as tabelas base de SIGVOOS e remover `ensureSigvoosTables` dos serviços e rotas.
3. Canonicalizar `documentos` em migration única e remover `api-bootstrap`/`auto-migration-documentos`.
4. Revisitar `qualificacoes` e `simuladores` para retirar os `ensure*` remanescentes já cobertos por migration.
