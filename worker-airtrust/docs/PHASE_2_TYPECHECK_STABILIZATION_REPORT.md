# Phase 2 TypeScript Stabilization Report

**Commit:** `118e38c33`
**Date:** 2026-05-14
**Author:** AirTrust System + Claude Sonnet 4.6

---

## Resultado Final

| Métrica | Antes | Depois |
|---|---|---|
| Erros TypeScript | 120 | **0** |
| Build (wrangler dry-run) | ✅ passa | ✅ passa |
| Testes passando | 353/355 | **353/355** |
| Testes falhando (pré-existentes) | 2 | 2 (inalterados) |
| Bundle size | — | 5486.77 KiB / gzip 1060.80 KiB |

---

## Testes que Falham (Pré-existentes)

Ambos falhavam **antes** da Fase 2. Confirmado via `git stash && npm test` na baseline `51e0a9b2d`.

### 1. `src/__tests__/frms/calculos-alertas.test.ts`

**Teste:** `calcAcumuloRolling > REGRESSION P1: pct_limite_28d usa janela rolling de 28 dias, não o mês calendário`

**Erro:**
```
AssertionError: expected 50.1792 to be close to 51.85
received difference is 1.6708, but expected < 0.5
```

**Por que é pré-existente:** Teste marcado como "REGRESSION P1" — foi escrito para documentar um bug conhecido no cálculo do percentual da janela rolling de 28 dias. A Fase 2 não tocou em `calcAcumuloRolling` nem em nenhuma lógica de cálculo FRMS. Nenhum dos 25 arquivos alterados na Fase 2 está relacionado a este teste.

### 2. `src/__tests__/routes/qualificacoes-historico-write.test.ts`

**Teste:** `qualificacoes historico write router > reagenda uma qualificacao planejada para uma nova data futura`

**Erro:**
```
AssertionError: expected 400 to be 200
```

**Por que é pré-existente:** O teste espera HTTP 200 mas a rota retorna 400. Isso é um bug de validação pré-existente na lógica de reagendamento de qualificações planejadas. A única mudança da Fase 2 em `qualificacoes-historico-ficha.ts` foi tornar o parâmetro `statusFinal` opcional na assinatura de `reconcileQualificacaoHistoricoExistente` — o que **manteve** o comportamento original de `undefined` no call-site de 5 argumentos. Verificado: a falha ocorre identicamente na baseline sem as alterações da Fase 2.

---

## Arquivos Alterados (25)

Apenas `.ts` de source e docs — zero migrations, zero RBAC, zero DB schema, zero fixtures, zero `.claude/`:

```
src/__tests__/services/sigvoos-frms.test.ts
src/routes/admin-perfis.ts
src/routes/admin-usuarios.ts
src/routes/auth.ts
src/routes/escalas-alocacoes-helpers-internal.ts
src/routes/ficha360.ts
src/routes/fix-renovadas.ts
src/routes/frms-shared.ts
src/routes/frms.ts
src/routes/funcionarios.ts
src/routes/integracoes_sigvoos.ts
src/routes/lms-assets.ts
src/routes/lms-cursos.ts
src/routes/lms-matriculas.ts
src/routes/notificacoes-convocacao.ts
src/routes/treinamentos-planejados.ts
src/services/backup/orchestrator.ts
src/services/importacao/QualificacaoHistoricoImportacao.ts
src/services/qualificacoes-historico-ficha.ts
src/services/sigvoos-frms.ts
src/types/exceljs-browser.d.ts      ← novo: declaração de módulo
src/types/index.ts
src/utils/auditoria.ts
docs/PHASE_2_TYPECHECK_BASELINE_SUMMARY.txt
docs/PHASE_2_TYPECHECK_STABILIZATION_REPORT.md
```

---

## Padrões Técnicos Usados com Cautela

Todos são **correções de compatibilidade de tipagem**, não mudanças de regra de negócio.

### `Context<any>` / `Context` sem genérico
**Usado em:** `admin-perfis.ts`, `lms-cursos.ts`, helpers de shared routes.

**Justificativa:** Padrão estabelecido no projeto (já presente em `getEmpresaIdSafe`, `frms-shared.ts`). O problema é estrutural: middleware `auth()` apaga o tipo `Variables` do contexto Hono. Funções auxiliares que recebem `c` depois do middleware não conseguem tipar o contexto com precisão sem `Context<any>`. A regra de negócio (autenticação, autorização) é aplicada pelo middleware — o tipo `any` é só na camada de tipagem da função auxiliar.

### `as never` / `'key' as never`
**Usado em:** `lms-matriculas.ts`, `fix-renovadas.ts`.

**Justificativa:** Padrão já em uso em `lms-matriculas.ts` (`c.get('userId' as never)`). Hono's `c.get(key)` exige que `key` seja uma chave do tipo `Variables`. Quando `Variables = {}` (rota sem genérico), qualquer chave falha. O cast `as never` é o workaround idiomático para acessar variáveis de contexto em rotas sem tipo `Variables` explícito. O valor em runtime é correto — o middleware já populou a variável.

### `as unknown as T` (double-cast)
**Usado em:** `frms.ts` (`limites as unknown as Record<string, number>`), `integracoes_sigvoos.ts`.

**Justificativa:** Necessário quando dois tipos são mutuamente incompatíveis mas sabemos que em runtime o valor satisfaz o target. Ex.: `LimitesMap` tem campos com tipos específicos (`number`) que TS não consegue assignar diretamente a `Record<string, number>` sem a passagem por `unknown`. Não muda o valor — apenas ajusta a visão do compilador.

### `statusFinal?: string` (parâmetro opcional)
**Usado em:** `qualificacoes-historico-ficha.ts`.

**Justificativa:** A função `reconcileQualificacaoHistoricoExistente` tinha 6 parâmetros obrigatórios, mas um call-site interno passava apenas 5 (TS2554). Adicionar `statusFinal` como argumento teria mudado o comportamento (confirmado por teste quebrado). Tornando-o opcional (`?`), o call-site de 5 args recebe `undefined` — idêntico ao comportamento original em JavaScript, onde argumentos ausentes são `undefined`. A lógica interna já trata `undefined` de forma diferente de uma string, e esse comportamento é o correto segundo os testes.

---

## Fixes por Cluster

### Cluster A — `lms-cursos.ts` (17 erros → 0)
- `Parameters<typeof app.get>[1]` → `Context` (Hono infere `never` após `app.use()`)
- `FormDataEntryValue` → `string` (tipo DOM não existe no runtime Workers)
- Cast `as File | string | null` para `instanceof File` em `FormData.get()`
- Narrowing de `tipo_conteudo` antes de `attachUploadedContentToCurso`
- Cast `as D1Database` em `c.env.DB` dentro de helper com contexto any

### Cluster B — `frms-shared.ts`, `frms.ts` (28 erros → 0)
- `FrmsAppContext` com `Variables: Partial<Variables>` (rotas de manutenção sem auth)
- Double-cast `limites as unknown as Record<string, number>`
- Narrowing explícito `quinzena: 'Q1' | 'Q2' | undefined`
- `empresaId ?? null` nos 4 call-sites de `registrarEventoSigvoosEmail`

### Cluster C — `integracoes_sigvoos.ts`, `sigvoos-frms.ts`, teste (29 erros → 0)
- `SigvoosRuntimeEnv`: `Record<string, unknown>` → interface específica
- `(c as any)` para chamada de `requireRole` (path `"*"` vs `string` no genérico)
- Removidos `chunkDays: undefined, retryAttempts: undefined` (não existem em `SigvoosSyncInput`)
- Cast `formatted.status as 400 | 401 | 500 | 502` para `StatusCode` do Hono
- Cast `eventos as { status: string; payload_json: string | null }[]` nos call-sites
- Mock de `SigvoosGroupedDay` completado com 4 campos faltantes
- Call de `buildSigvoosMonthlyPreview` com `identificadorSigvoos` e `fonteResolucao`

### Cluster D — `lms-matriculas.ts` (12 erros → 0)
- Null guards `if (!concorrente) throw/continue` após `canReuseMatriculaCycle`
- `c.get('userId' as never)` e `c.get('userRole' as never)` (padrão do arquivo)

### Cluster E — `admin-perfis.ts`, `fix-renovadas.ts` (9 erros → 0)
- Helper `savePerfisPermissoes`: `Context` em vez de `Parameters<...>`
- `userId` extraído de `c.get()` em vez de `TenantContext` (não está na interface)
- `c.get('empresaId' as never)` em `fix-renovadas.ts`

### Cluster F — `lms-assets.ts` (6 erros → 0)
- `ensureCourseAssetAccess` e `ensureH5pAssetAccess`: `Record<string, unknown>` → `JwtPayload`
- `JwtPayload` já contém `empresa_id`, `role`, `funcionario_id` — sem perda de informação

### Cluster G — `treinamentos-planejados.ts` (4 erros → 0)
- `db: any` → `db: D1Database` em `resolveGestoresCcByParticipantes` (resolve TS2347 e TS7006)
- `CONVOCACAO_EMAIL` coberto pela expansão do `acao` union em `auditoria.ts`

### Cluster H — `auth.ts` (4 erros → 0)
- `(body as { email?: string }).email` em vez de `body?.email` em union `{email?:string}|{}`
- `logger.warn('...', { error: toError(e).message })` — `Logger.warn` pede `Record<string,unknown>`
- `impersonated_by?: number` adicionado a `JwtPayload` (campo real, já usado em runtime)

### Cluster I — `QualificacaoHistoricoImportacao.ts` (3 erros → 0)
- `tiposMap: Map<string, { id: number; validade: number|null; vencimento_fim_mes: number }>`
- O campo `id` já era stored no map — tipo apenas não o declarava

### Cluster J — Various (13 erros → 0)
- `auditoria.ts`: `acao` expandido com `'BULK_UPDATE' | 'CONVOCACAO_EMAIL' | 'IMPERSONATE'`
- `backup/orchestrator.ts`: `objeto.uploaded.toISOString()` → `String(objeto.uploaded)` (R2 já retorna string)
- `escalas-alocacoes-helpers-internal.ts`: `id?: string | null` no type de `conflito`
- `src/types/exceljs-browser.d.ts`: declaração de módulo para bundle browser do exceljs
- `ficha360.ts`: cast `(funcionarioNormalizado as Record<string,unknown>).funcao`
- `funcionarios.ts`: `ApiResponse<Funcionario>` → `ApiResponse` (campo `treinamentos` extra)
- `notificacoes-convocacao.ts`: `funcionario_email: string | null` → `string` (sempre normalizado)
- `qualificacoes-historico-ficha.ts`: `statusFinal?: string` (opcional, preserva comportamento)
- `admin-usuarios.ts`: `logger.warn('...', { error: String(emailError) })`
