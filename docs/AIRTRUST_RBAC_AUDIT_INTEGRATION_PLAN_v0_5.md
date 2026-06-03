# AirTrust - RBAC Audit Integration Plan v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `c3328b59ab4d683d94a7fcbb4cfb30ceec77461f`
**Modo:** Integracao conceitual com Audit Trail/LGPD v2.

## Objetivo

Definir como eventos de RBAC, papeis de plataforma e sessoes de suporte devem se integrar ao Audit Trail/LGPD v2.

## eventos RBAC que devem gerar audit

- `PLATFORM_ROLE_GRANTED`
- `PLATFORM_ROLE_REVOKED`
- `TENANT_ROLE_CHANGED`
- `BREAK_GLASS_REQUESTED`
- `BREAK_GLASS_APPROVED`
- `BREAK_GLASS_DENIED`

## eventos de suporte que devem gerar audit

- `SUPPORT_SESSION_STARTED`
- `SUPPORT_SESSION_ENDED`
- `SUPPORT_TENANT_VIEW`
- `SUPPORT_SENSITIVE_VIEW_DENIED`
- `SUPPORT_MUTATION_DENIED`

## campos obrigatorios do Audit Trail v2

- `actor_user_id`
- `actor_role`
- `actor_type`
- `empresa_id`
- `target_empresa_id` quando houver acesso cross-tenant
- `event_category`
- `event_action`
- `request_id`
- `correlation_id` quando aplicavel
- `support_reason` quando aplicavel
- `risk_level`
- `retention_class`
- `metadata_sanitized_json`

## correlation_id/request_id

- `request_id` obrigatorio em requests HTTP autenticadas.
- `correlation_id` obrigatorio em fluxos aprovativos, break-glass e processos multi-step.

## support_reason obrigatorio

Obrigatorio em:

- `SUPPORT_SESSION_STARTED`
- `SUPPORT_TENANT_VIEW`
- qualquer leitura sensivel por suporte
- qualquer break-glass solicitado

## risk_level por evento

- `PLATFORM_ROLE_GRANTED`: critical
- `PLATFORM_ROLE_REVOKED`: high
- `SUPPORT_SESSION_STARTED`: high
- `SUPPORT_SESSION_ENDED`: medium
- `SUPPORT_TENANT_VIEW`: high
- `SUPPORT_SENSITIVE_VIEW_DENIED`: high
- `SUPPORT_MUTATION_DENIED`: critical
- `TENANT_ROLE_CHANGED`: high
- `BREAK_GLASS_REQUESTED`: critical
- `BREAK_GLASS_APPROVED`: critical
- `BREAK_GLASS_DENIED`: high

## retention_class

Sugestao inicial:

- eventos de papel de plataforma: `SECURITY_LONG`
- sessoes de suporte: `SUPPORT_CONTROLLED`
- break-glass: `SECURITY_LONG`
- negacoes sensiveis: `SECURITY_LONG`

## metadata permitida

- ticket ou referencia operacional curta
- tipo de papel concedido/revogado
- tenant alvo
- rota ou modulo
- resultado da autorizacao

## metadata proibida

- senha
- token
- cookie
- payload bruto de permissao
- dados medicos
- conteudo de documento
- stack trace client-facing
