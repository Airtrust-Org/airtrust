# AirTrust - Multi-Tenant Readiness Hardening

Data: 2026-06-20
Base: `origin/main` @ `fc9c74f72ba1f661d1f7a4cfbdec62a7cd4eec31`
Branch: `codex/multitenant-readiness-hardening`
Modo: macroetapa unica read-only/implementacao local controlada, sem deploy, sem migration, sem SQL remoto e sem alteracao de banco de producao.

## Objetivo

Reduzir risco sistemico de seguranca, isolamento multiempresa, RBAC, rate limiting, proxy de desenvolvimento e smoke autenticado para permitir um proximo piloto comercial com menor blast radius.

Esta macroetapa nao redesenha Escalas/FRMS, nao abre SIGVOOS, nao cria empresa real, nao cria usuario real e nao declara homologacao, aprovacao ou aceite regulatorio.

## Achados confirmados

| Achado | Status | Evidencia | Risco | Acao |
|---|---|---|---|---|
| Platform admin legado por ID fixo | Confirmado | `worker-airtrust/src/lib/rbac/platform-access.ts` promovia `userId === 1` | Critico | Corrigido neste PR |
| Fallback permissivo de tenant | Confirmado | `worker-airtrust/src/middleware/tenant.ts` selecionava empresa ativa para platform admin sem vinculo tenant | Critico | Corrigido neste PR |
| `getEmpresaIdSafe` retornando `0` | Confirmado | `worker-airtrust/src/routes/escalas-shared.ts` fazia fallback para `0` | Alto | Corrigido neste PR |
| Rate limit de login | Parcial | `POST /api/auth/login` ja tinha rate limit, mas mais permissivo que o preset baixo | Medio/Alto | Fortalecido neste PR |
| Dev proxy para producao | Confirmado | `vite.config.ts` apenas emitia `console.warn` para `airtrust.online` | Alto | Corrigido neste PR |
| Smoke autenticado sem credencial | Confirmado | `scripts/smoke-authenticated-operational.sh` encerrava como skip/sucesso parcial sem auth | Alto | Corrigido neste PR |
| Rotas LMS admin sem gate explicito no router | Confirmado | `/lms/admin/cursos` e `/lms/matriculas*` usavam `ProtectedRoute` sem `requiredRole` | Alto | Corrigido neste PR |
| Rotas de manutencao FRMS/SIGVOOS | Parcial | Excluidas do tenant global, protegidas por `MAINTENANCE_SECRET`; FRMS tambem exige localhost/secret | Medio/Alto | Mantidas, com risco remanescente documentado |
| Onboarding multiempresa | Parcial | Existe `docs/AIRTRUST_SECOND_COMPANY_ONBOARDING_RUNBOOK_v0_5.md` | Medio | Nao alterado; exige execucao controlada |
| Backup/rollback D1 remoto | Parcial | `docs/D1_ROLLBACK_DRILL_REPORT.md` registra drill remoto nao executado | Alto | Nao executado; risco remanescente |

## Achados descartados ou reclassificados

| Achado | Decisao |
|---|---|
| Login sem rate limit | Descartado como stale: o endpoint ja tinha `rateLimiter`; foi apenas endurecido para 5/min. |
| Forgot/reset/refresh sem rate limit | Descartado como stale: `forgot-password`, `reset-password` e `refresh` ja tinham rate limit. |
| Maintenance routes completamente abertas | Descartado como formulacao ampla: ha `MAINTENANCE_SECRET` e testes de fail-closed. Permanece risco de segunda camada/auditoria operacional. |
| Criar onboarding completo com UI/script | Fora de escopo: ja ha runbook; automacao segura deve ser bloco proprio, dry-run por padrao. |
| Executar DR remoto | Fora de escopo: exigiria operacao externa/quota/ambiente aprovado. |

## Correcoes implementadas

### Platform admin

- `isPlatformAdminAccess()` agora depende somente de role persistida `platform_admin`.
- `resolvePlatformAccessState()` nao emite mais `source: 'legacy'`.
- `userId === 1` deixou de ser atalho operacional.
- Testes de RBAC foram invertidos para proteger a nova regra.

### Tenant fallback

- `tenantMiddleware()` nao escolhe mais a primeira empresa ativa quando o vinculo usuario-empresa falha.
- Mesmo usuario com role persistida de plataforma recebe `TENANT_ACCESS_DENIED` se tentar operar uma rota tenant sem vinculo valido naquele contexto.
- A selecao/troca de empresa para platform admin deve continuar por fluxos explicitos de auth/platform, nao por fallback implicito do middleware.

### Helper de tenant

- `getEmpresaIdSafe()` deixou de retornar `0`.
- Sem `tenantContext` ou `empresaId` valido, o helper falha com `TENANT_REQUIRED`.
- `getEmpresaIdOptional()` continua disponivel para casos realmente opcionais.

### Rate limiting

- `rateLimitPresets.login` foi endurecido para 5 requests/minuto.
- `POST /api/auth/login` passou a usar o preset compartilhado com `keyPrefix` especifico do endpoint.

### Vite dev proxy

- `VITE_DEV_PROXY_TARGET` apontando para `airtrust.online` em development agora falha fechado.
- Override exige `AIRTRUST_ALLOW_PROD_DEV_PROXY=I_UNDERSTAND_THIS_POINTS_DEV_TO_PRODUCTION`.
- A logica foi extraida para modulo puro testavel em `src/react-app/config/devProxyGuard.ts`.

### Smoke autenticado

- Sem `AIRTRUST_AUTH_TOKEN` ou `AIRTRUST_COOKIE`, o smoke autenticado agora falha com `AUTHENTICATED_SESSION_UNAVAILABLE`.
- `AIRTRUST_PUBLIC_ONLY=YES` continua preservado para smoke publico read-only.
- Nenhum token, cookie, email, CPF ou senha foi adicionado ao repositorio.

### Router LMS admin

- `/lms/admin/cursos`, `/lms/matriculas` e `/lms/matriculas/:cursoId` agora declaram `requiredRole={['ADMIN', 'GESTOR']}` no router.
- Nenhum fluxo SCORM, player ou conteudo LMS foi alterado.

## Arquivos alterados

- `scripts/smoke-authenticated-operational.sh`
- `vite.config.ts`
- `src/react-app/App.tsx`
- `src/react-app/config/devProxyGuard.ts`
- `src/react-app/__tests__/vite-dev-proxy-guard.test.ts`
- `src/react-app/components/__tests__/ProtectedRoute.module-gating.test.tsx`
- `worker-airtrust/src/lib/rbac/platform-access.ts`
- `worker-airtrust/src/middleware/tenant.ts`
- `worker-airtrust/src/middleware/rate-limit.ts`
- `worker-airtrust/src/routes/auth.ts`
- `worker-airtrust/src/routes/escalas-shared.ts`
- `worker-airtrust/src/routes/frms.ts`
- `worker-airtrust/src/__tests__/architecture/no-direct-platform-admin-user-id.test.ts`
- `worker-airtrust/src/__tests__/middleware.test.ts`
- `worker-airtrust/src/__tests__/middleware/tenant-fail-closed.test.ts`
- `worker-airtrust/src/__tests__/rbac/platform-access.test.ts`
- `worker-airtrust/src/__tests__/routes/auth-platform-admin-boundaries.test.ts`
- `worker-airtrust/src/__tests__/routes/escalas-shared-tenant-helper.test.ts`
- `worker-airtrust/src/__tests__/routes/frms-fortnight-coverage.test.ts`
- `worker-airtrust/src/__tests__/routes/platform-support-gradual-enforcement.test.ts`
- `worker-airtrust/src/__tests__/routes/rbac-platform-admin-boundaries.test.ts`
- `worker-airtrust/src/__tests__/routes/support-role-not-yet-active.test.ts`

## Testes executados

Passaram:

```bash
npm run test:worker -- --run platform-access rbac-platform-admin-boundaries auth-platform-admin-boundaries platform-support-gradual-enforcement tenant-fail-closed support-role-not-yet-active maintenance-guards middleware escalas-shared-tenant-helper
```

Resultado: 11 arquivos, 71 testes passando.

```bash
npm run test:worker -- --run frms middleware escalas-shared-tenant-helper tenant-fail-closed platform-access auth-platform-admin-boundaries maintenance-guards
```

Resultado: 42 arquivos, 362 testes passando.

```bash
npm run test:run -- --run vite-dev-proxy-guard ProtectedRoute.module-gating
```

Resultado: 2 arquivos, 21 testes passando.

```bash
npm run lint
npm run build
```

Resultado: ambos passaram. O build exibiu o aviso preexistente de ambiente de producao, sem executar deploy, migration ou SQL remoto.

Observacao: a primeira tentativa de teste falhou antes da execucao porque o worktree novo nao tinha `node_modules`. Foram executados `npm ci` na raiz e em `worker-airtrust/`. O `npm audit` reportou vulnerabilidades preexistentes; nao foi executado `npm audit fix` para evitar mudancas fora de escopo.

## Seguranca

- Sem deploy.
- Sem migration.
- Sem SQL remoto.
- Sem alteracao de banco.
- Sem criacao de empresa real.
- Sem criacao de usuario real.
- Sem credenciais hardcoded.
- Sem PII em novos logs ou documentos.
- Sem bypass de auth.
- Sem alteracao de SCORM/LMS player/conteudo.

## Riscos remanescentes

1. Rotas de manutencao FRMS/SIGVOOS continuam fora do tenant global e dependem de `MAINTENANCE_SECRET`; recomenda-se segunda camada operacional e trilha auditavel antes de escala ampla.
2. Observabilidade ampla nao foi redesenhada; logs estruturados por tenant/request ainda devem ser bloco proprio.
3. DR remoto D1/R2 nao foi executado nesta macroetapa; ha evidencia local/documental, mas falta drill remoto aprovado.
4. Onboarding multiempresa ainda depende de runbook e execucao manual controlada.
5. Simuladores e outras telas por perfil ainda precisam revisao de UX/RBAC, fora do recorte P0/P1 desta macroetapa.
6. Escalas + FRMS decision service permanece fora de escopo e segue como macroetapa posterior.

## Decisao SIGVOOS

`SIGVOOS: NO-GO` mantido.

Motivos:

- esta macroetapa nao executou smoke autenticado real em producao;
- nao houve deploy;
- nao houve validacao visual/autenticada por perfil;
- Escalas + FRMS decision loop nao foi redesenhado.

## Decisao sobre piloto comercial

`OK COM RESSALVAS` para abrir PR tecnico de hardening.

Ainda nao e `GO` automatico para piloto comercial. Antes de piloto com nova empresa, executar:

- smoke autenticado com empresa esperada;
- validacao negativa cross-tenant;
- revisao de rotas de manutencao;
- checklist de onboarding sem PII/secrets;
- plano de rollback remoto aprovado.

## Proxima macroetapa recomendada

Concluir validacao autenticada multiempresa.

Essa e a sequencia mais direta apos este PR: validar que os gates endurecidos funcionam com usuarios reais, roles reais, empresas reais e sessao autenticada, sem abrir SIGVOOS nem redesenhar Escalas/FRMS ainda.
