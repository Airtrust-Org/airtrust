# AirTrust Audit v2 Activation Readiness v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `78509f9ea40b2bf0a50d9be0f1923f1ea66f5bdd`
**Modo:** Readiness de ativação local/staging do Audit v2 sem ativação em produção, sem D1 remoto e sem alteração de dados reais.

## 1. Estado atual

- A migration `0385_audit_events_v2.sql` existe e permanece aditiva.
- O writer `recordAuditEventV2()` existe e permanece isolado do writer legado.
- O dual-write mínimo existe apenas no helper de cursos LMS.
- `AUDIT_EVENTS_V2_DUAL_WRITE` continua opt-in e desabilitada por padrão.
- Produção segue sem schema aplicado, sem flag ativa e sem backfill.

## 2. Pré-condições para ativar Audit v2

- migration `0385` aplicada em ambiente aprovado não produtivo;
- writer legado ainda presente e funcional;
- testes de schema, writer e dual-write passando;
- evidência sanitizada sem PII, token, cookie, senha, CPF, ASO ou payload bruto;
- rollback por flag validado antes de qualquer ampliação de cobertura.

## 3. Pré-condições de schema

- confirmar que `0385_audit_events_v2.sql` não contém `DROP`, `DELETE` ou `UPDATE`;
- aplicar apenas em ambiente local aprovado ou staging aprovado;
- não executar `wrangler d1 execute --remote`;
- manter `audit_logs`, `auditoria` e `auditoria_avancada_v2` intactas.

## 4. Pré-condições da flag

- `AUDIT_EVENTS_V2_DUAL_WRITE` só pode ser `true` em processo local ou ambiente staging aprovado;
- nunca rastrear a flag ligada em `wrangler.toml`, `wrangler.dev.toml` ou configs versionadas;
- validar primeiro o ponto LMS já coberto por teste;
- não ampliar para auth, assets, documentos, exports, FRMS ou suporte antes da paridade mínima.

## 5. Pré-condições de rollback

- desligar a flag ao primeiro sinal de divergência;
- manter o writer legado como fonte operacional durante toda a validação;
- preservar `audit_events_v2` se o schema já tiver sido aplicado;
- registrar apenas evidência sanitizada de PASS/WARN/FAIL/SKIPPED.

## 6. Critérios para ligar em staging

- ambiente staging aprovado sem acesso remoto manual fora do fluxo autorizado;
- migration aplicada com evidência sanitizada;
- `audit-v2-local-activation-check.sh` e `audit-v2-dual-write-local-check.sh` com `PASS`;
- paridade mínima entre legado e v2 no fluxo LMS;
- falha do writer v2 confirmadamente isolada do fluxo principal.

## 7. Critérios para futura produção

- staging validado com schema aplicado;
- rollback testado por flag;
- validação de paridade mínima concluída;
- revisão jurídica/operacional de retenção e suporte concluída;
- decisão explícita de rollout controlado, ainda sem ampliar eventos sensíveis.

## 8. Critérios de parada

- necessidade de D1 remoto ou alteração manual em produção;
- necessidade de alterar auth, tenant middleware ou RBAC;
- necessidade de migration nova além da `0385`;
- qualquer sinal de PII ou payload proibido em evidência;
- qualquer necessidade de ligar a flag em produção.

## 9. Fora do escopo

- ativar a flag em produção;
- aplicar schema em produção;
- fazer backfill;
- ampliar dual-write para eventos sensíveis;
- alterar auth, tenant middleware, RBAC, R2 real ou Pages.
