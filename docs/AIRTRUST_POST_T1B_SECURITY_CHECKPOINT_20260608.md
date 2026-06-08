# AIRTRUST — Checkpoint Pós T1-B e Próximo Lote de Segurança

Data: 2026-06-08
Branch: main

## 1. Estado consolidado

- A0 concluído: `4d59c5d` — funcionários tenant-safe.
- T1-A concluído: `4c43084` — `modelos_aeronave` com escrita restrita a admin.
- T1-B concluído: `f963a65` — `notificacoes_sistema` com `empresa_id`, migration `0392` aplicada, inserts ajustados e testes.
- UI/layout concluído: `115c1fb`.
- HEAD == origin/main == `115c1fb`.
- API saudável em `f963a65`.
- Frontend Pages em `115c1fb`.

## 2. Validações registradas

- TypeScript: PASS.
- Lint: PASS.
- Worker tests: PASS, `1044/1044`.
- Frontend tests: PASS, `707/707`.
- API health: healthy.
- Pages production atualizado.

## 3. Próximo lote recomendado

Lote B — Fail-Open + Órfãos + Licenças.

### B1 — `funcionarios.ts`

Severidade: média.
Ação: converter padrão fail-open para fail-closed.

Critério:
- zero `getEmpresaIdSafe` em caminhos operacionais de listagem;
- zero filtro condicional que permita listagem sem tenant;
- usar `getEmpresaId(c)` quando a rota exigir tenant.

Migration: não.
Deploy: API/worker.
Dry-run: não.

### B2 — `funcionarios-mutations.ts`

Severidade: média.
Ação: ajustar verificação de matrícula para escopo por empresa.

Critério:
- matrícula única por empresa;
- CPF permanece global, salvo decisão posterior;
- não alterar regra de CPF neste lote.

Migration: não.
Deploy: API/worker.
Dry-run: não.

### B3 — `simuladores-sessoes.ts`

Severidade: nenhuma.
Status: falso positivo confirmado.
Ação: não alterar.

### B4 — `licencas.ts`

Severidade: alta.
Ação: adicionar `empresa_id`, backfill e tenant gates em writes/dashboard.

Critério:
- migration `0393`;
- backfill determinístico;
- POST/PUT/DELETE filtrados por tenant;
- dashboard/agregações filtradas por tenant;
- testes cross-tenant.

Migration: sim.
Deploy: API/worker.
Dry-run: sim.

### B5 — Dados

Ação: executar queries read-only de resíduos.

Queries preparadas:

```sql
-- Resíduos empresa_id = 1
SELECT 'funcionarios' AS tabela, COUNT(*) AS total
FROM funcionarios
WHERE deleted_at IS NULL AND empresa_id = 1
UNION ALL
SELECT 'qualificacoes_historico', COUNT(*)
FROM qualificacoes_historico
WHERE deleted_at IS NULL AND empresa_id = 1
UNION ALL
SELECT 'frms_jornada', COUNT(*)
FROM frms_jornada
WHERE deleted_at IS NULL AND empresa_id = 1;

-- Resíduos empresa_id IS NULL
SELECT 'funcionarios' AS tabela, COUNT(*) AS total
FROM funcionarios
WHERE deleted_at IS NULL AND empresa_id IS NULL
UNION ALL
SELECT 'licencas', COUNT(*)
FROM licencas
WHERE deleted_at IS NULL;
```

## 4. Comando recomendado para próxima sessão

Sequência sugerida:

1. **B1+B2** (juntos, sem migration): patch simples em `funcionarios.ts` + `funcionarios-mutations.ts`
2. **B4** (separado, exige migration): migration `0393` + backfill + tenant gates em `licencas.ts`
3. **B5**: rodar queries de resíduo após B4 aplicado
4. **B3**: nenhuma ação necessária

Critério de aceite:
- [ ] `funcionarios.ts`: zero `getEmpresaIdSafe`, zero `(? IS NULL OR empresa_id = ?)`
- [ ] `funcionarios-mutations.ts`: checks de matrícula com `empresa_id = ?`
- [ ] `licencas.ts`: migration aplicada, backfill completo, writes + dashboard com tenant gates
- [ ] Worker tests: 100% pass
- [ ] Dry-run B4 em produção: zero funcionários cross-tenant afetados
