# AirTrust — Baseline de Sanitização e Convergência do Repositório
**Data:** 2026-06-30  
**Fase:** 0 — Pré-auditoria de Qualificações/Validades  
**Auditor:** Claude Sonnet 4.6 (modo somente-leitura)  
**Regra:** NENHUM deploy, migration, DML remoto, backfill ou alteração de código foi executado.

---

## 1. Estado Git

| Item | Valor |
|---|---|
| Branch atual | `main` |
| HEAD local | `644fed3c5391c3f531999805bee09024be94ec6f` |
| origin/main | `644fed3c5391c3f531999805bee09024be94ec6f` |
| Divergência local vs remote | **0 ahead / 0 behind** |
| Working tree | **LIMPO** (sem arquivos modificados ou untracked) |
| Stashes | **1 stash presente** (ver seção 4) |
| Worktrees adicionais | Nenhum |

**Conclusão:** Repo limpo, branch conhecida, sem divergência.

---

## 2. Worker em Produção vs HEAD

| Item | Valor |
|---|---|
| Worker prod (`/api/version`) | `c58785d` — 2026-06-30T21:39:03Z |
| HEAD local | `644fed3` |
| Diferença | **1 commit atrás** |
| Commit faltante | `644fed3 fix(modals): adicionar max-height+overflow em 15 modais para evitar corte em viewports baixas` |
| Arquivos do commit faltante | **Somente frontend** (`src/react-app/**`) — sem arquivos de Worker |

**Conclusão:** Worker prod está efetivamente atualizado para backend. O delta é Pages-only. **NÃO HÁ RISCO de backend desatualizado.**

> Commit `c58785d` = Merge branch 'fix/qualificacoes-modelos-validade-null-clear' — último PR de Qualificações mergeado (PR #214). Worker está na versão correta do backend de Qualificações.

---

## 3. PRs Abertos

### PRs abertos que tocam Qualificações/LMS/Compliance

| PR | Título | Arquivos tocados | Risco |
|---|---|---|---|
| #168 | Bolt: Optimize dataset derivations — Qualificações sort | `src/react-app/pages/Qualificacoes.tsx` | **MÉDIO** — toca o mesmo arquivo do problema |
| #160 | Bolt: Memoize derived requirements — ComplianceMatrix | `ComplianceMatrix.tsx` | BAIXO — sem relação com validade |
| #158 | docs(lms): audit SCORM requirements | docs only | MÍNIMO |
| #157 | docs(lms): blocked post-deploy validation | docs/DRAFT | MÍNIMO |

### PRs abertos genéricos (sem relação direta)

25+ PRs abertos de performance (Bolt), acessibilidade (Palette), docs, ops e LMS — nenhum toca `tipos.ts`, `historico.ts` ou lógica de validade de forma crítica.

**PRs Draft:** #157, #124, #108, #103 — todos DRAFT, não serão mergeados sem ação explícita.

---

## 4. Stash Existente — DEVE SER PRESERVADO

```
stash@{0}: WIP on fix/qualificacoes-modelos-validade-zero-guard: 3b5d192
```

### Arquivos no stash
| Arquivo | Natureza da mudança |
|---|---|
| `src/react-app/components/modals/ModalRenovarQualificacao.tsx` | UX: scroll block, Escape handler, overflow layout |
| `src/react-app/pages/Qualificacoes.tsx` | Lógica: prioriza `tipo_validade_atual` sobre `historico_validade_meses` ao calcular `validadeMesesEfetiva` |
| `worker-airtrust/src/__tests__/routes/qualificacoes-historico-status-sort.test.ts` | **NOVO ARQUIVO** — testes para priorização de validade do tipo |
| `worker-airtrust/src/routes/qualificacoes/historico.ts` | Expõe `tipo_validade_atual` join em query |
| `worker-airtrust/src/routes/qualificacoes/tipos.ts` | Update condicional de historico (`shouldUpdateValidade`, `shouldUpdateVencimento`) |

### Análise do stash

O stash foi criado na branch `fix/qualificacoes-modelos-validade-zero-guard` (commit `3b5d192`), que foi **mergeada como PR #213**. Porém, o stash contém **trabalho adicional não mergeado** que vai além do PR #213:

1. **Core do problema não resolvido**: A lógica de calcular `validadeMesesEfetiva` no frontend ainda usa `historico_validade_meses` (o valor antigo) como fonte primária. O stash propõe inverter para `tipo_validade_atual` como prioridade — exatamente o bug reportado (troca 36→24 não reflete no cálculo de vencimento).

2. **Backend**: O stash adiciona `qt.validade AS tipo_validade_atual` ao JOIN do histórico — não está em produção.

3. **Testes**: O arquivo de testes `qualificacoes-historico-status-sort.test.ts` não existe no HEAD atual — é trabalho novo.

**CLASSIFICAÇÃO: DEVE SER PRESERVADO. Este stash contém a base da correção que precisa ser implementada na fase de auditoria.**

---

## 5. Branches Locais

Total: **33 branches locais** além de `main`. Classificação:

### Branches relevantes para Qualificações (podem ter conflito)
| Branch | Status | Risco |
|---|---|---|
| `fix/qualificacoes-modelos-validade-null-clear` | Mergeada (PR #214) | BAIXO — já em main |
| `fix/qualificacoes-modelos-validade-zero-guard` | Mergeada (PR #213) | BAIXO — já em main, stash pendente |
| `fix/qualificacoes-modelos-validade-save` | Mergeada (PR #212) | BAIXO |
| `fix/qualificacoes-planejadas-history-final` | Mergeada (PR #207) | BAIXO |
| `fix/qualificacoes-planejados-logic-modal` | Mergeada (PR #204) | BAIXO |

### Branches stale (antigas, sem PRs abertos)
`backup/main-pre-pr173-sync`, `codex/lms-*` (6 branches), `docs/lms-scorm-*`, `feat/frms-*`, etc. — podem ser limpas depois, não bloqueiam.

### Branches em produção/staging potencialmente afetadas
`hotfix/pages-rollback-frms-v2` — mergeada (PR #193). Apenas FRMS.

---

## 6. Migrations

### Estado geral
- **Total de migrations:** 382 arquivos no diretório
- **Sequência:** 0001 a 0411 (com gaps históricos normais)

### Migrations suspeitas (NÃO sequenciais)
| Arquivo | Problema | Ação |
|---|---|---|
| `9999_add_modelo_sessao_id_to_agendamentos.sql` | Número fora do padrão (9999), data 2025-01-28, já aplicada | Inofensiva se já aplicada; confirmar |
| `132_add_funcionario_ativo.sql` | Formato antigo (sem zero-pad), provavelmente já aplicada | Inofensiva |
| `0098-indices-performance.sql` | Hífen em vez de underscore | Inofensiva |
| `purge-soft-deleted-qualificacoes.sql` | **DML DESTRUTIVO** (DELETE de 2179 registros de qualificacoes_historico) sem número sequencial | **RISCO ALTO** — não deve ser aplicada automaticamente |

### Gap crítico: 0406 não existe
- Sequência vai `0405_add_shared_session_backend.sql` → `0407_qualificacoes_tipos_setores.sql`
- **0406 está faltando** — pode ser gap intencional ou migration deletada. Confirmar com histórico git.

### Migrations recentes de Qualificações/LMS
| Migration | Tema |
|---|---|
| `0407_qualificacoes_tipos_setores.sql` | Setores para tipos de qualificações |
| `0408_lms_cursos_setores.sql` | Setores para cursos LMS |
| `0409_lms_cursos_setores_backfill.sql` | Backfill setores LMS |

Nenhuma migration pendente identificada no domínio de `validade_meses`.

### Script perigoso em migrations/
```sql
-- purge-soft-deleted-qualificacoes.sql
-- Remove permanentemente 2179 registros de qualificacoes_historico
DELETE FROM qualificacoes_historico WHERE deleted_at IS NOT NULL;
```
**Este arquivo não deve ser executado sem autorização explícita e análise de impacto.**

---

## 7. Validações Locais

### Lint
| Guard | Resultado |
|---|---|
| `lint:api-base` | ✅ PASS |
| `guard:tracked-secrets` | ✅ PASS |
| `guard:auth-boundaries` | ✅ PASS |
| `guard:empresa-default1` | ✅ PASS |
| `guard:duplicate-migrations` | ✅ PASS (382 migrations verificadas, 30 no allowlist histórico) |
| `guard:operational-sql-sources` | ✅ PASS |

### TypeScript
- `npx tsc --noEmit` — **SEM ERROS**

### Testes
- `npm run test:run` — **120 passed | 3 skipped (1115 tests) — ZERO FALHAS**
- Testes de Qualificações (`Qualificacoes.modelos-validade.test.ts`, etc.) passam.
- Testes de worker para Qualificações: o arquivo `qualificacoes-historico-status-sort.test.ts` do stash **ainda não existe** em HEAD — não é executado.

---

## 8. Inventário D1 Local (somente-leitura)

O D1 local tem dados de seed mínimos (não espelha produção).

### qualificacoes_tipos (local)
| categoria | validade | total |
|---|---|---|
| Manutenção | NULL | 2 |
| Manutenção | 24 | 10 |
| Outros | 24 | 1 |
| Tripulação | 12 | 1 |
| Tripulação | 24 | 1 |

**Observação:** Em produção, Manutenção deveria ter alguns tipos com `validade = 36` (valor legado que deveria ser 24). Os dados locais já mostram o valor corrigido — **o local não reproduz o bug de produção**.

### qualificacoes_historico (local)
- Total de registros ativos: 0 (DB local vazio para histórico)

### SELECTs preparados para inventário remoto (execução manual autorizada)

```sql
-- 1. Distribuição de validade por categoria em produção
SELECT categoria, validade, COUNT(*) as total
FROM qualificacoes_tipos
WHERE empresa_id = 6 AND deleted_at IS NULL
GROUP BY categoria, validade ORDER BY categoria, validade;

-- 2. Histórico sem data_vencimento
SELECT COUNT(*) as sem_vencimento
FROM qualificacoes_historico
WHERE empresa_id = 6 AND deleted_at IS NULL AND data_vencimento IS NULL;

-- 3. Status do histórico
SELECT status, COUNT(*) as total
FROM qualificacoes_historico
WHERE empresa_id = 6 AND deleted_at IS NULL
GROUP BY status ORDER BY status;

-- 4. Divergência validade tipo vs LMS
SELECT qt.id, qt.nome, qt.validade as validade_tipo, lc.validade_meses as validade_lms
FROM qualificacoes_tipos qt
JOIN lms_cursos lc ON lc.ead_qualificacao_codigo = qt.codigo
WHERE qt.empresa_id = 6 AND qt.validade != lc.validade_meses LIMIT 20;

-- 5. Histórico com validade_meses diferente do tipo atual (candidatos ao bug)
SELECT qh.id, qt.nome, qh.validade_meses AS hist_val, qt.validade AS tipo_val,
       qh.data_vencimento, qh.status
FROM qualificacoes_historico qh
JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_tipo_id
WHERE qh.empresa_id = 6 AND qh.deleted_at IS NULL
  AND qt.deleted_at IS NULL
  AND (qh.validade_meses != qt.validade OR (qh.validade_meses IS NOT NULL AND qt.validade IS NULL))
ORDER BY qt.nome LIMIT 50;
```

---

## 9. Auditoria de Backend — Qualificações (Inventário)

### Arquivos principais
| Arquivo | Responsabilidade |
|---|---|
| `worker-airtrust/src/routes/qualificacoes/tipos.ts` | CRUD de qualificacoes_tipos, incluindo update de validade + sync de histórico |
| `worker-airtrust/src/routes/qualificacoes/historico.ts` | Query principal do histórico com JOIN em tipos |
| `worker-airtrust/src/routes/qualificacoes/historico-write.ts` | Escrita no histórico |
| `worker-airtrust/src/routes/qualificacoes/historico-helpers.ts` | Helpers de status/dias |
| `worker-airtrust/src/routes/qualificacoes/shared.ts` | Tipos e helpers compartilhados |
| `worker-airtrust/src/routes/qualificacoes-reclass.ts` | Reclassificação/recálculo de status |
| `worker-airtrust/src/routes/qualificacoes-alertas.ts` | Alertas de vencimento |

### Constraint de banco (ativo em produção)
```sql
validade INTEGER CHECK(validade IS NULL OR validade > 0)
```
- `validade = 0` é **PROIBIDO pelo banco** — PR #213 alinhado corretamente.
- `validade = NULL` significa "sem vencimento" — usado para categoria "Outros".

### Comportamento do sync em tipos.ts (HEAD atual)
Quando `PUT /qualificacoes/tipos/:id` recebe `validade` novo:
1. Lê o registro atual do tipo.
2. Atualiza `qualificacoes_tipos.validade`.
3. Faz sync de `qualificacoes_historico` — **ATUALIZA `validade_meses` e `data_vencimento` de todos os registros vinculados**.
4. O sync usa a validade do snapshot, não do tipo recém-salvo diretamente.

**Ponto de falha identificado (inventário, não corrigido):**  
O campo `validade_meses` em `qualificacoes_historico` armazena o valor no momento do registro. Quando o tipo muda (36→24), o sync é feito em tipos.ts linhas ~1155-1169. Porém, a lógica de cálculo no frontend (`Qualificacoes.tsx`) usa `historico_validade_meses` (o campo local do registro) como fonte primária — mesmo após o sync. O stash corrige isso priorizando `tipo_validade_atual` (do JOIN com o tipo).

---

## 10. Auditoria de Frontend — Qualificações (Inventário)

### Hooks e cache
- `useQualificacoesRQ.ts` — TanStack Query para listas de qualificações
- `useQualificacoesMutations.ts` — mutations com invalidação de `qualificacoesKeys.lists()` e `detail(id)`
- `useTiposQualificacao.ts` — hook de tipos
- **Ausência de `exact: false` verificada** — invalidação usa keys.lists() genérico, deve acertar todo o cache

### Forma de envio de validade
Em `Qualificacoes.tsx` linha ~2594: `validade: null` ao limpar o campo — corrigido em PR #214.

### Cálculo de `validadeMesesEfetiva` (HEAD atual, problema não corrigido)
```ts
// Qualificacoes.tsx ~linha 2398-2419
const validadeMesesEfetiva = 
  r.validade_meses ??     // historico_validade_meses (pode estar desatualizado)
  r.validade ??           // campo alternativo 
  r.qualificacao_validade ?? // outro campo
  null;
```
O stash corrige para:
```ts
const hasTipoVinculado = Boolean(r.tipo_validade_atual);
const validadeMesesEfetiva = hasTipoVinculado
  ? (tipoValidadeAtual || historicoValidadeMeses || ...)
  : (historicoValidadeMeses || tipoValidadeAtual || ...);
```
**Este é o fix do problema de cálculo de dias/vencimento — não está em produção.**

### PR #168 (aberto) — risco de conflito
O PR #168 (Bolt) toca `Qualificacoes.tsx` com otimizações de sort. Se mergeado antes da correção de validade, pode criar conflito de merge não-trivial.

---

## 11. Classificação de Sujeira

| Item | Classificação | Ação |
|---|---|---|
| **Stash com fix parcial de Qualificações** | DEVE SER PRESERVADO | Não dropar. Base da fase de auditoria. |
| **PR #168 aberto (Qualificacoes.tsx)** | PODE BLOQUEAR se mergeado antes | Aguardar ou fechar antes de iniciar |
| `purge-soft-deleted-qualificacoes.sql` em migrations/ | PRECISA DECISÃO HUMANA | DML destrutivo fora do fluxo normal |
| `9999_add_modelo_sessao_id_to_agendamentos.sql` | PODE FICAR PARA DEPOIS | Verificar se já aplicado em prod |
| **Gap 0406** | PRECISA DECISÃO HUMANA | Confirmar se foi deletado intencionalmente |
| **33 branches locais stale** | PODE FICAR PARA DEPOIS | Limpeza não urgente |
| **25+ PRs abertos não relacionados** | PODE FICAR PARA DEPOIS | Não bloqueiam |
| **Worker prod 1 commit atrás** | INOFENSIVO | Delta é Pages-only |
| **D1 local vazio (sem dados de prod)** | REGISTRADO | Auditoria de dados requer remoto |

---

## 12. Riscos

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | `purge-soft-deleted-qualificacoes.sql` pode ser executado acidentalmente | ALTO | Renomear para `.disabled` ou mover para `scripts/` com aviso |
| R2 | PR #168 (Bolt) mergear antes da correção de validade cria conflito em Qualificacoes.tsx | MÉDIO | Fechar ou suspender PR #168 antes de iniciar |
| R3 | Stash perdido ou dropado inadvertidamente | MÉDIO | Documentado; criar branch de backup se necessário |
| R4 | Gap 0406 pode indicar migration deletada com alteração em produção | MÉDIO | Verificar git log para 0406 |
| R5 | Inventário de dados de produção não realizado (D1 remoto) | MÉDIO | SELECTs preparados; executar com autorização |
| R6 | Sync de historico em tipos.ts pode não ter sido executado para registros antigos (36→24) | ALTO | A ser confirmado com inventário remoto |

---

## 13. O Que Está Limpo

- Repo limpo, sem divergência
- Branch `main` conhecida e em sync com origin
- Lint 100% PASS (6 guards)
- TypeScript sem erros
- Testes 100% PASS (1115 testes)
- Worker prod em commit correto (backend)
- Migrations sequenciais sem duplicatas detectadas pelo guard
- PRs do domínio de validade (212, 213, 214) todos mergeados e em prod

---

## 14. O Que Está Sujo / Requer Atenção

1. **Stash não commitado** com fix parcial do problema principal
2. **`purge-soft-deleted-qualificacoes.sql`** — DML destrutivo sem número sequencial em `migrations/`
3. **Gap 0406** — migration faltante sem explicação registrada
4. **PR #168 aberto** — toca exatamente o arquivo central da correção
5. **Inventário remoto D1 não realizado** — não sabemos quantos registros têm validade_meses divergente do tipo

---

## 15. Decisão: GO / NO-GO para Auditoria de Qualificações

### Critérios avaliados

| Critério | Status |
|---|---|
| Repo em branch conhecida | ✅ |
| origin/main conhecido | ✅ |
| Sem divergência não explicada | ✅ |
| PRs concorrentes mapeados | ✅ |
| Deploy prod/staging identificado | ✅ Worker prod = c58785d (correto) |
| Migrations perigosas mapeadas | ✅ (purge script + gap 0406) |
| Nenhuma alteração local importante perdida | ✅ (stash documentado) |
| Nenhum comando mutável executado | ✅ |
| Build/lint/tests passando | ✅ |
| Inventário remoto de dados | ⚠️ PENDENTE (não bloqueante, SELECTs preparados) |

---

## ✅ DECISÃO: **GO** para auditoria de Qualificações

**Com as seguintes condições e ações pré-requisito:**

### Antes de iniciar a correção:

1. **[OBRIGATÓRIO]** Criar branch de backup do stash:
   ```bash
   git stash branch fix/qualificacoes-validade-audit-base
   ```
   Preservar o trabalho do stash em uma branch nomeada antes de qualquer operação.

2. **[RECOMENDADO]** Fechar ou suspender PR #168 (Bolt) enquanto a correção de validade está em andamento, para evitar conflito em `Qualificacoes.tsx`.

3. **[RECOMENDADO]** Executar SELECTs de inventário remoto (seção 8) com autorização — necessário para confirmar extensão do bug em produção (quantos registros têm `validade_meses` desatualizado).

4. **[INFORMATIVO]** `purge-soft-deleted-qualificacoes.sql` não deve ser executado nesta fase ou sem autorização explícita.

### O que a auditoria de Qualificações deve investigar:

1. **Por que a mudança 36→24 em `qualificacoes_tipos.validade` não reflete no cálculo de vencimento/dias no frontend?**
   - Confirmar se o sync em `tipos.ts` atualiza `qualificacoes_historico.validade_meses` ou apenas `data_vencimento`
   - Confirmar se o frontend usa `validade_meses` (historico) ou `validade` (tipo) como fonte de verdade

2. **Por que `validade = NULL` ("Outros") não persiste?**
   - Confirmar fluxo completo: form → payload → backend Zod → SQL UPDATE → resposta → cache

3. **O sync de historico é parcial ou total?**
   - Verificar se o sync em tipos.ts cobre todos os registros ou apenas os "mais recentes"

4. **A lógica do stash é a correção correta?**
   - Avaliar se priorizar `tipo_validade_atual` sobre `historico_validade_meses` é semanticamente correto para o domínio

---

*Baseline gerado em: 2026-06-30*  
*Nenhuma alteração foi feita ao código, banco, deploy ou configuração durante esta fase.*
