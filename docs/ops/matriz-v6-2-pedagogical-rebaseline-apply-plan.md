# Matriz V6.2 — Plano de Apply Re-baseline (Correções Pedagógicas)

> **Status**: Pacote reconstruído. Aguardando autorização.
> **SHA**: `66af1f6cc814406b4b45b810b2220d141371f759`
> **Data**: 2026-07-05

---

## Motivo do NO-GO anterior

O apply foi bloqueado porque:
- O backup pré-apply ficou obsoleto (produção já havia evoluído para estado intermediário)
- O rollback usava filtro incorreto em `modelos_sessao_manobras` (referenciava `empresa_id` em tabela sem essa coluna)
- O pacote antigo não considerava o estado real da produção

## Diagnóstico do re-baseline (2026-07-05T19:24Z)

| Métrica | Valor |
|---|---|
| Modelos ativos empresa 6 | 60 (56 não-TEST) |
| Modelos target V6.2 | 51 |
| Modelos legados a desativar | 5 (SK76 03-format, 0 fichas) |
| Técnicas atuais | 1234 |
| Técnicas target | 918 |
| IFR cycles | `IFR-noturno-offshore` (incorreto) |
| OPS-NOT-X1 | Ausente |
| A139-AUT-03 | Ausente |
| INV-ETH-01 | Ausente |

## Delta

Ver `artifacts/apply-plans/matriz-v6-2-pedagogical-rebaseline-apply-20260705T192435Z-66af1f6c/CURRENT_VS_TARGET_DELTA.md`

## Novo backup

`artifacts/db-backups/matriz-v6-2-pedagogical-rebaseline-20260705T192435Z-66af1f6c/`
- 7 tabelas, checksums OK
- 224 fichas_sessao, 4706 fichas_sessao_manobras, 108 agendamentos

## Novo pacote de apply

`artifacts/apply-plans/matriz-v6-2-pedagogical-rebaseline-apply-20260705T192435Z-66af1f6c/`
- SQL delta: 3349 linhas, zero DELETE
- Inclui desativação de 5 modelos legados
- Rollback corrigido com filtro JOIN seguro

## Tabelas permitidas
`modelos_sessao`, `modelos_sessao_manobras`, `manobras`

## Tabelas proibidas
`fichas_sessao`, `fichas_sessao_manobras`, `simulador_agendamentos`, `fichas_manobras_historico`

## Rollback corrigido

```sql
UPDATE modelos_sessao_manobras
SET deleted_at = datetime('now')
WHERE modelo_id IN (
  SELECT id FROM modelos_sessao WHERE empresa_id = 6
);
```

## Autorização necessária

`AUTORIZO APPLY PRODUÇÃO MATRIZ V6.2 PEDAGÓGICA NO SHA 66af1f6cc814406b4b45b810b2220d141371f759`

## GO/NO-GO

| Condição | Estado |
|---|---|
| Backup íntegro | ✅ |
| SQL revisado | ✅ |
| Rollback corrigido | ✅ |
| Validações locais | ✅ 37/37 testes, lint OK, tsc OK |
| Autorização owner | ⬜ **AGUARDANDO** |
