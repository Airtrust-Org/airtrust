# AirTrust - Platform Roles Model v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `c3328b59ab4d683d94a7fcbb4cfb30ceec77461f`
**Modo:** Modelo conceitual. Sem migration real.

## 1. Objetivo

Definir o modelo futuro de papeis de plataforma do AirTrust separado dos papeis internos de tenant.

## 2. Problema do fallback userId===1

O fallback legado `userId === 1` resolve compatibilidade, mas nao governa:

- quem recebeu autoridade de plataforma.
- por quanto tempo.
- sobre quais tenants.
- com qual trilha de auditoria.

Ele deve ser removido apenas em sprint futura com migration/seed controlado. Nao remover agora.

## 3. Papel platform_admin

Responsabilidades conceituais:

- administrar funcoes globais de plataforma.
- aprovar acessos excepcionais de suporte quando o processo exigir.
- operar configuracoes cross-tenant com trilha reforcada.

Restricoes:

- nao substituir automaticamente papeis de negocio dentro do tenant.
- nao depender de identidade fixa.
- nao operar sem audit trail e sem escopo claro.

## 4. Papel support_read_only

Responsabilidades:

- diagnostico tenant-scoped.
- leitura de metadados e estado operacional necessarios para suporte.
- consulta de configuracao e trilha sanitizada.

Restricoes:

- sem create/update/delete.
- sem export sensivel por padrao.
- sem acesso sem `support_reason`.

## 5. Papel support_elevated futuro

Papel futuro, nao ativo inicialmente.

Uso esperado:

- break-glass controlado.
- mutacao excepcional e aprovada.
- resposta a incidente ou recuperacao operacional.

Requisitos minimos futuros:

- aprovacao separada.
- auditoria reforcada.
- expiracao curta.
- rollback e revisao posterior.

## 6. Separacao entre papel de plataforma e papel no tenant

O mesmo usuario pode ter:

- um papel de plataforma.
- um ou varios papeis em tenants.

Esses planos nao se confundem:

- papel de tenant nao concede plataforma.
- papel de plataforma nao deve sobrescrever automaticamente autorizacao funcional local sem rota/acao explicita.

## 7. Como evitar privilege escalation

- armazenar papeis de plataforma separadamente de `usuarios_empresas`.
- exigir escopo explicito para suporte.
- manter negacao por padrao para papeis desconhecidos.
- separar `platform_admin` de `tenant_admin`.
- registrar concessao e revogacao de cada papel de plataforma.

## 8. Como migrar o usuario legado

Plano conceitual:

1. criar papel persistido de plataforma.
2. associar o operador legado atual ao papel novo.
3. rodar dual-read temporario entre papel persistido e fallback legado.
4. validar fluxos atuais.
5. remover `userId === 1` do caminho principal.

## 9. Regras de auditoria

Eventos minimos:

- `PLATFORM_ROLE_GRANTED`
- `PLATFORM_ROLE_REVOKED`
- `SUPPORT_SESSION_STARTED`
- `SUPPORT_SESSION_ENDED`
- `TENANT_ROLE_CHANGED`
- `BREAK_GLASS_REQUESTED`
- `BREAK_GLASS_APPROVED`
- `BREAK_GLASS_DENIED`

Campos minimos:

- `actor_user_id`
- `actor_role`
- `target_empresa_id` quando houver
- `request_id`
- `support_reason` quando aplicavel
- `risk_level`
- `retention_class`

## 10. Fora do escopo

- remover `userId === 1` agora.
- ativar novos papeis em runtime.
- criar schema real.
