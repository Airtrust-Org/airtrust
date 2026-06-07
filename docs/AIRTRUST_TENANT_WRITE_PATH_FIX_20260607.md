# Lote -1 — Tenant Write Path Fix

**Data:** 2026-06-07  
**Commit:** `3ca7b7264fcd4124e8588743ee05a32e71a84337`  
**Branch:** `main`  
**Worker Version ID (pré-commit):** `bfa170cd-b0b5-408e-9cb4-3e11669aca2f`  
**Worker Version ID (pós-commit):** `d055d998-682e-4e87-ae5e-9d4ad7b56b4a`  

---

## Estado inicial

**HEAD inicial:** `a4fc4c9b171ced76c4daccfeb960861774a218a6`  
**Classificação prévia:** SANEAMENTO PARCIAL CONCLUÍDO — LOTES PENDENTES

O deploy havia sido publicado sem commit correspondente. Todos os arquivos estavam
unstaged (git diff não nulo, git diff --cached vazio). Este documento registra o
fechamento dessa lacuna.

---

## Regra de tenant

Todos os caminhos de escrita que previamente inseriam ou atualizavam linhas sem
filtro de tenant passaram a:

1. Resolver `empresaId` **exclusivamente** via `getTenantContext(c)` ou `getEmpresaId(c)`.
2. Onde o contexto não está diretamente disponível (serviços internos, batch ETL,
   FRMS triggers), resolver via `SELECT empresa_id FROM funcionarios WHERE id = ?`
   e lançar erro se não encontrado.
3. Propagar `empresa_id` nos `INSERT` e incluir `AND empresa_id = ?` nos `UPDATE`/
   `DELETE` scoped.

**Proibido nos writes:** `body.empresa_id`, `query.empresa_id`, `DEFAULT 1`,
`fallback 1`, constante `1`, funcionário sem validação de tenant.

---

## Arquivos alterados e classificação

| Arquivo | Classificação | Caminhos corrigidos |
|---|---|---|
| `src/index.ts` | LOTE_MINUS_1 | `qualificacoes_tipos` list — empresa_id guard |
| `src/lib/frms/db-service-jornadas.ts` | LOTE_MINUS_1 | `salvarJornada`, `atualizarJornada`, `importarApus` — resolveTripulanteEmpresaId |
| `src/routes/escalas-status.ts` | LOTE_MINUS_1 | FRMS jornada INSERT via escala trigger |
| `src/routes/importacao-xlsx.ts` | LOTE_MINUS_1 | Funcionários XLSX, histórico XLSX, tipos XLSX |
| `src/routes/importacao.ts` | LOTE_MINUS_1 | Import path empresa_id |
| `src/routes/pasta-virtual-extra.ts` | LOTE_MINUS_1 | documentos INSERT empresa_id |
| `src/routes/pasta-virtual.ts` | LOTE_MINUS_1 | soft-delete cascata empresa_id guard |
| `src/routes/qualificacoes-certificados.ts` | LOTE_MINUS_1 | DELETE cascata empresa_id |
| `src/routes/qualificacoes/atribuicao.ts` | LOTE_MINUS_1 | INSERT empresa_id |
| `src/routes/qualificacoes/historico-write.ts` | LOTE_MINUS_1 | INSERT empresa_id (renovação, planejamento, conclusão), soft-delete guard, JOIN guard |
| `src/routes/qualificacoes/tipos.ts` | LOTE_MINUS_1 | POST/PUT/DELETE empresa_id guard |
| `src/routes/simuladores-sessoes-participantes.ts` | LOTE_MINUS_1 | UPDATE via EXISTS subquery |
| `src/routes/simuladores-sessoes-update.ts` | LOTE_MINUS_1 | SELECT/UPDATE/soft-delete empresa_id |
| `src/routes/simuladores-sessoes.ts` | LOTE_MINUS_1 | Cross-tenant participant validation, INSERT empresa_id |
| `src/scripts/etlImport.ts` | LOTE_MINUS_1 | ETL batch empresa_id propagation |
| `src/services/funcionarios.service.ts` | LOTE_MINUS_1 | soft-delete historico cascade empresa_id |
| `src/services/importacao/QualificacaoTipoImportacao.ts` | LOTE_MINUS_1 | TENANT_CONTEXT_REQUIRED guard |
| `src/services/importacao/QualificacaoTipoImportacaoRefactored.ts` | LOTE_MINUS_1 | TENANT_CONTEXT_REQUIRED guard |
| `src/services/qualificacoes-g1-sem.ts` | LOTE_MINUS_1 | marcarG1SemAnteriorComoRenovada empresa_id |
| `src/services/sync-certificacoes-funcionarios.ts` | LOTE_MINUS_1 | getFuncionarioEmpresaId, getTipoId empresa_id |
| `src/__tests__/routes/qualificacoes-historico-write.test.ts` | TESTE | Atualização de mocks para novo SQL |
| `src/__tests__/routes/simuladores-sessoes-guards.test.ts` | TESTE | Atualização de mocks para empresa_id |
| `src/__tests__/services/qualificacoes-g1-sem.test.ts` | TESTE | Atualização de arg positions |
| `src/__tests__/security/tenant-write-paths.test.ts` | TESTE (NOVO) | Regressão estática: 6 cenários cross-tenant |

---

## Gates executados

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` (frontend) | PASS |
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | PASS |
| `npm run lint` (api-base + secrets + auth-boundaries) | PASS |
| `npm run build` | PASS (10.71s) |
| `npm run test:run` (frontend) | 636/636 PASS |
| `npm run test:worker` | 1017/1017 PASS |
| `tenant-write-paths.test.ts` | 6/6 PASS |

---

## Confirmações de segurança

- **rows_written em D1 de produção:** 0 (fase anterior de auditoria)
- **Nenhum `UPDATE` de saneamento** incluído neste diff
- **Nenhuma migration** executada
- **Nenhum backfill** executado
- **Nenhuma alteração FIRA** executada
- **Nenhuma alteração de aeronave** executada
- O diff **não executa** nenhum lote de saneamento dos dados existentes

---

## Resíduos pendentes (sem alteração neste lote)

| Tabela | Contagem | Situação |
|---|---|---|
| `qualificacoes_historico` | 324 ativos em empresa_id=1 ligados a funcionários empresa_id=6 | Pendente Lote 1 |
| `documentos` | 45 ativos em empresa_id=1 ligados a funcionários empresa_id=6 | Pendente Lote 2 |
| `pasta_virtual` | 60 ativos empresa_id NULL/1 ligados a funcionários empresa_id=6 | Pendente Lote 2 |
| `frms_jornada` | 667 ativos empresa_id IS NULL ligados a funcionários empresa_id=6 | Pendente Lote 3 |

---

## Classificação final

**LOTE -1 VERSIONADO, PUBLICADO E DRY-RUN PREPARADO**
