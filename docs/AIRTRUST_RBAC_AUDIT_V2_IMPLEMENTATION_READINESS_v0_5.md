# AirTrust - RBAC + Audit Trail v2 Implementation Readiness Gate

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `32ca1f278a81a610fbc3c9821eddf0c5518dbb69`
**Modo:** Readiness/documentacao. Nenhuma migration criada, nenhum schema alterado, nenhum runtime alterado.

## 1. Objetivo

Consolidar os Sprints O e P em uma ordem unica, segura e implementavel para Audit Trail v2 e RBAC/Suporte v2.

## 2. Estado atual

O runtime atual ainda opera com:

- tres writers de auditoria (`registrarAuditoria`, `logAudit`, `logAuditoria` no FRMS);
- `request_id` apenas em metadata/contexto parcial, nao em contrato canonico persistido;
- fallback legado `userId === 1` em `tenant.ts` e `auth.ts`;
- `isPlatformAdminContext()` dependente de `empresaCodigo = airtrust` e do fallback legado;
- `requireRole()` ainda limitado ao conjunto pequeno de roles de tenant;
- ausencia de `platform_admin` e `support_read_only` persistidos;
- ausencia de `support_reason` canonico no schema/runtime atual.

## 3. Designs disponiveis

Designs de Audit Trail/LGPD v2:

- `AIRTRUST_AUDIT_TRAIL_LGPD_V2_DESIGN_v0_5.md`
- `AIRTRUST_AUDIT_TRAIL_V2_MIGRATION_PLAN_v0_5.md`
- `AIRTRUST_AUDIT_EVENT_TAXONOMY_v0_5.md`
- `AIRTRUST_SUPPORT_ACCESS_AUDIT_MODEL_v0_5.md`

Designs de RBAC/Suporte v2:

- `AIRTRUST_RBAC_SUPPORT_V2_DESIGN_v0_5.md`
- `AIRTRUST_PLATFORM_ROLES_MODEL_v0_5.md`
- `AIRTRUST_SUPPORT_READ_ONLY_MODEL_v0_5.md`
- `AIRTRUST_RBAC_V2_MIGRATION_PLAN_v0_5.md`
- `AIRTRUST_RBAC_AUDIT_INTEGRATION_PLAN_v0_5.md`

## 4. Dependencias criticas

1. `support_read_only` nao deve entrar em runtime antes de existir trilha canonica capaz de registrar `support_reason`, `target_empresa_id`, `request_id` e negacoes.
2. Concessao/revogacao de `platform_admin` e sessoes de suporte precisam nascer ja cobertas pelo writer canonico para evitar uma janela sem trilha confiavel.
3. O dual-read de RBAC depende de uma janela de observacao com logs de divergencia e eventos v2 para comparar caminho novo e caminho legado.
4. O fallback `userId === 1` nao pode ser removido antes de:
   - papel persistido criado;
   - dual-read estavel;
   - rollback simples e imediato.
5. Validacao juridica de retencao continua pendente, mas nao impede a preparacao tecnica backward-compatible do schema de auditoria.

## 5. Ordem recomendada

Ordem recomendada para reduzir risco:

1. **Fase 1 - Audit Trail v2 schema backward-compatible**
2. **Fase 2 - Audit writer canonico com dual-write seguro**
3. **Fase 3 - Platform roles schema**
4. **Fase 4 - RBAC dual-read sem enforcement**
5. **Fase 5 - `support_read_only` enforcement**
6. **Fase 6 - remocao controlada de `userId===1`**
7. **Fase 7 - cleanup e hardening**

Justificativa principal: o Audit Trail v2 e o prerequisito de seguranca para que a primeira concessao de papel de plataforma, a primeira sessao de suporte e a primeira divergencia de dual-read ja nascam auditadas.

## 6. O que pode ser implementado primeiro

Pode entrar primeiro:

- tabela/contrato canonico de auditoria em modo aditivo;
- indices e campos dedicados para `empresa_id`, `target_empresa_id`, `request_id`, `correlation_id`, `support_reason`, `retention_class`;
- writer central/adapters sem desligar writers legados;
- dual-write controlado para auth, admin, assets, suporte e exportacoes;
- plataforma de eventos RBAC/audit antes do enforcement de suporte.

## 7. O que nao pode ser implementado ainda

Nao deve entrar antes das fases preparatorias:

- enforcement de `support_read_only` em runtime sem writer canonico;
- remocao de `userId === 1` sem dual-read estavel;
- ativacao de `support_elevated` ou break-glass write;
- deprecacao de writers legados na primeira onda;
- limpeza destrutiva de tabelas ou colunas antigas.

## 8. Decisoes pendentes

- nome final da tabela canonica de auditoria;
- allowlist final de `metadata_sanitized_json` por categoria;
- politica juridica definitiva de retencao por `retention_class`;
- forma final de registrar divergencia do dual-read RBAC;
- janela operacional e feature flags de rollout por fase;
- threshold operacional para abortar rollout de dual-write ou dual-read.

## 9. Criterios de entrada para implementacao

- schema aditivo revisado por engenharia senior;
- rollout plan e rollback plan aprovados;
- matriz de testes de RBAC + audit aceita;
- ambiente de validacao pronto para dual-write e dual-read;
- decisao explicita de comecar por Audit Trail v2 antes do enforcement RBAC.

## 10. Criterios de saida

A fase de readiness so e considerada concluida se houver:

- ordem clara de implementacao;
- plano faseado;
- matriz de testes;
- rollback plan;
- definicao explicita de qual sprint tecnica vem primeiro;
- nenhum runtime/schema/dado real alterado nesta etapa.

## 11. Recomendacao final

**Comecar pela implementacao do Audit Trail v2, nao pelo RBAC/Suporte v2.**

Sequencia recomendada:

- **Sprint R:** Audit Trail v2 schema backward-compatible + canonical writer foundation.
- **Sprint S:** Platform roles schema + RBAC dual-read shadow mode.
- **Sprint T:** `support_read_only` enforcement + inicio da remocao controlada do fallback legado, somente se o shadow mode estiver estavel.

Fases que exigem `GPT-5.5 Altissimo`:

- schema de auditoria;
- canonical writer;
- schema de platform roles;
- dual-read RBAC;
- remocao de `userId===1`.

Fases que podem usar `GPT-5.4`:

- ampliacao de testes;
- documentacao operacional;
- evidencia de rollout;
- validacoes read-only e smoke.
