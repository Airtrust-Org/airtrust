# AirTrust EVD — Soft-Conflict Regression Gate

## Regra de negócio

Na Escala Diária de Voo (EVD), divergências com a escala mensal **não bloqueiam** a designação de tripulantes:

| Condição | Tipo | Comportamento |
|---|---|---|
| Fora da quinzena operacional da escala mensal | `soft_conflict` | Selecionável com aviso `[!]` |
| Alocado em outra aeronave na escala mensal | `soft_conflict` | Selecionável com aviso `[!]` |
| Situação bloqueante em outra escala mensal | `soft_conflict` | Selecionável com aviso `[!]` |
| Sem alocação mensal na quinzena | `soft_conflict` | Selecionável com aviso `[!]` |
| Férias RH reais (sem vínculo com escala) | `hard_block` | **Não** selecionável |
| CMA vencido | `hard_block` | **Não** selecionável |
| Habilitação/modelo inválida | `hard_block` | **Não** selecionável |
| Tripulante inativo | `hard_block` | **Não** selecionável |
| Aeronave inativa | `hard_block` | **Não** selecionável |

### Propriedades do soft_conflict

- `pode_ser_alocado: true` — o tripulante aparece no grupo selecionável do dropdown
- `soft_conflict: true` — indica que há um aviso, mas não impede a seleção
- `conflict_code: 'OUT_OF_QUINZENA'` — código específico para fora da quinzena
- `conflict_reason` — motivo legível para o operador

### Propriedades do hard_block

- `pode_ser_alocado: false` — o tripulante **não** aparece no grupo selecionável
- `soft_conflict: false` ou ausente
- `motivo_bloqueio` — motivo do bloqueio real

## Gate de regressão

Script: `scripts/test-evd-soft-conflict-regression.sh`

Verifica no código-fonte:
1. `OUT_OF_QUINZENA` está sempre associado a `pode_ser_alocado: true` e `soft_conflict: true`
2. O endpoint POST (`escalas-evd.ts`) trata conflitos de escala como soft_conflict
3. Férias RH reais continuam sendo hard block (com `escala_alocacao_id IS NULL`)
4. O frontend (`EvdPage.tsx`) filtra por `pode_ser_alocado` e renderiza soft_conflict no grupo selecionável
5. O script de diagnóstico (`diagnose-evd-availability-frms.sh`) rastreia `soft_conflict_quinzena`

### Uso

```bash
# Modo interativo (mostra cada check)
bash scripts/test-evd-soft-conflict-regression.sh

# Modo CI (silencioso em sucesso, falha com detalhes)
bash scripts/test-evd-soft-conflict-regression.sh --ci
```

## Histórico

- **G13** (`47707aa`): Correção inicial do bloqueio indevido no save EVD
- **G15** (`13dc4f2`): Escala mensal divergente vira soft_conflict; frontend adaptado
- **G16** (`08d3b67`): Regressão — filtro de quinzena reintroduziu hard block como `OUT_OF_QUINZENA`
- **Correção atual**: Restaura soft_conflict para `OUT_OF_QUINZENA` e adiciona gate permanente
