# Final Stabilization Audit Report

## Data
- Data/hora: 2026-05-14
- Branch: `main`
- Commit inicial de referência (pré-fases): `5be104893`
- Commit checkpoint pré-Fase 1: `064e84fa7`
- Commit final auditado: `9cc1dd2b7`

---

## Resumo executivo

| Área | Resultado |
|------|-----------|
| TypeScript | ✅ 0 erros |
| Build/dry-run (wrangler) | ✅ PASS (5486.74 KiB) |
| Testes | ✅ 355/355 |
| Guard auth-boundaries | N/A (script não existe) |
| Guard tracked-secrets | N/A (script não existe) |
| Working tree | ✅ limpo |
| Migrations alteradas pelas fases | ✅ NÃO |
| RBAC alterado | ✅ NÃO |
| Banco produção alterado | ✅ NÃO |
| Secrets hardcoded | ✅ NÃO |
| SERA alterado | ✅ NÃO |

---

## Commits auditados

Commits entre `064e84fa7` (checkpoint pré-Fase 1) e HEAD `9cc1dd2b7`:

| Commit | Descrição |
|--------|-----------|
| `064e84fa7` | chore: checkpoint before critical stabilization fixes |
| `8de990fcd` | fix: apply critical stabilization fixes (**Fase 1**) |
| `75821b434` | fix: implement timing-safe secureCompare for maintenance routes (**Fase 1**) |
| `475519fa4` | fix: harden maintenance secret comparison (**Fase 1**) |
| `51e0a9b2d` | chore: checkpoint before phase 2 typecheck stabilization |
| `118e38c33` | fix: zero TypeScript errors in worker (**Fase 2**) |
| `0a47cf45a` | docs: record phase 2 validation results |
| `14db207a0` | chore: restore point before phase 3a frms rolling 28d fix |
| `ee30fbd1e` | fix: correct FRMS rolling 28d limit percentage (**Fase 3A**) |
| `75f9f44f2` | docs: record phase 3a final commit |
| `c7b079df2` | chore: restore point before phase 3b qualification reschedule fix |
| `9cc1dd2b7` | fix: update stale future date in reagendar test (**Fase 3B**) |

---

## Arquivos alterados por categoria

### Nota sobre o diff

O diff `5be104893..HEAD` inclui o checkpoint `064e84fa7` que capturou alterações pré-existentes no working tree (migrations 0362-0369, frontend React, perplexity_airtrust_sources). Essas alterações NÃO foram introduzidas pelas Fases 1-3B.

O diff relevante (pós-checkpoint, introduzido pelas fases) é `064e84fa7..HEAD`.

### 1. Segurança / Auth / Maintenance (Fase 1)
- `worker-airtrust/src/routes/integracoes_sigvoos.ts` — timing-safe compare, remoção de secret hardcoded
- `worker-airtrust/src/routes/frms.ts` — hardening de maintenance routes
- `worker-airtrust/src/routes/frms-shared.ts` — hardening de maintenance routes
- `vite.config.ts` — proxy dev apontando localhost por padrão (não produção)
- `.gitignore` — entry para `.claude/worktrees`

### 2. TypeScript / Tipagem (Fase 2)
- `worker-airtrust/src/routes/admin-perfis.ts` — Context<any>, userId via c.get()
- `worker-airtrust/src/routes/admin-usuarios.ts` — logger.warn wrap error
- `worker-airtrust/src/routes/auth.ts` — body cast, logger.warn
- `worker-airtrust/src/routes/escalas-alocacoes-helpers-internal.ts` — `id?: string | null`
- `worker-airtrust/src/routes/ficha360.ts` — cast Record<string, unknown>
- `worker-airtrust/src/routes/fix-renovadas.ts` — c.get('empresaId' as never)
- `worker-airtrust/src/routes/funcionarios.ts` — ApiResponse sem genérico
- `worker-airtrust/src/routes/integracoes_sigvoos.ts` — SigvoosRuntimeEnv, cast status
- `worker-airtrust/src/routes/lms-assets.ts` — JwtPayload em vez de Record<string,unknown>
- `worker-airtrust/src/routes/lms-cursos.ts` — Context<any>, FormData narrowing
- `worker-airtrust/src/routes/lms-matriculas.ts` — null guards, c.get as never
- `worker-airtrust/src/routes/lms-relatorios.ts` — import fix
- `worker-airtrust/src/routes/notificacoes-convocacao.ts` — string | null → string
- `worker-airtrust/src/routes/setores-gestores.ts` — dados_antigos → dados_anteriores
- `worker-airtrust/src/routes/treinamentos-planejados.ts` — db: D1Database
- `worker-airtrust/src/services/backup/orchestrator.ts` — String(objeto.uploaded)
- `worker-airtrust/src/services/importacao/QualificacaoHistoricoImportacao.ts` — Map type com id
- `worker-airtrust/src/services/qualificacoes-historico-ficha.ts` — statusFinal?: string
- `worker-airtrust/src/services/sigvoos-frms.ts` — SigvoosRuntimeEnv interface
- `worker-airtrust/src/types/exceljs-browser.d.ts` — declaração de módulo (novo arquivo)
- `worker-airtrust/src/types/index.ts` — impersonated_by, MAINTENANCE_SECRET
- `worker-airtrust/src/utils/auditoria.ts` — expansão do union acao

### 3. Testes
- `worker-airtrust/src/__tests__/routes/qualificacoes-historico-write.test.ts` — Fase 3B: data stale corrigida
- `worker-airtrust/src/__tests__/services/sigvoos-frms.test.ts` — Fase 2: mock SigvoosGroupedDay completado

### 4. FRMS
- `worker-airtrust/src/lib/frms/calculos.ts` — Fase 3A: limite28min usa HV_MES_HORAS (90h) em vez de HV_28_DIAS_HORAS (93h)

### 5. Qualificações
- `worker-airtrust/src/services/qualificacoes-historico-ficha.ts` — statusFinal opcional (Fase 2)

### 6. Documentação
- `docs/CRITICAL_STABILIZATION_REPORT.md`
- `worker-airtrust/docs/PHASE_2_TYPECHECK_BASELINE_SUMMARY.txt`
- `worker-airtrust/docs/PHASE_2_TYPECHECK_STABILIZATION_REPORT.md`
- `worker-airtrust/docs/PHASE_3A_FRMS_ROLLING_28D_REPORT.md`
- `worker-airtrust/docs/PHASE_3B_QUALIFICACOES_REAGENDAMENTO_REPORT.md`

### 7. Pré-existentes (capturados nos checkpoints, NÃO introduzidos pelas fases)
- `worker-airtrust/migrations/0362-0369` — migrations de simuladores/fichas/reaquisição
- `src/react-app/**` (ModalNovaSessao, CalendarioAgendamentos, FrmsDashboard, etc.) — evolução de features de produto
- `worker-airtrust/src/routes/simuladores-fichas-edicoes.ts` (novo) — feature de edição pós-finalização
- `worker-airtrust/src/cron/scheduled-handler.ts` — evolução do cron LMS
- `perplexity_airtrust_sources/` — documentação de contexto

---

## Validações executadas

| Comando | Resultado | Saída |
|---------|-----------|-------|
| `npx tsc --noEmit` | ✅ PASS — 0 erros | `docs/final-validation/typecheck.log` (vazio) |
| `npx wrangler deploy --dry-run` | ✅ PASS — 5486.74 KiB | `docs/final-validation/build-dry-run.log` |
| `npm test` | ✅ PASS — 355/355 | `docs/final-validation/test.log` |
| `npm run guard:auth-boundaries` | N/A | Script não existe |
| `npm run guard:tracked-secrets` | N/A | Script não existe |

---

## Testes

- **Resultado final:** 355/355 (38 arquivos de teste)
- **Baseline pré-fases:** 353/355
- **Evolução:** 353 → 354 (Fase 3A) → 355 (Fase 3B)

### Testes alterados pelas fases

#### `qualificacoes-historico-write.test.ts` (Fase 3B)
- **Alteração:** 3 ocorrências de `'2026-05-10'` → `'2099-05-10'`
- **Motivo:** data hardcoded tornou-se passada (hoje é 2026-05-14); rota valida corretamente que nova data deve ser futura
- **Resultado:** teste passou de failing para passing sem alterar lógica de validação
- **Força do teste:** igual — nenhum assert removido, expectativas idênticas com data correta
- **Avaliação:** correção legítima de dado de teste obsoleto. Data `2099-05-10` não se tornará obsoleta no horizonte relevante.

#### `sigvoos-frms.test.ts` (Fase 2)
- **Alteração:** 6 campos adicionados ao mock (`identificadorSigvoos`, `fonteResolucao`, `matriculaAeronave`, `tempoNoturnoMin`, `tempoIfrMin`)
- **Motivo:** interface `SigvoosGroupedDay` e `buildSigvoosMonthlyPreview` receberam novos campos obrigatórios; mock estava incompleto (TS2345)
- **Resultado:** mock passa a refletir corretamente a interface atual
- **Força do teste:** igual — nenhum assert removido, comportamento testado é o mesmo
- **Avaliação:** atualização de fixture para refletir interface real. Não é afrouxamento de expectativa.

### Confirmações
- ✅ Nenhum teste foi removido
- ✅ Nenhuma expectativa foi afrouxada sem justificativa documentada
- ✅ Nenhum `expect(...)` foi convertido em `expect.any()` sem motivo

---

## Segurança

### Maintenance routes
- `secureCompare()` com timing-safe comparison implementado (Fase 1)
- `MAINTENANCE_SECRET` requerido: rotas rejeitam se não configurado ou se secret não bate
- Secret lido exclusivamente de `c.env.MAINTENANCE_SECRET` (binding Cloudflare Workers)
- **Risco remanescente:** se `MAINTENANCE_SECRET` não estiver configurado em produção, as rotas de manutenção retornam 503 — OK por design (fail-closed)

### SIGVOOS secret
- Secret hardcoded `sigvoos-frms-sync-2026-04` removido na Fase 1
- Verificado: grep não encontra mais o valor no código-fonte

### Vite proxy
- `devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8787'`
- Default: localhost. Produção só se `VITE_DEV_PROXY_TARGET` for explicitamente setado
- Warning emitido se target contiver `airtrust.online`

### Auth / JWT
- `JwtPayload.impersonated_by?: number` adicionado na Fase 2 — campo real já usado em runtime
- Nenhuma lógica de auth alterada; apenas tipagem

### Tenant isolation
- Nenhuma alteração em middleware de tenant
- `getTenantContext` e `getEmpresaId` inalterados

### Secrets em código
- ✅ Nenhum valor de secret hardcoded encontrado no código-fonte
- URLs de produção (`https://api.airtrust.online`) aparecem apenas em CORS allowed-origins e OpenAPI docs — esperado

---

## Type safety debt accepted temporarily

Todos os workarounds abaixo foram introduzidos na Fase 2 para zerar 120 erros TypeScript.
Workarounds pré-existentes (presentes antes das fases) são indicados como `[PRÉ-EXISTENTE]`.

### `Context<any>`

| Arquivo | Motivo | Risco | Recomendação |
|---------|--------|-------|--------------|
| `middleware/tenant.ts` (3x) | `[PRÉ-EXISTENTE]` — padrão estabelecido | Baixo: auth já aplicado pelo middleware | Refatorar com AppEnv genérico no longo prazo |
| `middleware/domainEventProcessor.ts` | `[PRÉ-EXISTENTE]` | Baixo | Idem |
| `runtime/not-found-handler.ts` | `[PRÉ-EXISTENTE]` | Baixo | Idem |
| `routes/escalas-shared.ts` (2x) | `[PRÉ-EXISTENTE]` | Baixo | Idem |
| `routes/admin-perfis.ts` | Fase 2 — `Parameters<typeof app.get>[1]` retorna never após app.use() | Baixo | Mover helper para fora do closure |
| `routes/lms-cursos.ts` | Fase 2 — idem | Baixo | Idem |
| `routes/integracoes_sigvoos.ts` | Fase 2 — requireRole type mismatch | Baixo | Aguardar update Hono ou tipagem explícita |

### `as never` (selecionados introduzidos na Fase 2)

| Arquivo | Ocorrência | Motivo | Risco |
|---------|-----------|--------|-------|
| `routes/fix-renovadas.ts` | `c.get('empresaId' as never)` | Hono Variables = {} nesta rota; padrão do projeto | Baixo: valor correto em runtime |
| `routes/lms-matriculas.ts` | `c.get('userId' as never)` e `c.get('userRole' as never)` | Idem | Baixo |

### `as unknown as T` (introduzidos na Fase 2)

| Arquivo | Ocorrência | Motivo | Risco |
|---------|-----------|--------|-------|
| `routes/frms.ts` | `limites as unknown as Record<string, number>` | LimitesMap incompatível com Record<string, number> diretamente | Baixo: tipos são compatíveis em runtime |
| `routes/integracoes_sigvoos.ts` | `eventos as {...}[]` | Tipo de retorno D1 inferido como any | Baixo |

### `@ts-ignore` (pré-existentes, NÃO introduzidos pelas fases)

| Arquivo | Linha | Motivo | Risco |
|---------|-------|--------|-------|
| `services/backup/restore.ts` | 97, 140, 171 | `[PRÉ-EXISTENTE]` — antes das fases | Médio: backup/restore não foi auditado |

### `@ts-expect-error` (pré-existentes)

| Arquivo | Linha | Motivo |
|---------|-------|--------|
| `__tests__/auth.integration.test.ts` | 116 | `[PRÉ-EXISTENTE]` — teste de runtime com null deliberado |

---

## Smoke manual recomendado antes de produção

Executar em staging (não em produção):

1. **Auth:** Login/logout com credenciais válidas
2. **Auth:** Refresh token funciona após expiração
3. **Auth:** Rota protegida retorna 401 sem token
4. **Auth:** Rota admin retorna 403 para viewer
5. **Tenant:** Tenant A não acessa dados de Tenant B via qualquer endpoint CRUD
6. **LMS:** Listar cursos e matrículas ativos
7. **FRMS:** Calcular acúmulo de horas de um tripulante com voos no mês
8. **FRMS:** `pct_limite_28d` aparece corretamente no dashboard (validar Fase 3A)
9. **Qualificações:** Listar histórico de qualificações de um funcionário
10. **Qualificações:** Reagendar qualificação PLANEJADA para data futura retorna 200 (validar Fase 3B)
11. **Qualificações:** Reagendar qualificação PLANEJADA para data passada retorna 400
12. **SIGVOOS maintenance:** `POST /frms/maintenance/sigvoos-sync` sem secret → rejeita (401/403)
13. **SIGVOOS maintenance:** Com `MAINTENANCE_SECRET` correto → aceita e processa
14. **Vite dev:** `npm run dev` aponta para localhost:8787 por padrão (não produção)
15. **Upload/assets:** Upload de arquivo LMS funciona via R2
16. **Auditoria:** Mutação crítica (criar qualificação) registra linha em `auditoria`

---

## Riscos remanescentes

1. **RBAC instrutor** — mapeado para role `manager` (não `instructor`). Documentado na Fase 1, não alterado. Risco: instrutores têm acesso de manager. Requer decisão de produto antes de corrigir.

2. **Migrations duplicadas** — `0367_classificar_dificuldade_sk76_restantes.sql` e `0367_sk76_reaquisicao_experiencia_recente.sql` com mesmo número 0367. Documentado. Pode causar problema na aplicação sequencial de migrations. Requer resolução antes do próximo deploy de migrations.

3. **`MAINTENANCE_SECRET` em produção** — se não configurado via `wrangler secret put`, rotas de manutenção ficam inacessíveis (fail-closed). Deve ser verificado antes de acionar manutenção em produção.

4. **`@ts-ignore` em `backup/restore.ts`** — 3 ocorrências pré-existentes, não auditadas. Módulo de backup/restore não foi coberto pelos testes das fases. Risco médio: funcionalidade de restore pode ter comportamento não-tipado.

5. **Smoke em staging obrigatório** — nenhuma das validações acima foi executada contra ambiente real. Deploy em produção deve ser precedido de smoke em staging.

6. **Frontend React** — arquivos como `ModalNovaSessao.tsx`, `CalendarioAgendamentos.tsx`, `simuladores-fichas-edicoes.ts` foram alterados pré-fases (capturados no checkpoint). Não foram auditados pelas fases de estabilização. Requerem testes funcionais próprios.

---

## Conclusão

**APROVADO PARA STAGING**

Justificativa:
- 0 erros TypeScript
- Build passa (5486.74 KiB)
- 355/355 testes passando (melhora de 353/355 pré-fases)
- Nenhuma migration, RBAC, banco ou secret foi alterado pelas fases 1-3B
- Workarounds de type safety são conservadores e justificados
- Secret hardcoded removido (Fase 1), proxy dev corrigido (Fase 1)
- Alterações de teste são correções legítimas (dado obsoleto, mock incompleto)

**NÃO APROVADO PARA PRODUÇÃO** sem:
1. Smoke manual em staging (checklist acima)
2. Resolução da duplicata `0367` antes de aplicar migrations
3. Confirmação de que `MAINTENANCE_SECRET` está configurado em produção
