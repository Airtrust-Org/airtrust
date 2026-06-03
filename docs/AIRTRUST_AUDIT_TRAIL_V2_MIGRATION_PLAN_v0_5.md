# AirTrust — Audit Trail v2 Migration Plan v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `e84c08d2c3979ed46026c171d3ca94f72b2e01fd`
**Modo:** Plano de migration futura. Nenhuma migration foi criada neste sprint. Nenhum schema foi alterado.

## 1. Objetivo da migration futura

Criar um contrato canônico de Audit Trail v2 capaz de substituir gradualmente o uso disperso de `auditoria`, `audit_logs` e `auditoria_avancada_v2`, preservando rastreabilidade, LGPD e operação multiempresa.

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

## 3. Índices prováveis

Índices recomendados para a fase de implementação:

- `created_at`
- `empresa_id, created_at`
- `target_empresa_id, created_at`
- `actor_user_id, created_at`
- `request_id`
- `correlation_id`
- `event_category, event_action, created_at`
- `entity_type, entity_id, created_at`
- `support_mode, support_reason, created_at`
- `success, risk_level, created_at`

O desenho final deve evitar over-indexing em D1 e ser validado com volume estimado.

## 4. Estratégia backward-compatible

Estratégia sugerida:

1. criar a nova estrutura canônica.
2. manter os writers legados ativos temporariamente.
3. introduzir adapter/bridge central para novos call sites críticos.
4. migrar readers e consultas operacionais aos poucos.
5. só então reduzir dependência dos writers antigos.

Objetivo: evitar big-bang e permitir rollback por feature flag/dual-write controlado.

## 5. Rollout por fases

### Fase 1 — Schema + writer central

- adicionar a estrutura canônica.
- introduzir writer central ainda sem retirar os antigos.

### Fase 2 — Call sites críticos

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

## 7. Testes necessários

- testes unitários do sanitizador e do builder de contexto.
- testes de contrato por categoria crítica.
- testes de tenant isolation para `empresa_id` e `target_empresa_id`.
- testes de correlação `request_id`/`correlation_id`.
- testes de acesso de suporte com `support_reason`.
- testes de retenção/classificação.
- testes de rollback e de coexistência com readers legados.

## 8. Plano de rollback

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

Este documento é um plano para sprint futura com modelo de raciocínio alto/altíssimo. Nenhuma migration foi criada neste sprint. Nenhum schema foi alterado.
