# AirTrust — Support Access Audit Model v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `e84c08d2c3979ed46026c171d3ca94f72b2e01fd`
**Modo:** Design/documentação. Sem ativar role `support`, sem alterar RBAC runtime, sem migration.

## 1. Objetivo

Definir um modelo conservador e auditável para acesso de suporte em contexto multiempresa.

## 2. Problema atual

O HEAD atual ainda depende de privilégios de plataforma/legado e não possui writer formal para suporte com:

- `support_reason` obrigatório.
- distinção entre empresa do ator e empresa alvo.
- modo de suporte (`read_only`, `break_glass_read`, `approved_write`).
- trilha dedicada para entrada, leitura sensível e saída de tenant.

Sem isso, diagnóstico de suporte corre o risco de parecer acesso administrativo amplo e pouco rastreável.

## 3. Papéis propostos

- `platform_admin`: papel de plataforma persistido e altamente restrito.
- `platform_support`: suporte interno padrão.
- `platform_support_lead`: mesma base do suporte com capacidade adicional de aprovação operacional.
- `system`: jobs internos, sem identidade humana.

Este documento não implementa esses papéis; ele define o contrato esperado para sprint futura.

## 4. Modo suporte read-only

Decisão conservadora:

- suporte deve ser `read_only` por padrão.
- entrada em tenant de cliente deve gerar evento `SUPPORT_ACCESS`.
- leitura sensível deve gerar evento adicional do domínio + contexto de suporte.
- mutação por suporte não deve usar o mesmo fluxo; requer aprovação separada e trilha distinta.

## 5. Quando support_reason é obrigatório

`support_reason` deve ser obrigatório em:

- entrada em qualquer tenant de cliente.
- leitura de documento, certificado, export ou asset privado.
- leitura de dados FRMS ou qualquer dado sensível.
- impersonação, troubleshooting autenticado ou coleta de evidência.
- qualquer operação executada fora da empresa do ator.

Formato recomendado:

- ticket interno/externo + motivo curto controlado.
- ex.: `zendesk-4832`, `incident-2026-06-02-auth`, `onboarding-tenant-19-readonly-check`.

## 6. Como registrar acesso de suporte

Fluxo mínimo recomendado:

1. registrar `TENANT_ENTER` com `support_reason`, `support_mode`, `target_empresa_id`, `request_id`.
2. registrar eventos de domínio sensíveis durante a sessão.
3. registrar `TENANT_EXIT` ou `SESSION_END` ao encerrar o diagnóstico.
4. se houver falha de autorização, registrar o `failure_reason_code`.

Campos mínimos esperados:

- `actor_user_id`
- `actor_role`
- `actor_type = support`
- `actor_empresa_id`
- `empresa_id` e `target_empresa_id`
- `support_mode`
- `support_reason`
- `request_id`
- `correlation_id` quando aplicável
- `success`
- `metadata_sanitized_json`

## 7. O que suporte pode fazer

- navegar no tenant com escopo aprovado.
- ler configuração necessária para diagnóstico.
- consultar trilha operacional sanitizada.
- validar estado de módulo, tenant e autenticação.
- baixar evidência apenas quando a política permitir e com auditoria explícita.

## 8. O que suporte não pode fazer

- criar empresa/tenant sem fluxo próprio.
- editar permissões ou papéis sem trilha/admin approval.
- executar reset destrutivo sem processo separado.
- alterar dados sensíveis do cliente em modo `read_only`.
- operar sem `support_reason`.
- usar usuário do cliente como identidade padrão de suporte.

## 9. Como evitar abuso

- `support_reason` obrigatório e controlado.
- janela temporária de acesso com expiração.
- revalidação periódica de acessos persistentes.
- separação entre leitura padrão e write excepcional.
- alertas para acesso sensível, impersonação e export.
- revisão periódica dos eventos `SUPPORT_ACCESS`.

## 10. Relação com RBAC/Suporte v2

Este modelo depende de sprint posterior para:

- persistir `platform_admin` e `platform_support`.
- definir escopo por tenant/lista de tenants.
- controlar expiração e revogação.
- integrar o contrato de auditoria v2 ao RBAC.

Sem essa etapa, suporte deve continuar sem ativação formal no runtime.

## 11. Fora do escopo

- ativar o papel `support` no sistema atual.
- criar migration/schema.
- alterar auth, JWT, tenant middleware ou RBAC runtime.
- decidir política jurídica definitiva.
