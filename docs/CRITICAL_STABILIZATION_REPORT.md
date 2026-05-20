# Critical Stabilization Report

**Data:** 2026-05-14
**Branch:** main
**Commit de restauração:** `064e84fa7` — chore: checkpoint before critical stabilization fixes
**Commit final:** ver `git log --oneline -3`

---

## Resumo executivo

| Item | Status | Observação |
|------|--------|------------|
| Bug `funcionario` vs `funcionarioId` (lms-matriculas.ts:975-976) | ✅ Corrigido | TS2552 eliminado |
| Imports quebrados `lms-relatorios.ts` | ✅ Corrigido | TS2307 x2 eliminados |
| Campo `dados_antigos` → `dados_anteriores` (setores-gestores.ts) | ✅ Corrigido | TS2561 x2 eliminados |
| Campo `dados_antigos` em treinamentos-planejados.ts | ✅ Verificado | Grep confirmou: nenhuma ocorrência neste arquivo. Caminho correto: `worker-airtrust/src/routes/treinamentos-planejados.ts` |
| `MAINTENANCE_SECRET` tipado no `Env` | ✅ Corrigido | Eliminou TS2352 x3 (frms.ts + sigvoos) |
| Comparação timing-safe via `crypto.subtle.timingSafeEqual` | ✅ Corrigido | `secureCompare` implementado em frms.ts e integracoes_sigvoos.ts |
| Rotas FRMS maintenance: casts removidos, 503, await | ✅ Corrigido | `isLocalMaintenanceRequest` e `hasValidMaintenanceSecret` agora async |
| Secret hardcoded SIGVOOS removido | ✅ Corrigido | Token `sigvoos-frms-sync-2026-04` substituído por `c.env.MAINTENANCE_SECRET` + `secureCompare` |
| Vite proxy não aponta produção por padrão | ✅ Corrigido | Padrão → `http://localhost:8787` com aviso se prod |
| RBAC instrutor analisado | 📋 Pendência | 148 rotas dependem de `manager` — risco de breaking change |
| Migrations duplicadas documentadas | 📋 Registrado | Sem alteração |

---

## Correções aplicadas

### 1. Bug `funcionario` fora de escopo — `lms-matriculas.ts` linhas 975-976

- **Arquivo:** `worker-airtrust/src/routes/lms-matriculas.ts`
- **Problema:** `const funcionario` declarada dentro do bloco `try` externo (linha 822) era referenciada dentro do bloco `catch` (linhas 975-976), onde não está em escopo. TypeScript TS2552: "Cannot find name 'funcionario'. Did you mean 'funcionarioId'?"
- **Correção:**
  ```typescript
  // Antes (bugado — funcionario fora de escopo no catch)
  funcionario_id: funcionario.id,
  funcionario_nome: funcionario.nome,
  // Depois
  funcionario_id: funcionarioId,
  funcionario_nome: funcionariosPorId.get(funcionarioId)?.nome ?? null,
  ```
- **Compatibilidade:** `funcionarioId` é o loop variable sempre em escopo; `funcionariosPorId` é o Map declarado na função, acessível no catch.

### 2. Imports quebrados — `lms-relatorios.ts` linhas 9-10

- **Arquivo:** `worker-airtrust/src/routes/lms-relatorios.ts`
- **Problema:** `'../config/env'` e `'../shared/types'` não existem. Padrão do codebase: todos os routes importam de `'../types'`.
- **Correção:**
  ```typescript
  // Antes
  import type { Env } from '../config/env';
  import type { Variables } from '../shared/types';
  // Depois
  import type { Env, Variables } from '../types';
  ```

### 3. Campo de auditoria — `setores-gestores.ts` linhas 224 e 265

- **Arquivo:** `worker-airtrust/src/routes/setores-gestores.ts`
- **Problema:** `registrarAuditoria` (em `utils/auditoria.ts`) define `dados_anteriores`. O código passava `dados_antigos` — propriedade inexistente no tipo `AuditoriaParams` (TS2561 x2).
- **Correção:** Renomeação do campo nas duas chamadas.
- **Nota:** `treinamentos-planejados.ts` verificado — grep confirmou zero ocorrências de `dados_antigos` neste arquivo. O caminho `worker-airtrust/src/worker-airtrust/src/routes/treinamentos-planejados.ts` (com duplicação) mencionado no relatório técnico original não existe; o caminho correto é `worker-airtrust/src/routes/treinamentos-planejados.ts`.

### 4. `MAINTENANCE_SECRET` tipado no `Env` — `types/index.ts`

- **Arquivo:** `worker-airtrust/src/types/index.ts`
- **Problema:** `MAINTENANCE_SECRET` não estava na interface `Env`, forçando casts `(c.env as Record<string, string | undefined>)` que geravam TS2352 em frms.ts e integracoes_sigvoos.ts.
- **Correção:** `MAINTENANCE_SECRET?: string` adicionado à interface `Env`.

### 5. `secureCompare` via `crypto.subtle.timingSafeEqual` — `frms.ts` e `integracoes_sigvoos.ts`

- **Arquivos:** `worker-airtrust/src/routes/frms.ts`, `worker-airtrust/src/routes/integracoes_sigvoos.ts`
- **Problema:** Comparações de secret usando `===` — vulnerável a timing attack.
- **Implementação correta para Cloudflare Workers** (não usa Node `crypto.timingSafeEqual`; não usa XOR JS puro; sem early-return por comprimento — evita vazar o tamanho do secret via timing):
  ```typescript
  async function secureCompare(a: string, b: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const [aHash, bHash] = await Promise.all([
      crypto.subtle.digest('SHA-256', encoder.encode(a)),
      crypto.subtle.digest('SHA-256', encoder.encode(b)),
    ]);
    return crypto.subtle.timingSafeEqual(aHash, bHash);
  }
  ```
  Ambas as strings são reduzidas a SHA-256 (32 bytes fixos) antes da comparação, eliminando o `if (aBytes.length !== bBytes.length) return false` que vazaria o comprimento do secret por timing. `crypto.subtle.timingSafeEqual` é uma extensão não-padrão disponível no runtime Cloudflare Workers. Ajuste aplicado em 2026-05-14 conforme recomendação da documentação Cloudflare.
- **Aplicação:**
  - `frms.ts`: `isLocalMaintenanceRequest` e `hasValidMaintenanceSecret` convertidos para `async`; ambos usam `await secureCompare(...)` internamente; callers nos dois routes (`reprocessar-lote`, `reprocessar-faixa`) atualizados para `await`.
  - `integracoes_sigvoos.ts`: `isLocalMaintenanceRequest` convertida para `async` com `secureCompare`; rota `/maintenance/sincronizar-frms` usa `await secureCompare(...)` para validação final.
- **Adicionado:** Checagem explícita 503 quando `MAINTENANCE_SECRET` não está configurado, antes de qualquer validação de token, em ambos os routes FRMS e no SIGVOOS.

### 6. Secret hardcoded removido — `integracoes_sigvoos.ts`

- **Arquivo:** `worker-airtrust/src/routes/integracoes_sigvoos.ts`
- **Problema:** `POST /maintenance/sincronizar-frms` verificava `x-airtrust-maintenance !== 'sigvoos-frms-sync-2026-04'` — token fixo exposto no código-fonte.
- **Correção:** Substituído por `c.env.MAINTENANCE_SECRET` com `secureCompare`. Token hardcoded eliminado do código.
- **Ação operacional:** configurar `MAINTENANCE_SECRET` via `wrangler secret put MAINTENANCE_SECRET --env production` antes do próximo deploy se ainda não configurado.

### 7. Vite proxy — `vite.config.ts`

- **Arquivo:** `vite.config.ts`
- **Problema:** Fallback padrão `'https://api.airtrust.online'` fazia devs sem `VITE_DEV_PROXY_TARGET` bater em produção inadvertidamente.
- **Correção:** Padrão alterado para `'http://localhost:8787'` com aviso via `console.warn` se o proxy apontar para `airtrust.online`.

---

## Validações executadas

| Comando | Resultado | Erros antes | Erros depois |
|---------|-----------|-------------|--------------|
| `npx tsc --noEmit` (worker-airtrust/) | PASS parcial | 129 erros | 120 erros (-9) |
| `npm run guard:auth-boundaries` (raiz) | ✅ PASS | — | OK |
| `npm run guard:tracked-secrets` (raiz) | ✅ PASS | — | OK |

### Erros TypeScript eliminados (9 total):

| Arquivo | Linha | Erro | Tipo |
|---------|-------|------|------|
| `lms-relatorios.ts` | 9 | Cannot find module `../config/env` | TS2307 |
| `lms-relatorios.ts` | 10 | Cannot find module `../shared/types` | TS2307 |
| `setores-gestores.ts` | 224 | `dados_antigos` not in `AuditoriaParams` | TS2561 |
| `setores-gestores.ts` | 265 | `dados_antigos` not in `AuditoriaParams` | TS2561 |
| `lms-matriculas.ts` | 975 | Cannot find name `funcionario` | TS2552 |
| `lms-matriculas.ts` | 976 | Cannot find name `funcionario` | TS2552 |
| `frms.ts` | 926 | Cast `Env → Record<string,…>` inseguro | TS2352 |
| `frms.ts` | 947 | Cast `Env → Record<string,…>` inseguro | TS2352 |
| `integracoes_sigvoos.ts` | 28 | Cast `Env → Record<string,…>` inseguro | TS2352 |

### Erros TypeScript remanescentes (120) — justificativa por cluster:

Todos os 120 erros são **pré-existentes** (presentes antes do commit de restauração `064e84fa7`) e estão fora do escopo desta fase de estabilização crítica, que tem escopo estritamente delimitado aos bugs confirmados pelo relatório técnico de 2026-05-13.

| Arquivo | Qtd | Justificativa |
|---------|-----|---------------|
| `src/routes/lms-cursos.ts` | 28 | Arquivo extenso com erros de tipagem CRUD pre-existentes (overload mismatches, null checks). Não referenciado no relatório técnico. Escopo: fase 2. |
| `src/routes/frms.ts` | 18 | Erros pre-existentes: `LimitesMap` cast para `Record<string,number>` (TS2352 x5), `userRole`/`userEmail` não existem no tipo `Variables` restrito do contexto FRMS (TS2769 x4), `string | undefined` não assignable a `"Q1" | "Q2"` (TS2345), `number | undefined` vs `number | null` (TS2345 x3). Todos pré-existem ao checkpoint `064e84fa7`. |
| `src/routes/integracoes_sigvoos.ts` | 17 | `SigvoosRuntimeEnv` requer index signature que `Env` não tem (TS2345 x10+). Corrigir exige adicionar index signature ao `Env` ou refatorar `SigvoosRuntimeEnv` — escopo fase 2. Um erro de `chunkDays` (TS2353) indica campo removido do schema. |
| `src/routes/lms-matriculas.ts` | 14 | `concorrente` possibly `null` (TS18047 x8) — `findLatestMatriculaForFuncionario` retorna `T | null` mas código usa sem guardrail. Corrigir requer adicionar null checks em vários pontos do fluxo de reconciliação de concorrência — escopo fase 2. Erros 1538-1539: overload mismatch pré-existente. |
| `src/routes/admin-perfis.ts` | 7 | `TenantContext` não tem `userId`, `req`, `env`, `json` — erro de tipagem de contexto Hono em rota de perfis administrativos. Pré-existente. |
| `src/routes/lms-assets.ts` | 6 | Erros de tipagem no módulo de assets LMS. Pré-existentes. |
| `src/routes/treinamentos-planejados.ts` | 4 | Erros pré-existentes de tipagem neste arquivo. **Confirmado:** nenhum `dados_antigos` neste arquivo — o campo de auditoria está correto aqui. |
| `src/routes/auth.ts` | 4 | `email` possivelmente undefined (TS2339), `Error` não assignable a `Record<string,unknown>` (TS2345 x2), `impersonated_by` não no tipo `JwtPayload` (TS2353). Pré-existentes. |
| `src/services/importacao/QualificacaoHistoricoImportacao.ts` | 3 | Erros de tipagem no serviço de importação. Pré-existentes. |
| `src/cron/scheduled-handler.ts` | 3 | `Env` não assignable a `SigvoosRuntimeEnv` — mesma causa raiz do cluster integracoes_sigvoos. Pré-existente. |
| `src/__tests__/routes/escalas-alocacoes-helpers.test.ts` | 3 | Tipo de mock não tem campo `id`. Erros em teste. Pré-existentes. |
| `src/routes/fix-renovadas.ts` | 2 | Contexto Hono sem variáveis (`empresaId` não existe). Pré-existente. |
| `src/routes/setores-gestores.ts` | 1 | `'BULK_UPDATE'` não assignable a `"UPDATE" \| "INSERT" \| "DELETE"` (TS2322). Não estava no escopo do relatório técnico. Registrado como pendência P4. |
| Outros (1 cada) | 8 | `exportacao.ts` (exceljs sem types), `ficha360.ts` (funcao missing), `funcionarios.ts`, `horas-voo.ts`, `importacao-xlsx.ts`, `notificacoes-convocacao.ts`, `backup/orchestrator.ts`, `qualificacoes-historico-ficha.ts`, `__tests__/services/sigvoos-frms.test.ts` — todos pré-existentes, todos fora do escopo desta fase. |

---

## Migrations duplicadas identificadas

| Prefixo | Arquivos |
|---------|----------|
| `0332` | `0332_create_audit_logs_compatible.sql`, `0332_normalize_edapp_historical_renewals.sql` |
| `0347` | `0347_lms_cursos_content_filename.sql`, `0347_lms_edapp_tenant_indexes.sql` |
| `0367` | `0367_classificar_dificuldade_sk76_restantes.sql`, `0367_sk76_reaquisicao_experiencia_recente.sql` |

**Nenhum arquivo foi alterado.**

**Antes de qualquer renumeração**, verificar estado real do D1:
```bash
npx wrangler d1 execute airtrust-db --env production \
  --command "SELECT name FROM d1_migrations ORDER BY applied_at DESC LIMIT 30" \
  --remote
```

---

## Pendências para próxima fase

### P1 — RBAC: instrutor mapeado para `manager` (over-provisioning)
- **Arquivo:** `worker-airtrust/src/middleware/rbac.ts`
- **Impacto:** 148 rotas aceitam `requireRole('admin', 'manager')`. Criar nível `instructor` e ajustar rotas individualmente requer mapeamento via logs de produção.
- **Critério para avançar:** identificar rotas que instrutores realmente usam antes de restringir.

### P2 — 120 erros TypeScript remanescentes
Todos pré-existentes. Clusters principais: `lms-cursos.ts` (28), `frms.ts` (18), `integracoes_sigvoos.ts` (17), `lms-matriculas.ts` (14). Ver tabela acima.

### P3 — `setores-gestores.ts:329`: `'BULK_UPDATE'` inválido
`acao: 'BULK_UPDATE'` não é assignable ao tipo `"UPDATE" | "INSERT" | "DELETE"` em `AuditoriaParams`. Não estava no escopo do relatório técnico de 2026-05-13.

### P4 — Ação operacional: MAINTENANCE_SECRET em produção
Verificar se o secret está configurado antes do próximo deploy:
```bash
wrangler secret list --env production
# Se ausente:
wrangler secret put MAINTENANCE_SECRET --env production
```

---

## Como reverter

```bash
# Reverter commits desta fase (mantendo o checkpoint)
git revert HEAD~1..HEAD

# Ou voltar ao ponto de restauração (descarta tudo depois do checkpoint)
git reset --hard 064e84fa7
```
