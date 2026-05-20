# BUGFIX — FRMS Cards vs Heatmap Inconsistência

**Data**: 10/03/2026  
**Commit**: `dc58166e`  
**Worker**: `5efcfc7c-8f64-4c15-9d76-220527b9e58d`

## Sintoma

- Header: "Março de 2026 · **1** tripulante"
- Cards: NORMAL=1, ATENÇÃO=0, CRÍTICO=0, VIOLAÇÃO=0
- Heatmap: **17** tripulantes visíveis

## Causa Raiz Identificada: **CAUSA B** — Query usa tabela errada

O endpoint `GET /api/frms/acumulo-frota?mes=2026-03` (path com mês) usava `FROM frms_jornada j` como tabela base. Isso faz com que **apenas tripulantes com jornadas registradas no mês selecionado** apareçam.

Como só 1 tripulante tinha jornada em Março/2026, o resultado era 1.

O heatmap (`GET /api/frms/heatmap?periodo=30`) usa `FROM frms_acumulo_rolling ar JOIN funcionarios f`, que retorna **todos os 17 tripulantes monitorados**.

## Evidência (antes da correção)

```
acumulo-frota?mes=2026-03  → Total: 1
acumulo-frota (sem mes)    → Total: 17
heatmap?periodo=30         → Total: 17
```

## Correção

**Arquivo**: `worker-airtrust/src/lib/frms/db-service.ts` → `buscarAcumuloFrota()`

### Antes (query do path `mes`)

```sql
FROM frms_jornada j
LEFT JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER)
WHERE j.deleted_at IS NULL
  AND j.data >= mesInicio AND j.data <= mesFim
GROUP BY j.tripulante_id
```

**Problema**: Apenas tripulantes COM jornadas no mês aparecem.

### Depois

```sql
FROM (
  SELECT DISTINCT tripulante_id
  FROM frms_acumulo_rolling
  WHERE deleted_at IS NULL
) t
LEFT JOIN funcionarios p ON p.id = CAST(t.tripulante_id AS INTEGER)
LEFT JOIN frms_jornada j ON j.tripulante_id = t.tripulante_id
  AND j.deleted_at IS NULL
  AND j.data >= mesInicio AND j.data <= mesFim
WHERE p.deleted_at IS NULL
  AND (empresaId IS NULL OR p.empresa_id = empresaId)
GROUP BY t.tripulante_id
```

**Base**: `frms_acumulo_rolling` (mesma que o heatmap) — todos os tripulantes monitorados aparecem.  
**LEFT JOIN**: Jornadas do mês — quem não voou recebe 0 horas e status OK.

## Output Após Correção

```
acumulo-frota?mes=2026-03  → Total: 17
  OK=17, ATENCAO=0, CRITICO=0, VIOLACAO=0 → sum=17
heatmap?periodo=30         → Total: 17
```

✅ Header mostrará: "Março de 2026 · **17** tripulantes"  
✅ Cards: NORMAL=17 (consistente com heatmap)

## Testes

- 293 tests passing (5 FrmsMetricCards, incluindo novo teste de consistência)
- Build: 9.25s, zero errors
