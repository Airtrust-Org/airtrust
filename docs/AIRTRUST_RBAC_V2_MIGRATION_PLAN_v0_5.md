# AirTrust - RBAC v2 Migration Plan v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `c3328b59ab4d683d94a7fcbb4cfb30ceec77461f`
**Modo:** Plano conceitual. Nenhuma migration foi criada.

## 1. Objetivo

Planejar a migracao futura para um RBAC v2 com papeis de plataforma persistidos e suporte tenant-scoped auditavel.

## 2. Tabelas/campos provaveis

Entidades conceituais provaveis:

- `platform_roles`
- `user_platform_roles`
- `support_access_grants`
- `support_access_sessions`
- `tenant_roles`, se o modelo futuro exigir separar melhor o papel local

## 3. Papeis persistidos

Minimos:

- `platform_admin`
- `support_read_only`
- `support_elevated` futuro

## 4. Associacao usuario-plataforma

O papel de plataforma deve ser persistido separadamente do vinculo de tenant para evitar ambiguidade com `usuarios_empresas`.

## 5. Associacao usuario-tenant

O vinculo local do usuario com empresa permanece necessario para operacao normal do produto.

O modelo futuro deve permitir:

- multiplos tenants por usuario.
- papel local distinto do papel de plataforma.
- separacao clara entre governanca da plataforma e negocio do tenant.

## 6. Migracao do userId===1

Plano conceitual:

1. identificar o operador legado atual.
2. conceder papel persistido equivalente.
3. habilitar dual-read.
4. medir compatibilidade.
5. remover o fallback legado apenas depois do rollout aprovado.

## 7. Backward compatibility

Durante a transicao:

- manter fallback legado temporario.
- nao quebrar login, troca de tenant ou admin atual.
- permitir auditoria comparativa entre caminhos novo e legado.

## 8. Fase de dual-read

Leitura conceitual:

- consultar papel persistido primeiro.
- se ausente, usar fallback legado temporario.
- registrar divergencias durante a janela de transicao.

## 9. Fase de enforcement

Depois do dual-read:

- tornar papel persistido a fonte primaria.
- exigir `support_reason` e sessao aprovada para suporte.
- negar papeis desconhecidos e escopos ausentes.

## 10. Remocao do fallback legado

So depois de:

- dual-read estavel.
- auditoria dos fluxos administrativos.
- plano de rollback revisado.
- aprovacao operacional.

## 11. Testes necessarios

- compatibilidade do operador legado.
- negacao de `tenant_admin` como `platform_admin`.
- sessao de suporte read-only com tenant valido.
- negacao de suporte sem escopo ou justificativa.
- rollback para fallback legado.

## 12. Rollback

- manter caminho legado durante a fase inicial.
- permitir desligar enforcement novo sem quebrar autenticacao atual.
- nao remover estruturas antigas na primeira onda.

## 13. Criterios de autorizacao

- aprovacao de schema sensivel por revisao senior.
- plano de rollback aprovado.
- integracao com Audit Trail v2 definida.
- janela operacional autorizada.

## Observacao final

Este documento e conceitual. Nenhuma migration real foi criada neste sprint.
