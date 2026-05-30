# FRMS C2 Technical Fix — Checkin Sync Effectiveness

**Arquivo alterado:** `worker-airtrust/src/lib/frms/fadiga-frms-sync.ts`
**Branch:** `fix/frms-c2-checkin-sync-effectiveness-sonnet`
**Data:** 2026-05-29

---

## 1. Problema corrigido

`sincronizarCheckinComFrms` atualizava `frms_fatorizacao_jornada.effectiveness_pct` usando **aritmética incremental direta**:

```ts
// CÓDIGO ANTIGO — BUG
effectivenessNova = effectivenessAnterior - fatorRepousoAnterior * 100 + fatorRepousoNovo * 100;
```

Essa fórmula substitui apenas o componente de repouso, ignorando completamente os componentes já implementados em `calcEffectiveness`: WOCL, circadian (fator básica), progressivo de período embarcado, e o delta calibrado de total_fatorizado.

---

## 2. Por que o hardcode de 60 minutos era bug

O código anterior continha (em versão anterior ao estado atual):

```ts
const wakeMinutes = startMinutes - 60; // HARDCODE
```

O padrão operacional definido em `frms_configuracao_limites` é `MINUTOS_ANTES_APRESENTACAO = 90` (migração 0267). Usar 60 minutos produzia uma hora de despertar 30 minutos mais tarde do que o modelo calibrado, inflando artificialmente o sono efetivo e subestimando a penalidade circadiana.

O estado encontrado nesta PR já usava `cfgSono.minutosAntesApresentacao` para o wake fallback, mas mantinha a fórmula incremental que descartava todos os outros componentes.

---

## 3. Por que `calcEffectiveness` é a solução correta

`calcEffectiveness` em `calculos.ts` implementa o modelo completo:

| Componente | Descrição |
|---|---|
| **Processo S** (repouso) | `calcularFatorRepouso(sonoEfetivoMin)` calibrado pelo sono informado |
| **Processo C** (circadiano) | `calcularFatorBasicaCircadiano(tAcordouMin)` — penalidade por hora de despertar |
| **WOCL** | `calcularPenalidadeWOCL(tAcordouMin)` — despertar entre 02:00–06:00 penaliza |
| **Progressivo** | Degradação ao longo do período embarcado (`dia_periodo_embarcado / total_dias_periodo`) |
| **Total calibrado** | Combina todos os deltas sobre `total_fatorizado_jornada` da fatorização original |

A fórmula incremental omitia todos estes componentes salvo o Processo S.

---

## 4. Por que `recalcularPipeline` completo não foi chamado

O pipeline completo (`recalcularPipelineCascataDesdeData`, `processarAlertas`, `despacharNotificacoes`) reconstrói a fatorização integral a partir de dados históricos de jornada e acúmulo rolling. Isso é correto para uma re-execução completa, mas:

- É caro (múltiplas queries de histórico)
- Pode alterar campos além do effectiveness (rolling, alertas)
- Não é necessário para o caso de uso do check-in: a **fatorização base já existe** (`frms_fatorizacao_jornada`) e o check-in fornece apenas o dado de sono real

A cirurgia correta é: usar os fatores já persistidos + sono informado → `calcEffectiveness` → update pontual dos campos de effectiveness e sono.

---

## 5. O que mudou

### `fadiga-frms-sync.ts`

- **Removido:** `effectivenessNova = effectivenessAnterior - fatorRepousoAnterior * 100 + fatorRepousoNovo * 100`
- **Adicionado:** import de `calcEffectiveness`, `hhmmToMinutes`, `minutesToHhmm` de `calculos.ts`
- **SELECT expandido** de `frms_fatorizacao_jornada`: agora carrega todos os `fator_*` necessários para montar `FatorizacaoResult` para `calcEffectiveness`
- **SELECT expandido** de `frms_jornada`: inclui `hora_primeira_decolagem`, `hora_ultimo_pouso`, `hora_corte_motor`, `hora_termino`
- **Nova lógica de `hora_dormiu`:** calculada como `standardWakeMin - duracaoSonoMin` para preservar exatamente o sono reportado como `sonoEfetivoMin` no modelo
- **UPDATE `frms_fatorizacao_jornada`** inclui agora: `fator_repouso_pct` calibrado, `effectiveness_componentes_json`, `processado_com_bug = 0`
- **UPDATE `frms_jornada`** persiste `hora_acordou`, `sono_efetivo_min`, `fonte_sono`, `acordou_na_wocl`
- **Novo caso:** quando `hora_apresentacao IS NULL` → evento `FRMS_RECALCULO_NECESSARIO`, sem update de effectiveness
- **Payload de `FRMS_SYNC`** inclui campos de auditoria: delta, hora_dormiu_calculado, hora_despertar_modelo, acordou_na_wocl, nivel, componentes

---

## 6. O que não mudou

| Módulo | Status |
|---|---|
| Score diário (KSS, qualidade do sono, medicação, álcool) | Inalterado — permanecem no checkin/score diário |
| `calculos.ts` | Não alterado |
| `fadiga-score.ts` | Não alterado |
| `db-service-jornadas.ts` | Não alterado |
| Thresholds (`EFFECTIV_VERDE_MIN`, etc.) | Não alterados |
| Fórmula científica (Borbély, ICAO Doc 9966) | Não alterada |
| C4 (controle operacional) | Não alterado |
| AUTH | Não alterado |
| EVD | Não alterado |
| SGSO | Não alterado |
| Simuladores | Não alterados |
| Migrations | Nenhuma criada |

---

## 7. Sem reprocessamento histórico

Esta PR não executa nenhum backfill. Registros históricos com effectiveness calculado pela fórmula incremental continuam inalterados até que um backfill autorizado seja executado separadamente.

O campo `processado_com_bug = 0` sinaliza apenas os registros processados pelo sync a partir desta correção.

---

## 8. Riscos residuais

1. **Registros históricos** com `processado_com_bug = 1` ainda têm effectiveness calculado pela fórmula incremental. O impacto clínico é baixo (o repouso era o único componente variável no sync), mas a divergência existe.

2. **Paridade parcial com pipeline completo:** o sync usa `total_fatorizado_jornada` da fatorização existente (não recalcula). Se a fatorização base estiver desatualizada (ex: jornada editada sem reprocessamento), o effectiveness do sync refletirá dados desatualizados.

3. **`wakeTimeReal` não entra no modelo circadiano:** se o tripulante acordou a uma hora diferente do padrão (`hora_apresentacao - minutosAntesApresentacao`), o modelo usa o padrão como âncora circadiana. O `wakeTimeReal` é armazenado em `frms_jornada.hora_acordou` como observação, mas não altera o anchor do modelo.

---

## 9. Plano futuro para backfill histórico

Se necessário, um backfill histórico deveria:

1. Criar migração numerada (≥ 0384) separada, com aprovação explícita
2. Identificar registros com `processado_com_bug = 1`
3. Para cada registro, carregar fatorização + jornada completa e chamar `recalcularPipeline` (não o sync de check-in)
4. Executar em ambiente de staging primeiro, com validação de amostra
5. Documentar em `docs/` como closure de backfill separado

---

## 10. Opus não usado

Este fix é uma correção técnica de implementação (substituição de fórmula incorreta por função pura existente). Não houve redesign científico do modelo de fadiga, criação de novos limiares, ou alteração da fórmula científica. Sonnet 4.6 é adequado para este escopo.
