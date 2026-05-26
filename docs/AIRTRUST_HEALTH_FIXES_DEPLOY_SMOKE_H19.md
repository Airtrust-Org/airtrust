# AIRTRUST v0.4-H19 — Consolidated deploy and smoke after health fixes

Data: 2026-05-25
Repo: `/Users/filipedaumas/SAAS/Airtrust`
Objetivo: validar baseline consolidada, executar deploy controlado e smoke read-only.

## 1) Commits incluídos no baseline alvo

Baseline auditada para deploy: `c7638f6fc9d658427373bf1f6574abf41a6e13b5` (`HEAD == origin/main`).

Sequência recente relevante:
- `8f5f45b` fix(sigvoos): scope frms clear existing by tenant
- `3732668` fix(simuladores): complete qualification generation result
- `ef50fa0` fix(deduplicate): require tenant scoped dry run
- `0884419` chore(security): add sensitive file guardrail
- `97426a9` chore(security): untrack environment files
- `1f03970` fix(auth): normalize role checks
- `07c1937` fix(evd): validate operational updates
- `59b5a46` fix(system): use existing health endpoints
- `5280e8a` fix(simuladores): align equipamentos api contract
- `e7cc555` docs(security): classify sensitive file candidates
- `3156275` chore(security): untrack sensitive batch one
- `8248571` docs(security): record h6c batch commit
- `99290b0` chore(security): untrack sensitive batch two
- `1afbdfb` fix(sessoes): return error on failed list
- `c7638f6` test(evd): add operational regression coverage

## 2) Estado inicial e estratégia de segurança

- `branch`: `main`
- `HEAD == origin/main`: sim
- divergência: `0 ahead / 0 behind`
- observação crítica: árvore local contém alterações não commitadas fora de escopo.

Para evitar deploy acidental de mudanças locais, foi criada worktree limpa em:
`/tmp/airtrust-h19-c7638f6` no commit exato `c7638f6`.

## 3) Validações locais consolidadas (worktree limpa)

Comandos executados na worktree:
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `npm run test:worker`

Resultado:
- `worker tsc dedicado`: **FALHOU**
  - `worker-airtrust/src/routes/admin-usuarios.ts(340,7): error TS2552: Cannot find name 'callerRole'`
- `tsc geral`: OK
- `build`: OK
- `lint`: OK
- `test:worker`: não bloqueante para decisão de deploy porque critério exige todos verdes e o `worker tsc` já falhou.

Decisão de gate:
- **Deploy bloqueado** (critério da fase: só deployar com todas as validações passando).

## 4) Verificação de comandos de deploy reais

### Frontend
- Comando identificado: `npm run deploy:pages`
- Implementação: `wrangler pages deploy dist/client --project-name=airtrust --branch=production ...`

### Backend/Worker
- Comando identificado: `npm run deploy:worker:only` (via `scripts/deploy-worker-only.sh`)
- Observação crítica: o script executa `wrangler d1 migrations apply ... --remote` antes do `wrangler deploy`.

### Risco de operação
- Há risco explícito de migration automática no deploy padrão do worker.
- Como a fase proíbe migration, esse fluxo **não é permitido** sem ajuste operacional.

## 5) Deploy controlado

- **Não executado** por bloqueio de validação (`worker tsc`) e conflito de política (script padrão aplica migrations).

## 6) Smoke pós-deploy (read-only)

Mesmo sem deploy novo, foi executado smoke read-only para baseline de produção atual:

1. `bash scripts/smoke-production-readonly.sh`
- Web root: 200
- Dashboard route: 200
- API version: 200
- `APP_VERSION` observado: `2026-05-25T16:07:39Z-8f27c62`
- Resultado: PASS

2. `BASE=https://api.airtrust.online bash scripts/smoke-test-core.sh`
- Health: OK
- Smoke autenticado: não executado (credenciais ausentes)

3. `bash scripts/smoke-tests.sh https://api.airtrust.online`
- 5/5 checks pass
- sem escrita de dados

## 7) Pendências

1. Corrigir blocker de TypeScript em `worker-airtrust/src/routes/admin-usuarios.ts` (símbolo `callerRole`) no código versionado em `main`.
2. Definir caminho de deploy worker sem migrations automáticas para fases de release onde migration é proibida.
3. Repetir H19 após (1) e (2): validações completas verdes + deploy frontend/worker + smoke pós-deploy autenticado.

## 8) Próximos passos recomendados

1. Abrir fase curta com **Codex alto** para corrigir blocker de `worker tsc` (escopo mínimo no `admin-usuarios.ts`).
2. Em seguida, rerodar H19 (deploy controlado) com o mesmo gate.
3. Após deploy consolidado, retomar trilha de limpeza (**H6-E** com DeepSeek médio) ou próximo bug funcional com Codex médio-alto.

## Follow-up H20 — worker tsc blocker fixed

- Erro anterior:
  - `worker-airtrust/src/routes/admin-usuarios.ts:340`
  - `TS2552: Cannot find name 'callerRole'.`
- Patch aplicado:
  - inclusão de `const callerRole = getCallerRole(c);` no handler `GET /api/admin/usuarios/:id`.
  - correção estritamente de escopo/tipagem; sem alteração de regra de autorização.
- Validações após patch:
  - `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: ok
  - `npx tsc --noEmit`: ok
  - `npm run build`: ok
  - `npm run lint`: ok
  - `npm run test:worker`: ok
- Deploy:
  - permanece pendente para H21 (reexecução do deploy/smoke consolidado).
