# AirTrust — Audit Trail v2 Migration Plan v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `78509f9ea40b2bf0a50d9be0f1923f1ea66f5bdd`
**Modo:** Migration de schema v2 versionada, writer canônico implementado e readiness local/staging documentada. Nenhuma migration foi executada em produção.

## 1. Estado da implementação

- Migration criada: `worker-airtrust/migrations/0385_audit_events_v2.sql`.
- Tabela canônica nova: `audit_events_v2`.
- Estratégia: estrutura aditiva, sem `ALTER`, `DROP`, `RENAME`, trigger ou backfill.
- Compatibilidade: `auditoria`, `audit_logs` e `auditoria_avancada_v2` permanecem intactas.
- Runtime: `recordAuditEventV2()` foi criado e o dual-write mínimo foi integrado no helper de cursos LMS.
- Rollout: `AUDIT_EVENTS_V2_DUAL_WRITE` permanece desabilitada por padrão enquanto o schema não estiver aplicado em ambiente aprovado.
- Activation readiness: runners locais seguros versionados; execução real depende de `AIRTRUST_ALLOW_AUDIT_V2_LOCAL_CHECK=YES` e target aprovado.
- Dados reais: nenhum dado foi criado, alterado ou migrado.
- Produção: schema não aplicado e nenhum D1 remoto executado.

O objetivo permanece substituir gradualmente o uso disperso das trilhas legadas, preservando rastreabilidade, LGPD e operação multiempresa.

## 2. Campos novos necessários

Campos mínimos propostos para a tabela/contrato canônico:

- `id`
- `created_at`
- `empresa_id`
- `target_empresa_id`
- `actor_user_id`
- `actor_empresa_id`
- `actor_role`
- `actor_type`
- `support_mode`
- `support_reason`
- `request_id`
- `correlation_id`
- `ip_hash`
- `user_agent_hash`
- `event_category`
- `event_action`
- `entity_type`
- `entity_id`
- `risk_level`
- `success`
- `failure_reason_code`
- `metadata_sanitized_json`
- `retention_class`

## 3. Índices versionados

Índices mínimos incluídos na migration:

- `idx_audit_events_v2_empresa_created` em `empresa_id, created_at`
- `idx_audit_events_v2_target_empresa_created` em `target_empresa_id, created_at`
- `idx_audit_events_v2_actor_created` em `actor_user_id, created_at`
- `idx_audit_events_v2_request` em `request_id`
- `idx_audit_events_v2_category_created` em `event_category, created_at`

Índices adicionais para `correlation_id`, entidade, suporte ou risco ficam condicionados a queries reais e volume estimado, evitando over-indexing em D1.

## 4. Estratégia backward-compatible

Estratégia adotada:

1. criar a nova estrutura canônica em tabela separada.
2. manter os writers legados ativos.
3. introduzir adapter/bridge central para novos call sites críticos.
4. migrar readers e consultas operacionais aos poucos.
5. só então reduzir dependência dos writers antigos.

Objetivo: evitar big-bang e permitir rollback por feature flag/dual-write controlado.

## 5. Rollout por fases

### Fase 1 — Schema aditivo ✅ VERSIONADO

- adicionar a estrutura canônica `audit_events_v2`.
- validar tabela, campos, índices, defaults e coexistência com `audit_logs` localmente.
- não aplicar em produção nesta sprint.

### Fase 2 — Writer central + dual-write ⚠️ PARCIAL

- writer central criado sem retirar os antigos.
- dual-write mínimo integrado em cursos LMS, controlado por flag e sem payload legado.
- ativação operacional depende de aplicação aprovada do schema e monitoramento de paridade.
- auth/impersonação.
- admin operations.
- assets privados.
- exports/downloads.
- suporte.
- FRMS sensível.

### Fase 3 — Cobertura ampla

- migrar rotas legadas com `registrarAuditoria`.
- migrar usos dispersos de `audit_logs`.
- encapsular inserções diretas em `auditoria_avancada_v2`.

### Fase 4 — Consolidação

- definir readers oficiais.
- revisar retenção e purge.
- planejar depreciação dos writers antigos.

## 6. Dry-run

Antes de qualquer execução real:

- revisar schema em branch isolada.
- validar diffs de payload sanitizado com fixtures sintéticos.
- testar dual-write em ambiente controlado.
- medir impacto de índices e tamanho de metadata.
- confirmar que nenhum dado proibido está entrando no writer novo.
- recusar produção e staging sem runner aprovado.

## 7. Testes necessários

- teste de migration/schema local em `worker-airtrust/src/__tests__/migrations/audit-events-v2-schema.test.ts`.
- testes unitários do writer em `worker-airtrust/src/__tests__/audit/audit-events-v2-writer.test.ts`.
- teste de dual-write mínimo e isolamento de falha em `worker-airtrust/src/__tests__/routes/lms-cursos-beta-contract.test.ts`.
- teste de readiness/flag default off em `worker-airtrust/src/__tests__/audit/audit-events-v2-activation-readiness.test.ts`.
- testes unitários do sanitizador e do builder de contexto.
- testes de contrato por categoria crítica.
- testes de tenant isolation para `empresa_id` e `target_empresa_id`.
- testes de correlação `request_id`/`correlation_id`.
- testes de acesso de suporte com `support_reason`.
- testes de retenção/classificação.
- testes de rollback e de coexistência com readers legados.

## 8. Plano de rollback

- enquanto a migration não for aplicada, rollback é a não execução do schema.
- após aplicação futura, preservar `audit_events_v2` sem uso se o rollout for abortado.
- manter readers legados funcionais durante rollout inicial.
- permitir desligar dual-write e voltar ao writer legado se houver regressão.
- não remover colunas/tabelas antigas na primeira entrega.
- versionar scripts de verificação e comparar contagem de eventos entre writer novo e legado.

## 9. Riscos

- aumento de custo/tamanho do storage por dual-write.
- divergência temporária entre writers.
- vazamento de payload excessivo se a allowlist por evento for mal definida.
- índices excessivos degradando escrita em D1.
- falsa sensação de compliance se retenção e suporte forem desenhados sem validação jurídica.

## 10. Critérios de autorização

A sprint de implementação só deve começar quando todos os itens abaixo estiverem autorizados:

- revisão jurídica do draft de retenção.
- aprovação do modelo de suporte auditável.
- definição do contrato canônico final.
- plano de rollback revisado.
- ambiente de teste aprovado para dual-write e data quality.

## Conclusão

O schema canônico e o writer v2 estão versionados e testados. O dual-write mínimo está integrado, mas desabilitado por padrão até a aplicação do schema em ambiente aprovado. A próxima fase recomendada é ativar a flag de forma controlada, validar paridade e só então ampliar a cobertura.
