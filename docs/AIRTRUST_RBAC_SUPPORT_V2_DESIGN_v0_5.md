# AirTrust - RBAC/Suporte v2 Design

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `c3328b59ab4d683d94a7fcbb4cfb30ceec77461f`
**Modo:** Design/documentacao. Nenhuma migration criada, nenhum schema alterado, nenhum runtime alterado.

## 1. Objetivo

Definir o desenho futuro de RBAC e suporte multiempresa do AirTrust sem implementar nada neste sprint.

## 2. Problemas atuais

O estado atual ainda depende de dois mecanismos de plataforma que nao devem sobreviver ao modelo final:

- fallback legado `userId === 1`, hoje centralizado em `isLegacyPlatformAdminUserId()`.
- convencao de tenant de plataforma via `empresaCodigo = airtrust`.

Outras limitacoes observadas:

- `requireRole()` hoje trabalha com um conjunto pequeno de roles normalizadas (`admin`, `manager`, `user`) e nao distingue papel de tenant de papel de plataforma.
- `support` nao existe como papel persistido, e o teste atual comprova que ele nao deve conceder admin automaticamente.
- suporte auditavel foi desenhado no Sprint O, mas ainda nao esta integrado a um modelo de autorizacao persistido.
- `tenant_admin` e `platform_admin` ainda podem parecer proximos demais conceitualmente se o desenho nao separar fronteiras com rigor.

## 3. Principios

- Fail-closed: ausencia de papel, escopo ou justificativa deve negar acesso.
- Separacao de dominios: papel de plataforma nao substitui papel no tenant, e vice-versa.
- Least privilege: suporte nasce read-only.
- Escopo explicito: acesso de plataforma e suporte deve ser tenant-scoped ou process-scoped.
- Auditavel por padrao: todo acesso de suporte e toda alteracao de papel de plataforma deve gerar evento v2.
- Compatibilidade controlada: `userId === 1` so pode ser removido em sprint futura com migration e rollback.

## 4. Papeis atuais

Hoje o sistema opera principalmente com:

- roles de tenant normalizadas para `admin`, `manager` e `user` no middleware RBAC.
- variacoes de origem como `ADMINISTRADOR`, `GESTOR`, `USUARIO`, `INSTRUTOR`, `ALUNO`.
- contexto de plataforma implicitamente representado por `empresaCodigo = airtrust` e/ou `userId === 1`.

Conclusao: o sistema atual tem RBAC funcional para tenant, mas nao tem um modelo persistido e formal de plataforma/suporte.

## 5. Papeis futuros

Papeis minimos propostos:

- `platform_admin`
- `support_read_only`
- `support_elevated` (futuro, nao ativo inicialmente)
- `tenant_admin`
- `tenant_manager`
- `tenant_user`

Separacao proposta:

- `platform_admin`: administra funcoes globais de plataforma, nao por fallback numerico.
- `support_read_only`: diagnostico read-only com escopo por tenant e `support_reason`.
- `support_elevated`: papel futuro para cenarios aprovados de break-glass ou mutacao excepcional, nao habilitado no v2 inicial.
- `tenant_admin`, `tenant_manager`, `tenant_user`: continuam representando autoridade interna do tenant, sem poder implicito de plataforma.

## 6. Modelo de autorizacao

Camadas conceituais:

1. Identidade autenticada.
2. Papeis de plataforma persistidos.
3. Vinculo do usuario com tenant e papel local.
4. Escopo operacional do request.
5. Gating de auditoria (`support_reason`, `request_id`, `correlation_id` quando aplicavel).

Regras principais:

- `platform_admin` pode operar funcoes de plataforma, mas nao deve herdar automaticamente permissao de mutar qualquer tenant sem rota e evento adequados.
- `support_read_only` pode entrar em tenant aprovado para leitura e diagnostico, nunca para criar, editar ou apagar.
- `tenant_admin` pode administrar seu tenant, mas nao sobe para plataforma.
- `tenant_manager` e `tenant_user` continuam limitados ao proprio tenant e ao escopo funcional das rotas.

## 7. Modelo de suporte

`support_read_only` deve obedecer:

- entrada apenas com `support_reason`.
- escopo por tenant ou sessao aprovada.
- leitura sensivel auditada.
- download sensivel bloqueado por padrao.
- nenhuma mutacao no v2 inicial.

`support_elevated`:

- fica apenas como conceito futuro.
- exigira fluxo separado, aprovacao adicional e trilha mais forte.

## 8. Relacao com tenant atual

O tenant atual continua sendo resolvido pelo middleware existente. O v2 nao muda isso neste sprint.

Pontos de transicao futura:

- `empresaCodigo = airtrust` deve deixar de ser a unica convencao de plataforma.
- `isPlatformAdminContext()` deve passar a consultar papel persistido de plataforma.
- `tenant_admin` nunca deve ser tratado como `platform_admin` por proximidade de nome ou por estar no tenant AirTrust sem o papel correto.

## 9. Relacao com Audit Trail/LGPD v2

O modelo RBAC v2 depende diretamente do Sprint O:

- `support_reason` obrigatorio para suporte.
- `actor_role`, `actor_type`, `empresa_id`, `target_empresa_id`, `request_id`, `correlation_id`.
- eventos especificos para concessao/revogacao de papel de plataforma e sessoes de suporte.
- `risk_level` e `retention_class` mais altos para papel de plataforma, break-glass e negacoes sensiveis.

## 10. Regras de fail-closed

- Sem papel de plataforma persistido: negar acao de plataforma.
- Sem vinculo tenant valido: negar acesso ao tenant.
- Sem `support_reason`: negar entrada de suporte.
- Sem evento auditavel obrigatorio: negar fluxo de suporte sensivel.
- Sem escopo explicito: negar acesso cross-tenant.
- Papel desconhecido: negar.

## 11. Plano de implementacao futura

1. Definir entidades persistidas de plataforma/suporte.
2. Introduzir dual-read entre fallback legado e papel persistido.
3. Migrar o operador legado `userId === 1` para papel explicito.
4. Integrar `isPlatformAdminContext()` ao papel persistido.
5. Introduzir enforcement de `support_read_only`.
6. Remover o fallback legado apenas apos rollout, testes e rollback aprovados.

## 12. Fora do escopo desta fase

- criar migration real.
- alterar schema.
- alterar auth, tenant middleware ou RBAC runtime.
- ativar `support`.
- remover `userId === 1` agora.
