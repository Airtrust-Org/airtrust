# AirTrust RBAC Support Model v0.5

Data: 2026-06-02
Branch: `main`
HEAD base antes do sprint: `83c9503b9ad63580d70e3bba5f17e7cdfff2c296`
Modo: Sprint A executado sem criar empresa, sem criar usuario, sem migration, sem acesso a banco remoto e sem deploy.

## 1. Resumo executivo

Sprint A reduziu a dependencia operacional implicita de `userId === 1` sem remover a compatibilidade legada. A regra agora esta centralizada em `worker-airtrust/src/middleware/tenant.ts`, com helpers nomeados e testes que bloqueiam novos atalhos diretos fora desse ponto.

O papel `support` nao foi ativado. Isso e intencional: suporte read-only por tenant exige persistencia explicita de papel/escopo, trilha auditavel e politica de expiracao/revogacao. Fazer isso sem migration criaria apenas outro atalho implicito.

## 2. Guard rails do sprint

- Nao criar tenant ou empresa.
- Nao criar usuario real.
- Nao executar migration.
- Nao alterar dados reais.
- Nao consultar banco remoto.
- Nao fazer deploy.
- Preservar compatibilidade do operador legado enquanto o modelo final nao existir.

## 3. Inventario dos call sites

Arquivos com dependencia direta encontrada antes do ajuste:

- `worker-airtrust/src/routes/auth.ts`: resolucao de empresa inicial, listagem de empresas e selecao de empresa tratavam `userId === 1` como plataforma.
- `worker-airtrust/src/middleware/tenant.ts`: fallback de tenant para usuario legado quando o vinculo usuario-empresa nao era encontrado.
- `worker-airtrust/src/routes/empresas.ts`: helper local combinava tenant `airtrust` com `userId === 1` para super-admin.

Arquivos revisados sem dependencia direta de `userId === 1`:

- `worker-airtrust/src/middleware/auth.ts`: resolve role efetiva por `usuarios_empresas`; o ID 1 aparece apenas como fallback de dev bypass quando explicitamente habilitado.
- `worker-airtrust/src/middleware/rbac.ts`: RBAC por role normalizada, sem identidade fixa.
- `worker-airtrust/src/routes/empresas-usuarios.ts`: usa tenant `airtrust` como fronteira de plataforma, sem identidade fixa.
- `worker-airtrust/src/routes/admin.ts`: exige admin e escopo de tenant para resets; nao usa identidade fixa de plataforma.

## 4. Modelo atual preservado

O sistema ainda reconhece dois caminhos de administracao de plataforma:

- Tenant com `empresaCodigo = airtrust`.
- Usuario legado com ID `1`, agora por `isLegacyPlatformAdminUserId()`.

Essa preservacao evita quebrar operacao existente antes de haver migration e dados persistidos para `platform_admin`. A diferenca e que o atalho deixou de ficar espalhado por rotas e passou a ser uma decisao explicita, nomeada e testavel.

## 5. Helpers canonicos

O contrato tecnico passa a ser:

- `LEGACY_PLATFORM_ADMIN_USER_ID`: constante unica para compatibilidade temporaria.
- `normalizeContextUserId()`: normalizacao segura de `userId` vindo do contexto.
- `isLegacyPlatformAdminUserId()`: unico ponto permitido para o fallback legado.
- `isAirtrustPlatformTenant()`: fronteira de plataforma baseada no tenant.
- `isPlatformAdminContext()`: composicao entre tenant AirTrust e fallback legado.

Novas checagens de plataforma devem usar esses helpers, nao comparacoes diretas.

## 6. Modelo de suporte proposto

`support` deve ser uma capacidade de leitura, nao um super-admin disfarçado. Modelo recomendado para a proxima etapa com migration:

- Papel persistido: `support` ou `platform_support`.
- Escopo obrigatorio: tenant especifico, lista de tenants ou escopo temporario aprovado.
- Permissoes: leitura de diagnostico, leitura de configuracao e leitura de eventos operacionais.
- Bloqueios: criar empresa, remover empresa, editar acesso de usuario, reset destrutivo, mudar configuracao sensivel, emitir token como tenant sem evento auditado.
- Auditoria: cada acesso deve registrar ator, tenant, motivo, timestamp, request id, rota e resultado.
- Expiracao: acessos temporarios devem ter fim definido e revogacao simples.

Sem estes campos persistidos, suporte deve continuar inativo.

## 7. Implementacao sem migration neste sprint

Alteracoes realizadas:

- Centralizacao do fallback legado em `middleware/tenant.ts`.
- Uso de `isLegacyPlatformAdminUserId()` em `routes/auth.ts`.
- Uso de `isPlatformAdminContext()` em `routes/empresas.ts`.
- Guard arquitetural contra novos `userId === 1` diretos em codigo fonte fora do helper.
- Testes de comportamento para AirTrust tenant, usuario legado 1 e tenant admin comum.
- Teste comprovando que role `support` nao concede admin no RBAC atual.

Nada foi alterado em schema, migration, dados ou deploy.

## 8. Testes adicionados

- `worker-airtrust/src/__tests__/architecture/no-direct-platform-admin-user-id.test.ts`
- `worker-airtrust/src/__tests__/routes/rbac-platform-admin-boundaries.test.ts`
- `worker-airtrust/src/__tests__/routes/support-role-not-yet-active.test.ts`

Cobertura principal:

- Nao permitir novas comparacoes diretas `userId === 1`.
- Manter AirTrust tenant como plataforma.
- Manter compatibilidade temporaria do usuario legado 1.
- Bloquear tenant admin comum como plataforma.
- Bloquear `support` como admin enquanto o papel nao estiver formalmente implementado.

## 9. Riscos remanescentes

- O fallback legado para ID 1 ainda existe por compatibilidade.
- O tenant `airtrust` ainda representa plataforma por convencao de codigo.
- `support` ainda nao existe como papel persistido e auditavel.
- `routes/auth.ts` ainda pode inserir vinculo `usuarios_empresas` para o usuario legado em caminhos existentes; isso foi preservado, nao ampliado.
- A remocao real do fallback exige migration, dados de plataforma e plano de rollback.

## 10. Proxima etapa recomendada

Sprint B imediato: Audit Trail/LGPD.

Sprint de migration futura para RBAC/suporte: usar GPT-5.5 Altissimo, porque envolve schema, dados, rollback, remocao de fallback legado e politicas de suporte auditaveis. A ordem recomendada e:

- Criar modelo persistido de `platform_admin`/`support`.
- Migrar o operador legado para papel explicito.
- Adicionar eventos auditados de acesso de suporte.
- Trocar helpers para consultar papel persistido.
- Remover `LEGACY_PLATFORM_ADMIN_USER_ID`.
- Manter teste arquitetural atualizado para falhar se o fallback reaparecer.
