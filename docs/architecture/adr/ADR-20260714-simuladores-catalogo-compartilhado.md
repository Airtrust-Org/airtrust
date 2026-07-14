# ADR-20260714 — MANTER_SIMULADORES_COMO_CATALOGO_COMPARTILHADO

Status: Aceita

Data: 2026-07-14

## Contexto

A auditoria read-only de produção confirmou que `simuladores` opera como catálogo compartilhado sem `empresa_id`, enquanto o tenant scope efetivo das fichas e sessões é garantido nas tabelas de agendamento, participação, atribuição curricular e fichas. O código em `origin/main` já contém fallback explícito para esse estado real.

## Decisão

Decisão formal: `MANTER_SIMULADORES_COMO_CATALOGO_COMPARTILHADO`.

Não será introduzida uma suposição de `simuladores.empresa_id` como pré-condição para leitura ou escrita do fluxo atual. O contrato de schema V2 passa a registrar explicitamente que:

- `simuladores` é catálogo compartilhado;
- `sessoes_participantes` não carrega `empresa_id`;
- `modelos_sessao` expõe `tipo_sessao_id`, não `tipo_sessao_codigo`;
- presença do arquivo de migration no repositório não prova aplicação no ledger real.

## Consequências

- o drift atual vira baseline formal, não hipótese implícita;
- o ledger histórico fica congelado para produção;
- mudanças futuras de schema passam a exigir alteração individual versionada em `worker-airtrust/schema-v2/changes/`;
- qualquer tentativa de reintroduzir `run_migrations=true` em produção passa a falhar por hard-block.
