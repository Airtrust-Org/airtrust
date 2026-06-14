# AirTrust — Inventário de Dívida Técnica

> **Versão do documento:** 1.0 | **Data:** 2026-06-12 | **HEAD:** `5be104893`

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Erros TypeScript no Worker](#2-erros-typescript-no-worker)
3. [Migrations com Número Duplicado](#3-migrations-com-número-duplicado)
4. [Código Morto e Artefatos](#4-código-morto-e-artefatos)
5. [Problemas de Configuração](#5-problemas-de-configuração)
6. [Problemas de Build](#6-problemas-de-build)
7. [Problemas de RBAC](#7-problemas-de-rbac)
8. [Problemas de Auditoria e Dados](#8-problemas-de-auditoria-e-dados)
9. [Bugs Latentes](#9-bugs-latentes)
10. [Arquivos Não Comitados](#10-arquivos-não-comitados)
11. [Matriz de Risco](#11-matriz-de-risco)

---

## 1. Visão Geral

Este documento cataloga toda a dívida técnica identificada no código do AirTrust
em 2026-06-12. Os itens são classificados por severidade e risco de runtime.

### Resumo

| Categoria | Count | Severidade Máxima |
|---|---|---|
| Erros TypeScript | 20 | 🟡 MÉDIO |
| Migrations duplicadas | 30 números | 🟡 MÉDIO |
| Código morto | 2 | 🟢 BAIXO |
| Problemas de config | 2 | 🔴 CRÍTICO |
| Problemas de build | 2 | 🟢 BAIXO |
| Problemas de RBAC | 1 | 🟡 MÉDIO |
| Problemas de auditoria | 2 | 🟡 MÉDIO |
| Bugs latentes | 2 | 🔴 CRÍTICO |
| Arquivos não comitados | 37 | 🟡 MÉDIO |

---

## 2. Erros TypeScript no Worker

### 2.1 lms-matriculas.ts — 6 erros TS2552

**Severidade**: 🟡 MÉDIO | **Risco de runtime**: 🟡 MÉDIO

```
TS2552: Cannot find name 'dataExpiracao'. Did you mean 'data_expiracao'?
```

| Linha | Contexto |
|---|---|
| 765 | `sendMatriculaEmail` — ciclo reset path |
| 824 | `sendMatriculaEmail` — new matricula path |
| 890 | `sendMatriculaEmail` — existing matricula path |
| 1005 | `sendMatriculaEmail` — batch: existing matricula with cycle |
| 1061 | `sendMatriculaEmail` — batch: new matricula |
| 1139 | `sendMatriculaEmail` — batch: concurrent update |

**Causa raiz**: Zod destructuring produz `data_expiracao` (snake_case), mas o código
referencia `dataExpiracao` (camelCase).

**Impacto**: `dataExpiracao` seria `undefined` → emails de matrícula podem ser enviados
sem data de expiração correta.

**Solução**: Renomear variável no destructuring ou nas chamadas.

---

### 2.2 lms-relatorios.ts — Erros de import

**Severidade**: 🟡 MÉDIO | **Risco de runtime**: 🟢 BAIXO

O arquivo `lms-relatorios.ts` faz imports de módulos que podem não existir em todos
os ambientes. Os relatórios são delegados para `repositories/lmsRelatoriosRepository.ts`.

---

### 2.3 setores-gestores.ts — Auditoria incompleta

**Severidade**: 🟢 BAIXO | **Risco de runtime**: 🟢 BAIXO

Usa `dados_antigos` em vez de `dados_anteriores` para auditoria. Convenção de
nomenclatura inconsistente — não quebra funcionalidade mas dificulta manutenção.

---

### 2.4 qualificacoes-historico-ficha.ts:416 — Argumentos incorretos

**Severidade**: 🔴 CRÍTICO | **Risco de runtime**: 🔴 CRÍTICO

Chamada de função com 5 argumentos onde a assinatura espera 6. O argumento faltante
pode causar comportamento incorreto ou erro em runtime.

---

### 2.5 backup/orchestrator.ts — TypeError latente ✅ RESOLVIDO

**Resolvido em**: commit `da5177af` (2026-06-14)

O campo `uploaded` do R2 era passado diretamente para `.toISOString()`. Corrigido via
`formatarUploadedAt()` que trata `Date`, string e unknown de forma segura.
Digest placeholder `sha256-${uuid}-${Date.now()}` também substituído por SHA-256 real
via `crypto.subtle.digest`. Teste unitário adicionado em
`worker-airtrust/src/__tests__/services/backup-orchestrator.test.ts`.

**Mitigação complementar em 2026-06-14**: restore drill local adicionado para
verificar `checksum-manifest.json`, SHA-256/tamanho/presença de artefatos e falhas
por corrupção/ausência/tamanho divergente, sem tocar produção ou D1 real. Ver
`docs/BACKUP_RESTORE_DRILL.md` e
`worker-airtrust/src/__tests__/services/backup-restore-drill.test.ts`.

**Limite remanescente**: ainda não é evidência regulatória completa; falta restore
em staging descartável com verificação de domínio, `record_hash`, `manifest_hash` e
chain quando Records Core existir.

---

### 2.6 Outros erros TypeScript (7 adicionais)

| Arquivo | Erro | Linha |
|---|---|---|
| `treinamentos-planejados.ts` | TS2339: Property does not exist | — |
| `notificacoes-convocacao.ts` | TS2345: Argument type mismatch | — |
| `QualificacaoHistoricoImportacao` | TS2322: Type assignment error | — |
| Demais rotas | Erros de tipo diversos | — |

---

## 3. Migrations com Número Duplicado

### 3.1 Duplicatas confirmadas

| Número | Arquivo A | Arquivo B |
|---|---|---|
| **0332** | `0332_create_audit_logs_compatible.sql` | `0332_normalize_edapp_historical_renewals.sql` |
| **0347** | `0347_lms_cursos_content_filename.sql` | `0347_lms_edapp_tenant_indexes.sql` |
| **0367** | `0367_classificar_dificuldade_sk76_restantes.sql` | `0367_sk76_reaquisicao_experiencia_recente.sql` |

### 3.2 Escala real

**30 números** apresentam duplicatas no diretório de migrations. A ordem de aplicação
é determinada **alfabeticamente** pelo nome do arquivo, não pelo número.

### 3.3 Risco

| Risco | Probabilidade | Impacto |
|---|---|---|
| Migration B dependente de A com mesmo número aplicada em ordem errada | 🟢 BAIXA (atualmente sem dependências cruzadas) | 🔴 ALTO (migration falha) |
| Confusão na manutenção (qual arquivo editar?) | 🟡 MÉDIA | 🟡 MÉDIO |
| Duplicatas futuras com dependências | 🟡 MÉDIA | 🔴 ALTO |

---

## 4. Código Morto e Artefatos

### 4.1 edappRouter importado mas não montado

**Severidade**: 🟢 BAIXO

No `index.ts`:
```typescript
import { edappRouter } from './routes/integracoes_edapp';
```

Este router NUNCA é montado via `app.route()`. Todo o prefixo `/api/integracoes/edapp`
é capturado por handlers 410 antes de chegar ao router.

**Impacto**: Código morto. Ocupa ~1142 linhas no bundle.

**Solução**: Remover o import e o arquivo `routes/integracoes_edapp.ts` após completar
a migração de dados históricos.

### 4.2 Cron EdApp reconciliation

**Severidade**: 🟢 BAIXO

O cron `*/10 * * * *` ainda está configurado no dashboard Cloudflare mas executa um
no-op (a integração EdApp retorna 410).

**Impacto**: Desperdício mínimo de recursos (executa a cada 10 minutos mas retorna
imediatamente).

---

## 5. Problemas de Configuração

### 5.1 Vite proxy para produção por padrão

**Severidade**: 🔴 CRÍTICO

Em `vite.config.ts`:
```typescript
const apiUrl = env.VITE_API_URL || (mode === 'development' ? '' : 'https://api.airtrust.online/api');
const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8787';
```

Se `VITE_DEV_PROXY_TARGET` for definido como `https://api.airtrust.online/api` no
`.env.local`, TODAS as requisições de dev vão para produção com credenciais reais.

**Mitigação parcial**: Console warning quando o target contém `airtrust.online`.
Mas não bloqueia.

**Solução**: Adicionar confirmação interativa ou bloqueio hard em dev.

### 5.2 .env.local não versionado mas pode conter alvo de produção

**Severidade**: 🔴 CRÍTICO

`.env.local` está no `.gitignore` mas não há validação de que as variáveis não
apontam para produção. Um desenvolvedor pode acidentalmente configurar o proxy
para produção e fazer alterações não intencionais.

---

## 6. Problemas de Build

### 6.1 Duplicatas no dist/

**Severidade**: 🟢 BAIXO

O build produz duplicatas ocasionais:
- `forms*.js` (2 cópias)
- `capture*.js` (2 cópias)

O script `remove-duplicate-build-assets.sh` faz a limpeza pós-build.

**Causa**: Comportamento do Vite/Rollup em algumas configurações de chunks manuais.

---

## 7. Problemas de RBAC

### 7.1 instrutor = manager (over-provisioning)

**Severidade**: 🟡 MÉDIO

No mapeamento de roles:
```typescript
function normalizeRuntimeRole(role: unknown): string {
  const normalized = normalizeAirtrustRole(role);
  if (normalized === 'COMPLIANCE') return 'GESTOR';
  if (normalized === 'EDITOR') return 'USUARIO';
  return normalized;
}
```

E no tenant middleware:
```typescript
// instrutor é mapeado para 'manager' (nível 80)
case 'instrutor': case 'instructor': return 'INSTRUTOR';
const ROLE_HIERARCHY = { ..., instructor: 60, ... };
```

Mas a função `normalizeRuntimeRole` mapeia `INSTRUTOR` para... precisa verificar.
Se `INSTRUTOR` fica como `INSTRUTOR` (nível 60), está correto. Se é overridden para
`GESTOR` (nível 80), há over-provisioning.

**Impacto**: Instrutores podem ter acesso a funcionalidades de gestor que não deveriam.

---

## 8. Problemas de Auditoria e Dados

### 8.1 setores-gestores usa `dados_antigos` vs `dados_anteriores`

**Severidade**: 🟢 BAIXO

Inconsistência de nomenclatura em campos de auditoria. Não afeta funcionalidade,
mas dificulta queries de auditoria cross-módulo.

### 8.2 Rotas de manutenção sem auth explícita

**Severidade**: 🟡 MÉDIO

Rotas em `isPublicPath` que dependem apenas de `MAINTENANCE_SECRET`:
- `POST /api/integracoes/sigvoos/maintenance/sincronizar-frms`
- `POST /api/frms/maintenance/reprocessar-lote`
- `POST /api/frms/maintenance/reprocessar-faixa`

Se `MAINTENANCE_SECRET` vazar, essas rotas podem ser abusadas sem qualquer outra
proteção.

**Mitigação**: Timing-safe comparison do secret.

---

## 9. Bugs Latentes

### 9.1 backup/orchestrator.ts — TypeError + digest placeholder ✅ RESOLVIDO

**Resolvido em**: commit `da5177af` (2026-06-14)

Ambos os bugs corrigidos: `formatarUploadedAt` trata `Date`/string/unknown; digest
usa SHA-256 real via Web Crypto API. Ver §2.5 e teste em
`worker-airtrust/src/__tests__/services/backup-orchestrator.test.ts`.

### 9.2 qualificacoes-historico-ficha.ts:416 — 5 args para função de 6

**Severidade**: 🔴 CRÍTICO | **Risco de runtime**: 🔴 CRÍTICO

Argumento faltante pode ser opcional no runtime mas a assinatura TypeScript exige 6.
Erro de compilação que pode mascarar comportamento incorreto.

---

## 10. Arquivos Não Comitados

### 10.1 HEAD atual: `5be104893`

37 arquivos com alterações não commitadas (ver `git status`):

| Arquivo | Tipo |
|---|---|
| `docs/AIRTRUST_SECTOR_ACCESS_AUDIT_20260612.md` | Novo (untracked) |
| `worker-airtrust/migrations/0406_sector_manager_access_control.sql` | Novo (untracked) |
| `worker-airtrust/src/routes/relatorios.ts` | Novo (untracked) |

---

## 11. Matriz de Risco

| Item | Probabilidade | Impacto | Risco | Ação |
|---|---|---|---|---|
| Vite proxy → produção | 🟡 MÉDIA | 🔴 CRÍTICO | 🔴 CRÍTICO | Bloquear em dev |
| `.toISOString()` em string | ✅ RESOLVIDO | — | — | Corrigido em da5177af |
| 5 args → função de 6 | 🟡 MÉDIA | 🔴 CRÍTICO | 🔴 CRÍTICO | Corrigir imediatamente |
| Migrations duplicadas (30) | 🟢 BAIXA | 🔴 ALTO | 🟡 MÉDIO | Renumber quando seguro |
| Erros TS lms-matriculas (6) | 🟡 MÉDIA | 🟡 MÉDIO | 🟡 MÉDIO | Corrigir camelCase |
| Rotas manutenção sem auth | 🟢 BAIXA | 🟡 MÉDIO | 🟢 BAIXO | Adicionar auth |
| instrutor = manager RBAC | 🟡 MÉDIA | 🟡 MÉDIO | 🟡 MÉDIO | Revisar hierarquia |
| Código morto EdApp | 🟢 BAIXA | 🟢 BAIXO | 🟢 BAIXO | Limpar após migração |
| Duplicatas no dist/ | 🟡 MÉDIA | 🟢 BAIXO | 🟢 BAIXO | Investigar causa |
| Auditoria inconsistente | 🟢 BAIXA | 🟢 BAIXO | 🟢 BAIXO | Padronizar naming |

---

## Apêndice: Recomendações de Curto Prazo (Sprint Atual)

### 🔴 Bloqueantes (corrigir antes do próximo deploy)

1. ~~**backup/orchestrator.ts:318** — Remover `.toISOString()` em string~~ ✅ RESOLVIDO em da5177af
2. **qualificacoes-historico-ficha.ts:416** — Corrigir número de argumentos
3. **Vite proxy warning** — Adicionar bloqueio hard quando target aponta para produção

### 🟡 Importantes (planejar para o próximo sprint)

4. **lms-matriculas.ts** — Corrigir 6 erros `dataExpiracao` → `data_expiracao`
5. **Migrations duplicadas** — Plano de renumber para as 30 duplicatas
6. **Rotas de manutenção** — Adicionar fallback auth ou token dedicado

### 🟢 Desejáveis (backlog)

7. **EdApp cleanup** — Remover código morto após migração de dados
8. **RBAC review** — Auditar permissões efetivas de cada role
9. **Auditoria naming** — Padronizar `dados_antigos` → `dados_anteriores`
10. **Build duplicates** — Investigar causa raiz no Vite/Rollup
