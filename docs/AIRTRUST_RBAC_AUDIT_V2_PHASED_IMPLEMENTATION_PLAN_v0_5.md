# AirTrust - RBAC + Audit Trail v2 Phased Implementation Plan

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `f4640b3eb79707e2f7a377f7c78692a9aa55f575`
**Modo:** Plano faseado com Fase 1 versionada localmente. Nenhuma migration foi executada em produção.

## 1. Fase 0 - Preconditions

- **Objetivo:** travar precondicoes operacionais, juridicas minimas e de rollback antes de tocar schema ou runtime.
- **Arquivos provaveis:** `docs/*`, runbooks operacionais, validacoes de release.
- **Migrations provaveis:** nenhuma.
- **Testes obrigatorios:** checklist de rollout, validacao de feature flags, dry-run da matriz de testes.
- **Rollback:** nao aplicavel; fase documental.
- **Risco:** medio.
- **Modelo recomendado:** `GPT-5.4` para consolidacao e `GPT-5.5 Altissimo` para revisao final de ordem/faseamento.
- **Deploy:** nao.
- **Criterio de aceite:** ordem de fases, abort conditions e gates de entrada aprovados.

## 2. Fase 1 - Audit Trail v2 schema

- **Status:** `SCHEMA_READY` - migration `0385_audit_events_v2.sql` e testes locais criados.
- **Objetivo:** introduzir estrutura canonica de auditoria em modo aditivo e backward-compatible.
- **Arquivos implementados:** `worker-airtrust/migrations/0385_audit_events_v2.sql` e `worker-airtrust/src/__tests__/migrations/audit-events-v2-schema.test.ts`.
- **Migration:** nova tabela `audit_events_v2`; indices minimos para empresa, target empresa, ator, request e categoria.
- **Testes implementados:** apply local; campos; indices; insert sanitizado; defaults; no sensitive fields; coexistencia com `audit_logs`.
- **Rollback:** nao executar a migration ou, apos aplicacao futura, preservar o schema aditivo sem uso; manter writers antigos e nao remover tabelas legadas.
- **Risco:** alto.
- **Modelo recomendado:** `GPT-5.5 Altissimo`.
- **Deploy:** nao realizado nesta sprint.
- **Criterio de aceite:** schema aditivo versionado e validado sem alterar comportamento do auth/RBAC. Aplicacao em ambiente aprovado continua pendente.

## 3. Fase 2 - Audit writer canonicalization

- **Status:** proxima fase recomendada; ainda nao implementada.
- **Objetivo:** centralizar escrita de eventos criticos no writer canonico com dual-write controlado.
- **Arquivos provaveis:** `worker-airtrust/src/utils/auditoria.ts`, `worker-airtrust/src/utils/db.ts`, `worker-airtrust/src/lib/frms/db-service-shared.ts`, `worker-airtrust/src/lib/audit/context.ts`, call sites criticos em auth/admin/assets/FRMS.
- **Migrations provaveis:** nenhuma nova obrigatoria alem da Fase 1.
- **Testes obrigatorios:** parity tests writer novo vs legado; `request_id`; `correlation_id`; `support_reason`; `target_empresa_id`; negacoes auditadas; no PII.
- **Rollback:** desligar dual-write por flag e manter apenas writer legado.
- **Risco:** alto.
- **Modelo recomendado:** `GPT-5.5 Altissimo`.
- **Deploy:** sim.
- **Criterio de aceite:** auth, admin, assets e FRMS gravando eventos v2 sem quebrar as trilhas legadas.

## 4. Fase 3 - Platform roles schema

- **Objetivo:** criar base persistida para `platform_admin` e papeis de suporte sem remover compatibilidade legada.
- **Arquivos provaveis:** migrations futuras; `worker-airtrust/src/middleware/tenant.ts`; `worker-airtrust/src/routes/auth.ts`; rotas administrativas de plataforma.
- **Migrations provaveis:** `platform_roles`, `user_platform_roles`, `support_access_grants`, `support_access_sessions`.
- **Testes obrigatorios:** grants/revokes; sem confusao entre papel de tenant e papel de plataforma; auditoria obrigatoria de grant/revoke.
- **Rollback:** manter caminho legado `userId===1` ativo; desabilitar consultas do papel persistido.
- **Risco:** alto.
- **Modelo recomendado:** `GPT-5.5 Altissimo`.
- **Deploy:** sim.
- **Criterio de aceite:** papel persistido criado sem impactar login, selecao de empresa ou admin atual.

## 5. Fase 4 - RBAC dual-read

- **Objetivo:** consultar papel persistido e caminho legado em shadow mode antes de qualquer enforcement novo.
- **Arquivos provaveis:** `worker-airtrust/src/middleware/tenant.ts`, `worker-airtrust/src/routes/auth.ts`, possivelmente `worker-airtrust/src/middleware/rbac.ts`.
- **Migrations provaveis:** nenhuma adicional obrigatoria.
- **Testes obrigatorios:** compatibilidade do operador legado; divergencia registrada; `platform_admin` nao herdado de `tenant_admin`; acesso negado a papel desconhecido.
- **Rollback:** desligar dual-read e voltar ao caminho legado.
- **Risco:** altissimo.
- **Modelo recomendado:** `GPT-5.5 Altissimo`.
- **Deploy:** sim.
- **Criterio de aceite:** divergencia baixa/explicada e nenhum incidente de autenticacao ou tenant resolution.

## 6. Fase 5 - support_read_only enforcement

- **Objetivo:** ativar `support_read_only` tenant-scoped com `support_reason` obrigatorio e negacao total de mutacao.
- **Arquivos provaveis:** `worker-airtrust/src/middleware/rbac.ts`, `worker-airtrust/src/middleware/tenant.ts`, rotas sensiveis de assets, documentos, export e diagnostico.
- **Migrations provaveis:** nenhuma alem da base de support grants/sessions ja criada.
- **Testes obrigatorios:** sessao iniciada/encerrada; `support_reason` obrigatorio; leitura sensivel auditada; mutacao negada; cross-tenant denied.
- **Rollback:** desativar enforcement de suporte e voltar a negar o papel novo enquanto o legado permanece inalterado.
- **Risco:** alto.
- **Modelo recomendado:** `GPT-5.5 Altissimo`.
- **Deploy:** sim.
- **Criterio de aceite:** suporte somente read-only, auditado desde o primeiro acesso e sem write paths abertos.

## 7. Fase 6 - userId===1 fallback removal

- **Objetivo:** remover o fallback legado somente depois da estabilizacao do dual-read e do enforcement novo.
- **Arquivos provaveis:** `worker-airtrust/src/middleware/tenant.ts`, `worker-airtrust/src/routes/auth.ts`, `worker-airtrust/src/routes/empresas.ts`, testes de fronteira RBAC.
- **Migrations provaveis:** nenhuma adicional obrigatoria.
- **Testes obrigatorios:** operador legado migrado; login; selecao de empresa; rotas de plataforma; rollback para caminho antigo; ausencia de dependencias residuais do `userId===1`.
- **Rollback:** religar caminho legado imediatamente e preservar grants persistidos para reavaliacao posterior.
- **Risco:** altissimo.
- **Modelo recomendado:** `GPT-5.5 Altissimo`.
- **Deploy:** sim.
- **Criterio de aceite:** nenhuma rota de plataforma dependendo do fallback numerico e nenhum incidente de acesso administrativo.

## 8. Fase 7 - cleanup and hardening

- **Objetivo:** consolidar readers, reduzir dependencia dos writers antigos e endurecer observabilidade.
- **Arquivos provaveis:** readers de auditoria, dashboards internos, docs operacionais, alertas.
- **Migrations provaveis:** apenas depois de longa janela estavel, e nunca na primeira onda.
- **Testes obrigatorios:** dashboards, queries por `request_id`, `correlation_id`, `empresa_id`, suporte e break-glass; cleanup sem perda de historico.
- **Rollback:** nao apagar nada; apenas desativar readers novos se necessario.
- **Risco:** medio/alto.
- **Modelo recomendado:** `GPT-5.5 Altissimo` para cleanup sensivel e `GPT-5.4` para observabilidade/readbacks.
- **Deploy:** sim.
- **Criterio de aceite:** trilha canonica operacional, readers estaveis e ausencia de dependencia critica em writers legados.

## 9. Rollout controls

- feature flag para dual-write;
- feature flag para dual-read;
- feature flag para enforcement de suporte;
- shadow metrics de divergencia;
- abortar rollout ao primeiro sinal de:
  - evento sem `empresa_id` quando obrigatorio;
  - suporte sem `support_reason`;
  - diferenca de autorizacao entre caminho novo e legado;
  - falha recorrente do writer canonico.

## 10. Explicit non-goals

- nao implementar `support_elevated` inicial;
- nao fazer big-bang de readers/writers;
- nao remover tabelas antigas na primeira entrega;
- nao remover `userId===1` antes do final;
- nao misturar esta trilha com DDL residual, performance audit ou refatoracao ampla.
