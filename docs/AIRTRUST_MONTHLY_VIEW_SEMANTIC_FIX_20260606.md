# AirTrust — Monthly View Semantic Fix

**Data:** 2026-06-06

## Problema

Visão Mensal Integrada mostrava:
- 309 "Compromissos" (contava todos os eventos, incluindo alertas)
- 230 "Bloqueios" (qualificações vencidas empilhadas no dia 1 do mês)
- Calendário poluído com qualificações all-day em datas artificiais

## Causas

### 1. Clamp de data em qualificações vencidas
`loadQualificacaoEvents()` clampava qualificações com data anterior ao mês
para `month.startDate` (primeiro dia do mês), criando eventos all-day
artificiais com severidade BLOCKING.

### 2. Sumário com semântica errada
O `visualSummary` do frontend contava TODOS os eventos como "Compromissos",
incluindo alertas (qualificações, FRMS) e conflitos.

## Correções

### Fix 1: Data real sem clamp
```typescript
// Antes: clamp ternário
date: dataVencimento < month.startDate ? month.startDate : ...

// Depois: data real
date: dataVencimento,
```
Qualificações vencidas antes do mês usam sua data real, que está fora
do mês corrente → não aparecem no grid → calendário limpo.

### Fix 2: Sumário com buckets corretos
```typescript
// Compromissos = operationalAssignments + commitments
// Avisos       = alerts com WARNING (não BLOCKING)
// Conflitos    = conflicts (CONFLICT severity)
// Bloqueios    = alerts com BLOCKING ou blocksAllocation
```

## Nova Semântica

| Card | Contém |
|------|--------|
| Compromissos | Escala + Treinamentos + Simuladores (eventos operacionais) |
| Avisos | Qualificações vencendo, FRMS atenção, indisponibilidades |
| Conflitos | Sobreposições entre fontes diferentes |
| Bloqueios | Qualificações vencidas sem renovação, FRMS violação/crítico |

## Tratamento de Treinamentos

| Status | Comportamento |
|--------|--------------|
| PLANEJADO | Aparece no calendário, cor conforme padrão |
| CONFIRMADO | Aparece no calendário |
| EM ANDAMENTO | Aparece no calendário |
| CONCLUÍDO | Aparece em cinza (neste deploy: mantido, tratamento visual futuro) |
| CANCELADO | Excluído do calendário |

## Testes

6 novos testes adicionados (M11–M14 + 2 de integridade de data).
