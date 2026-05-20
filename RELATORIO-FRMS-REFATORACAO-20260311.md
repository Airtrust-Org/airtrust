# Relatório de Refatoração FRMS — Dual-Panel (Painel A + Painel B)

**Data:** 11 de março de 2026  
**Commit base:** `7904f56a` (main — deploy 2026-03-10 22:03:31)  
**Autor:** Refatoração autônoma via GitHub Copilot

---

## 1. Objetivo

Separar o módulo FRMS em dois painéis independentes com semânticas diferentes:

| Painel | Nome                               | Escala                   | Fonte de dados                                    |
| ------ | ---------------------------------- | ------------------------ | ------------------------------------------------- |
| **A**  | Efetividade Cognitiva (SAFTE-FAST) | 0–100% (maior = melhor)  | `calcEffectiveness()` + colunas `effectiveness_*` |
| **B**  | Compliance Regulatório (ANAC/NBR)  | 0–101%+ (menor = melhor) | `calcFatorizacao()` existente                     |

---

## 2. Arquivos Modificados

### 2.1 Backend — `worker-airtrust/`

| Arquivo                                             | Tipo       | Mudanças                                                                                                                                                                                                               |
| --------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/frms/types.ts`                             | MODIFICADO | `ALERTA_VIOLACAO_PCT: 100 → 101`; novos campos `LimitesMap` + `LIMITES_DEFAULT` para `EFFECTIV_*`; tipos `EffectivenessNivel` + `EffectivenessResult`                                                                  |
| `src/lib/frms/calculos.ts`                          | MODIFICADO | Função `calcEffectiveness(fatorizacao, limites)` — fórmula `max(0, min(100, 100 + total_fatorizado * 100))` + classificação por thresholds                                                                             |
| `src/lib/frms/db-service.ts`                        | MODIFICADO | Pipeline: `calcEffectiveness()` após `calcFatorizacao()`, persist 3 novas colunas; `enrichWithEffectiveness()` helper; ambas as rotas de `buscarAcumuloFrota` + `buscarAcumuloTripulante` enriquecem com effectiveness |
| `migrations/0263_frms_effectiveness_thresholds.sql` | CRIADO     | `ALTER TABLE frms_fatorizacao_jornada ADD COLUMN effectiveness_pct REAL`; ADD `effectiveness_nivel TEXT`; ADD `effectiveness_componentes_json TEXT`; INSERT 4 limites `EFFECTIV_*` em `frms_configuracao_limites`      |
| `migrations/0264_fix_alerta_violacao_pct.sql`       | CRIADO     | `UPDATE frms_configuracao_limites SET valor_numerico = 101 WHERE nome = 'ALERTA_VIOLACAO_PCT'`                                                                                                                         |

### 2.2 Frontend — `src/react-app/pages/frms/`

| Arquivo                                 | Tipo       | Mudanças                                                                                                                                                                |
| --------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frmsUtils.ts`                          | REFATORADO | Novas funções config-driven: `getEffectivenessColor/Hex/Label(pct, config)` + `getComplianceColor/Hex/Label(pct, config)`; `FRMS_VISUAL_LIMITS` mantido como deprecated |
| `components/FrmsEffectivenessPanel.tsx` | CRIADO     | Painel A: círculo SVG com score, barra por componente (processo_s, processo_c, repouso, hv, duracao), modos `compact` e normal                                          |
| `components/FrmsTripulantesTable.tsx`   | MODIFICADO | Cabeçalho "Fadiga %" → "Compliance %"; coluna "Efetividade" adicionada; `config?` prop; `getComplianceColor()` no progress bar; CSV exporta ambas                       |
| `components/FrmsHeatmap.tsx`            | MODIFICADO | Removido `FRMS_VISUAL_LIMITS`; `getHeatmapColor/Border/Label` config-driven; legends dinâmicas; `config?: ConfigLimites` prop                                           |
| `components/FrmsTimelineChart.tsx`      | MODIFICADO | Removido `FRMS_VISUAL_LIMITS`; `getStatusColor(pct, config)` config-driven; `FrmsTimelineTooltip` aceita `config?`                                                      |
| `FrmsFichaTripulante.tsx`               | MODIFICADO | Layout 5-col grid: Painel A (col-span-1, condicional) + Painel B (col-span-4 ou 5); defaults corretos `85/95/101`; import `FrmsEffectivenessPanel`                      |
| `FrmsConfiguracoes.tsx`                 | MODIFICADO | Novo grupo "Thresholds de Efetividade (Painel A)" com 4 chaves `EFFECTIV_*`                                                                                             |
| `FrmsDashboard.tsx`                     | MODIFICADO | `useFrmsConfiguracoes()` → `frmsConfig`; passa `config={frmsConfig}` para `FrmsHeatmap` + `FrmsTripulantesTable`                                                        |
| `hooks/useFrms.ts`                      | MODIFICADO | `FrmsFrotaRow` + hook return: `effectiveness_pct?`, `effectiveness_nivel?`, `effectiveness_componentes?`                                                                |

---

## 3. Schema — Novas Colunas

```sql
-- frms_fatorizacao_jornada (migration 0263)
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN effectiveness_pct REAL;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN effectiveness_nivel TEXT;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN effectiveness_componentes_json TEXT;
```

---

## 4. Novos Limites Configuráveis

| Chave `frms_configuracao_limites` | Default | Significado                                      |
| --------------------------------- | ------- | ------------------------------------------------ |
| `EFFECTIV_VERDE_MIN`              | 90      | Efetividade ≥ 90% → VERDE (ALTA)                 |
| `EFFECTIV_AMARELO_MAX`            | 77      | Efetividade < 77% → AMARELO pior                 |
| `EFFECTIV_VERMELHO_MAX`           | 65      | Efetividade < 65% → VERMELHO (BAIXA)             |
| `EFFECTIV_PERIODO_PCT`            | 30      | Janela de período para média (reservado)         |
| `ALERTA_VIOLACAO_PCT`             | **101** | VIOLAÇÃO só acima de 100% (corrigido de 100→101) |

---

## 5. Correção de Bug: VIOLAÇÃO a 100%

**Sintoma:** Badge VIOLAÇÃO aparecia para tripulantes exatamente a 100% de compliance.

**Causa raiz:**

- `LIMITES_DEFAULT.ALERTA_VIOLACAO_PCT = 100` (incorreto)
- Seed `0213_frms_seed_limites.sql` inseriu `100.0` no banco
- `resolverNivel(100, limites, true)` → `100 >= 100` → `VIOLACAO` ✔

**Correção aplicada:**

1. `worker-airtrust/src/lib/frms/types.ts` linha 272: `100 → 101`
2. `migrations/0264_fix_alerta_violacao_pct.sql`: UPDATE no banco

**Resultado:** `resolverNivel(100, limites, true)` → `100 >= 101` → `false` → avalia próximo nível (`CRITICO` a 95%). VIOLAÇÃO agora só dispara acima de 101%.

---

## 6. Coluna "Efetividade" — Dados Ausentes (—)

A coluna "Efetividade" na `FrmsTripulantesTable` e na ficha do tripulante exibe `—` para jornadas já processadas antes da migration 0263.

**Motivo:** As colunas `effectiveness_pct`, `effectiveness_nivel`, `effectiveness_componentes_json` são `NULL` para registros anteriores à migration. Novas jornadas calculadas após aplicar a migration 0263 terão os valores preenchidos automaticamente.

**Para retroalimentar jornadas existentes**, executar após aplicar as migrations:

```
POST /api/frms/reprocessar
Authorization: Bearer <token com role admin>
```

---

## 7. Como Aplicar as Migrations

### Local (D1 dev):

```bash
cd worker-airtrust
npx wrangler d1 migrations apply airtrust-db --local
```

### Produção:

```bash
cd worker-airtrust
npx wrangler d1 migrations apply airtrust-db
```

Após aplicar, rodar reprocessamento se desejado preencher colunas `effectiveness_*` retroativamente.

---

## 8. Checklist de Verificação

- [x] `npx tsc --noEmit` — zero erros TypeScript
- [x] `npm run build` — zero erros Vite
- [x] `grep -rn "FRMS_VISUAL_LIMITS" src/react-app/pages/frms/` — apenas `frmsUtils.ts` (deprecated ok)
- [x] `grep -rn "pct >= 95\|pct >= 85\|pct >= 40" src/react-app/pages/frms/` — zero ocorrências
- [x] Build dist contém "Compliance %" e "Efetividade" — confirmado via grep no bundle
- [x] `ALERTA_VIOLACAO_PCT` = 101 em `LIMITES_DEFAULT` e migration 0264
- [x] JSX `FrmsFichaTripulante.tsx` — divs balanceadas (verificado manualmente)

---

## 9. Resumo das Migrations Criadas/Relevantes

| Migration                                | Descrição                                                     |
| ---------------------------------------- | ------------------------------------------------------------- |
| `0213_frms_seed_limites.sql`             | Seed original (ALERTA_VIOLACAO_PCT=100 — legado, já aplicado) |
| `0261_frms_performance_indexes.sql`      | Índices de performance                                        |
| `0263_frms_effectiveness_thresholds.sql` | **NOVA** — colunas effectiveness + 4 limites EFFECTIV\_\*     |
| `0264_fix_alerta_violacao_pct.sql`       | **NOVA** — corrige ALERTA_VIOLACAO_PCT de 100 para 101        |

---

## 10. Próximos Passos Sugeridos

1. Aplicar migrations 0263 + 0264 em produção via `wrangler d1 migrations apply`
2. Chamar `POST /api/frms/reprocessar` para popular `effectiveness_pct` retroativamente
3. Validar em produção: badge VIOLAÇÃO deve sumir para tripulantes a exatamente 100%
4. Validar em produção: coluna "Efetividade" deve aparecer com valores após reprocessamento
5. Calibrar thresholds `EFFECTIV_*` em `FrmsConfiguracoes` conforme baseline operacional
