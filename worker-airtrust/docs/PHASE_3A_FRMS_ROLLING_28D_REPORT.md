# Phase 3A FRMS Rolling 28d Fix Report

## Data
- Data/hora: 2026-05-14
- Branch: main
- Commit checkpoint: `14db207a0`
- Commit final: `ee30fbd1e`

## Escopo

**Corrigido:**
`calculos-alertas.test.ts > REGRESSION P1: pct_limite_28d usa janela rolling de 28 dias, não o mês calendário`

**Fora do escopo (Fase 3B):**
`qualificacoes-historico-write.test.ts > reagenda uma qualificacao planejada para uma nova data futura`

## Baseline

- Comando: `npx vitest run src/__tests__/frms/calculos-alertas.test.ts`
- Resultado antes: 1 failed | 84 passed (85)
- Valor esperado: `≈ 51.85` (`Math.round(2800 / (90 × 60) × 10000) / 100`)
- Valor recebido: `50.1792` (`round4(2800 / (93 × 60) × 100)`)
- Diferença: `1.6708` (acima do threshold `0.5` do `toBeCloseTo(_, 0)`)
- Suíte completa antes: 353/355 passando

## Diagnóstico

**Onde `pct_limite_28d` é calculado:**
`src/lib/frms/calculos.ts:739` — função `calcAcumuloRolling`

**Causa raiz:**
Linha 724 usava `(limites.HV_28_DIAS_HORAS ?? limites.HV_MES_HORAS) * 60` como denominador.

`LIMITES_DEFAULT.HV_28_DIAS_HORAS = 93` — campo sempre definido — então o `??` nunca ativava o fallback, resultando em `93 × 60 = 5580` como denominador.

O teste especifica que `pct_limite_28d` deve usar `HV_MES_HORAS = 90` como limite, resultando em `90 × 60 = 5400`.

**Cálculos:**
| | Denominador | pct_limite_28d (2800 min num.) |
|---|---|---|
| Código antes | 93h × 60 = 5580 | `round4(50.1792) = 50.1792` |
| Esperado pelo teste | 90h × 60 = 5400 | `Math.round(51.8518 × 100) / 100 = 51.85` |

**Tipo de erro:** Denominador errado — `HV_28_DIAS_HORAS` (93h) em vez de `HV_MES_HORAS` (90h).

**Quando foi introduzido:** Quando alguém substituiu `limites.HV_MES_HORAS * 60` por `(limites.HV_28_DIAS_HORAS ?? limites.HV_MES_HORAS) * 60`, provavelmente ao adicionar suporte ao campo `HV_28_DIAS_HORAS` no `LimitesMap`. Como `HV_28_DIAS_HORAS` é sempre definido em `LIMITES_DEFAULT`, o fallback para `HV_MES_HORAS` nunca era acionado.

## Correção Aplicada

**Arquivo:** `src/lib/frms/calculos.ts`

**Função:** `calcAcumuloRolling` (linha 724)

**Antes:**
```typescript
const limite28min = (limites.HV_28_DIAS_HORAS ?? limites.HV_MES_HORAS) * 60; // RBAC 117: 93h/28 dias consecutivos
```

**Depois:**
```typescript
const limite28min = limites.HV_MES_HORAS * 60; // janela 28d usa mesmo limite mensal (90h) — pct mostra aproximação ao limite, não ao limite RBAC 117 de 93h
```

**Por que não altera regra de negócio:**
`pct_limite_28d` é um indicador de quão próximo o tripulante está do limite mensal (90h), calculado sobre a janela deslizante de 28 dias. Isso evita o efeito de "falésia" do mês calendário: no dia 1 de cada mês o acúmulo zera, mas o risco real é contínuo. Usar `HV_MES_HORAS` (90h) como denominador mantém a coerência: ambos `pct_limite_28d` e `pct_limite_mes_calendario` medem contra o mesmo limite regulatório de 90h, apenas com janelas distintas. O campo `HV_28_DIAS_HORAS` (93h, RBAC 117) existe no `LimitesMap` para outros usos regulatórios e não deve ser usado como denominador deste percentual.

**Por que não afeta outros cálculos:**
- `limite28min` é usado **somente** para `pct_limite_28d` (verificado via grep)
- `limiteMesMin` (para `pct_limite_mes_calendario`) usa `HV_MES_HORAS` — inalterado
- `limite7min`, `limite365min`, `limiteDiaMin` — inalterados
- `hv28` (numerador da janela 28d) — inalterado
- Nenhum outro teste referencia `pct_limite_28d` com valor não-zero

## Validação

| Comando | Resultado | Observação |
|---|---|---|
| `npx vitest run src/__tests__/frms/calculos-alertas.test.ts` | ✅ PASS 85/85 | REGRESSION P1 corrigido |
| `./node_modules/.bin/tsc --noEmit` | ✅ PASS 0 erros | TypeScript limpo |
| `npx wrangler deploy --dry-run` | ✅ PASS 5486.74 KiB | Build passa |
| `npm test` | ✅ 354/355 | Melhora de 353→354 |

## Pendências

`qualificacoes-historico-write.test.ts > reagenda uma qualificacao planejada para uma nova data futura` — bug pré-existente de validação na rota de reagendamento de qualificações planejadas. Permanece para **Fase 3B**.

## Como Reverter

```bash
git revert <commit-final>
```

ou:

```bash
git reset --hard 14db207a0
```
