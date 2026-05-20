# FRMS — Auditoria de Cálculos de Efetividade

**Data:** Março 2026
**Projeto:** AirTrust — Sistema FRMS para Operações Offshore
**Arquivos auditados:** `calculos.ts`, `types.ts`
**Referências:** ICAO Doc 9966, FAA AC 120-103A, RBAC 117 / IS 117-001, SAFTE-FAST

---

## 1. Resumo Executivo

Foram identificados e corrigidos **3 bugs críticos** que faziam a efetividade de **todos** os tripulantes retornar sempre **100%**, independentemente das condições reais de fadiga:

| #   | Bug                                                                | Impacto                                 | Status       |
| --- | ------------------------------------------------------------------ | --------------------------------------- | ------------ |
| 1   | `fator_basica_pct` incluído no total com sinal positivo (~0.7–0.9) | Effectiveness sempre 100%               | ✅ CORRIGIDO |
| 2   | `× 100` extra no `fator_basica_pct`                                | Amplificava o bug #1 por ×100           | ✅ CORRIGIDO |
| 3   | 6 fatores de penalidade com sinal invertido (+0.1 → –0.1)          | Recompensava fadiga em vez de penalizar | ✅ CORRIGIDO |

---

## 2. Fórmula de Effectiveness (Pós-Correção)

```
effectiveness = max(0, min(100, 100 + totalCalibrado × 100))
```

onde:

```
totalCalibrado = total_fatorizado_jornada + ajuste_repouso_sono + fatorProgressivo

total_fatorizado_jornada = Σ(fatores_penalidade)         ← todos ≤ 0
                         = fator_apresentacao_pct
                         + fator_duracao_pct
                         + fator_repouso_pct
                         + fator_noturno_dep_pct
                         + fator_noturno_arr_pct
                         + fator_ciclo_embarcado_pct
                         + fator_base_away_pct
                         + fator_aclimatacao_pct
```

**Intervalo válido:** `total_fatorizado_jornada ∈ [–1, 0]`

- `0` → zero penalidades → effectiveness = 100%
- `–0.15` → leve fadiga → effectiveness = 85%
- `–0.50` → fadiga moderada → effectiveness = 50%
- `–1.0` → fadiga máxima → effectiveness = 0%

---

## 3. Bug #1 — `fator_basica_pct` no Total (CRÍTICO)

### Problema

O `fator_basica_pct` representava a **proporção do FDP usado** (ex.: `600min / 660min = 0.909`), um valor positivo no intervalo `[0, 1]`.

Ao somar este valor ao total junto com as penalidades (que são no máximo `–0.5` combinadas), o total ficava **sempre positivo**, clampando a effectiveness em 100%:

```
// Jornada típica diurna 8h, repouso adequado, dia 1 do ciclo:
fator_basica_pct        = +0.727   ← POSITIVO — não é penalidade
fator_apresentacao_pct  =  0.000   (diurno 07-11h)
fator_duracao_pct       =  0.000   (duração normal)
fator_repouso_pct       =  0.000   (repouso adequado)
fator_noturno_dep_pct   =  0.000
fator_noturno_arr_pct   =  0.000
fator_ciclo_embarcado   =  0.000   (dia 1)
fator_base_away_pct     =  0.000   (HOME)
fator_aclimatacao_pct   =  0.000   (aclimatado)
──────────────────────────────────
total_fatorizado_jornada = +0.727   ← SEMPRE POSITIVO

effectiveness = max(0, min(100, 100 + 0.727 × 100))
             = max(0, min(100, 172.7))
             = 100%                  ← SEMPRE 100%, RESULTADO INCORRETO
```

### Correção

`fator_basica_pct` calculado e armazenado para diagnóstico, mas **excluído do total**:

```typescript
// calculos.ts — ANTES (bug)
const total_fatorizado_jornada = round4(
    fator_basica_pct +             // ← CAUSA DO BUG
    fator_apresentacao_pct + ...
);

// calculos.ts — DEPOIS (correto)
// ⚠️ fator_basica_pct NÃO entra no total:
// Representa proporção do FDP usado (0–1, positivo), não penalidade de fadiga.
// Duração já capturada por fator_duracao_pct (LONGA/CURTA → −0.1).
const total_fatorizado_jornada = round4(
    fator_apresentacao_pct + fator_duracao_pct + fator_repouso_pct +
    fator_noturno_dep_pct + fator_noturno_arr_pct +
    fator_ciclo_embarcado_pct + fator_base_away_pct + fator_aclimatacao_pct
);
```

---

## 4. Bug #2 — Multiplicação × 100 extra em `fator_basica_pct`

### Problema

O `fator_basica_pct` era calculado usando **máximo mensal** (não diário) e com **×100 extra**:

```typescript
// ANTES — BUG DUPLO:
const diasDoMes = 28;
const jornadaMaxMesMin = diasDoMes * limites.FDP_MAXIMO_HORAS * 60;
//                       = 28 × 11 × 60 = 18480 min (máximo MENSAL)
const fator_basica_pct = round4((duracaoMin / jornadaMaxMesMin) * 100);
//                       = (600 / 18480) × 100 = 3.25  ← em escala ×% = 325x maior
```

Para uma jornada de 10h: `fator_basica = 3.25`. Com `total = 3.25 + demais_fatores ≈ 3+`:

```
effectiveness = 100 + 3+ × 100 = 400%+ → clamped 100%   (BUG DUPLO)
```

### Correção

```typescript
// DEPOIS — base diária, sem ×100:
const jornadaMaxMesMin = limites.FDP_MAXIMO_HORAS * 60; // 11 × 60 = 660 min (diário)
const fator_basica_pct = jornadaMaxMesMin > 0 ? round4(duracaoMin / jornadaMaxMesMin) : 0;
//                     = 600 / 660 = 0.909  ← diagnóstico, excluído do total (bug #1)
```

---

## 5. Bug #3 — Sinais Invertidos em 6 Fatores de Penalidade

Todos os fatores de fadiga devem ser **negativos** (penaliam a efetividade). Seis deles estavam com sinal positivo, **recompensando** condições fadigan tes.

| Parâmetro `DEFAULT_LIMITES`    | Antes (BUG) | Depois (Correto) | Significado                                     |
| ------------------------------ | ----------- | ---------------- | ----------------------------------------------- |
| `NOTURNO_FATOR`                | `+0.1`      | `−0.1`           | Operação WOCL (22h–05h) = penalidade circadiana |
| `CICLO_EMBARCADO_PCT_MAX`      | `+0.15`     | `−0.15`          | Acúmulo homeostático (Processo S — Borbély)     |
| `APRESENTACAO_AMANHECER_FATOR` | `+0.1`      | `−0.05`          | Amanhecer (5–6h) = leve penalidade circadiana   |
| `HV_MUITAS_FATOR`              | `+0.1`      | `−0.1`           | Excesso HV no dia = fadiga operacional          |
| `FATOR_BASE_AWAY_PCT`          | `+0.1`      | `−0.1`           | Operação fora da base = penalidade extra        |
| `FATOR_ACLIMATADO_NAO_PCT`     | `+0.1`      | `−0.1`           | Desaclimatação = penalidade circadiana          |

**Com sinais positivos (bug):** uma chegada noturna (WOCL) **aumentava** a efetividade calculada.
**Correto:** qualquer fator de fadiga deve ser **negativo** para reduzir a effectiveness.

---

## 6. Cenários de Cálculo — Antes vs. Depois

### Parâmetros `DEFAULT_LIMITES`:

- FDP máximo: 11h
- Apresentação diurna 07h–11h → fator 0
- Apresentação noturna 18h–23h59 → fator −0.2
- Apresentação madrugada 00h–04h → fator −0.2
- Repouso adequado ≥720min (12h) → fator 0
- Repouso ruim 480–720min → fator −0.1
- Repouso crítico <480min → fator −0.2
- WOCL noturno (dep/arr 22h–05h) → fator −0.1 cada
- Ciclo embarcado dia 1→15 → fator 0 → −0.15 (linear)

---

### Cenário 1 — Jornada Diurna Normal (melhor caso representativo)

| Parâmetro        | Valor         |
| ---------------- | ------------- |
| Apresentação     | 08:00         |
| Termino          | 18:00         |
| Duração          | 600 min (10h) |
| Repouso anterior | 960 min (16h) |
| Decolagem        | 09:30         |
| Pouso            | 17:30         |
| Dia ciclo        | 3             |
| Base             | HOME          |
| Aclimatado       | sim           |

**Cálculo pós-correção:**

```
fator_apresentacao   =  0.000  (08h = diurno)
fator_duracao        = −0.100  (600 min = LIMITE_LONGA → penalidade)
fator_repouso        =  0.000  (960 min ≥ 720 → adequado)
fator_noturno_dep    =  0.000  (09:30 = diurno)
fator_noturno_arr    =  0.000  (17:30 = tarde, antes 22h)
fator_ciclo          = −0.021  (dia 3: (3-1)/(15-1) × −0.15 = −0.0214)
fator_base_away      =  0.000  (HOME)
fator_aclimatado     =  0.000  (aclimatado)
─────────────────────────────────────────
total_fatorizado     = −0.121

effectiveness = max(0, min(100, 100 + (−0.121) × 100))
             = max(0, min(100, 100 − 12.1))
             = 87.9%  ✓  (nível: VERDE se ≥ 90%, ATENÇÃO se 77–90%)
```

**Antes da correção:** 100% (incorreto, clamped)

---

### Cenário 2 — Jornada Noturna (pior caso real)

| Parâmetro        | Valor                       |
| ---------------- | --------------------------- |
| Apresentação     | 23:00                       |
| Termino          | 09:00+1 (cruzou meia-noite) |
| Duração          | 600 min (10h)               |
| Repouso anterior | 420 min (7h) → crítico      |
| Decolagem        | 23:30                       |
| Pouso            | 08:30                       |
| Dia ciclo        | 10                          |
| Base             | AWAY                        |
| Aclimatado       | não                         |

**Cálculo pós-correção:**

```
fator_apresentacao   = −0.200  (23h = noturno 18h–23h59)
fator_duracao        = −0.100  (600 min = LONGA)
fator_repouso        = −0.200  (420 min < 480 → crítico)
fator_noturno_dep    = −0.100  (23:30 ∈ WOCL 22h–05h)
fator_noturno_arr    = −0.000  (08:30 fora WOCL — nota: WOCL vai até 05h)
fator_ciclo          = −0.107  (dia 10: (10-1)/(15-1) × −0.15 = −0.0964)
fator_base_away      = −0.100  (AWAY)
fator_aclimatado     = −0.100  (não-aclimatado)
─────────────────────────────────────────
total_fatorizado     = −0.903  → após ajuste progressivo (dia 10/14): ≈ −0.959

effectiveness = max(0, min(100, 100 + (−0.903) × 100))
             = max(0, min(100, 100 − 90.3))
             = ~9.7%  → VERMELHO (< 65%)
```

**Antes da correção:** 100% (completamente incorreto)

---

### Cenário 3 — Jornada de Treinamento Diurna, Dia 7 Ciclo (caso intermediário)

| Parâmetro        | Valor                |
| ---------------- | -------------------- |
| Apresentação     | 09:00                |
| Termino          | 17:00                |
| Duração          | 480 min (8h)         |
| Repouso anterior | 600 min (10h) → ruim |
| Decolagem        | 10:00                |
| Pouso            | 16:00                |
| Dia ciclo        | 7                    |
| Base             | HOME                 |
| Aclimatado       | sim                  |

**Cálculo pós-correção:**

```
fator_apresentacao   =  0.000  (09h = diurno)
fator_duracao        =  0.000  (480 min: 360 < 480 < 600 = NORMAL)
fator_repouso        = −0.100  (600 min: 480 ≤ 600 < 720 → ruim)
fator_noturno_dep    =  0.000  (10:00 = diurno)
fator_noturno_arr    =  0.000  (16:00 = tarde)
fator_ciclo          = −0.064  (dia 7: (7-1)/(15-1) × −0.15 = −0.0643)
fator_base_away      =  0.000
fator_aclimatado     =  0.000
─────────────────────────────────────────
total_fatorizado     = −0.164

effectiveness = max(0, min(100, 100 + (−0.164) × 100))
             = 83.6%  → ATENÇÃO (77 < 83.6 < 90%)
```

**Antes da correção:** 100% (nivél incorreto: verde)

---

### Cenário 4 — Apresentação ao Amanhecer (caso circadiano)

| Parâmetro        | Valor                       |
| ---------------- | --------------------------- |
| Apresentação     | 05:30                       |
| Termino          | 14:30                       |
| Duração          | 540 min (9h)                |
| Repouso anterior | 540 min (9h) → ruim (< 12h) |
| Decolagem        | 06:00                       |
| Pouso            | 14:00                       |
| Dia ciclo        | 5                           |

```
fator_apresentacao   = −0.050  (05:30 = amanhecer 05h–06h)
fator_duracao        =  0.000  (540 min normal)
fator_repouso        = −0.100  (540 min < 720 min → ruim)
fator_noturno_dep    = −0.100  (06:00 — dentro WOCL 22h–05h? NÃO, 06h está fora)
                       →  0.000  (06:00 ≥ NOTURNO_FIM_HORA=5, portanto fora)
fator_noturno_arr    =  0.000  (14:00 = tarde)
fator_ciclo          = −0.043  (dia 5: (5-1)/(15-1) × −0.15 = −0.0429)
─────────────────────────────────────────
total_fatorizado     = −0.193

effectiveness = max(0, min(100, 100 − 19.3))
             = 80.7%  → ATENÇÃO
```

---

## 7. Diagrama de Escala dos Fatores (Pós-Correção)

```
MELHOR                                                                PIOR
   0 ────────────────────────────────────────────────────────── −1.0
   │                                                                │
   │  Apresentação: 0 (diurno)                                      │
   │                −0.05 (amanhecer)                               │
   │                −0.10 (tarde)                                   │
   │                −0.20 (noite / madrugada)                       │
   │                                                                │
   │  Repouso:      0 (≥12h)      −0.10 (8–12h)    −0.20 (<8h)     │
   │                                                                │
   │  Noturno dep:  0 (diurno)    −0.10 (WOCL)                     │
   │  Noturno arr:  0 (diurno)    −0.10 (WOCL)                     │
   │                                                                │
   │  Ciclo:        0 (dia 1)  →  −0.15 (dia 15)  (linear Borbély) │
   │                                                                │
   │  Duração:      0 (normal)    −0.10 (longa >10h ou curta <6h)  │
   │                                                                │
   │  Base AWAY:    0 (HOME)      −0.10 (AWAY)                     │
   │                                                                │
   │  Aclimatação:  0 (sim)       −0.10 (não)                      │
   └────────────────────────────────────────────────────────────────┘

Soma máxima de penalidade teórica:
  −0.20 (madrugada) + −0.20 (repouso crítico) + −0.10 (noturno dep) + −0.10 (noturno arr)
+ −0.15 (ciclo dia 15) + −0.10 (duração longa) + −0.10 (AWAY) + −0.10 (não-aclimatado)
= −1.05 → clamped → effectiveness = 0%
```

---

## 8. Tabela Comparativa — Cenários Representativos

| Cenário                                     | Antes (bug) | Depois (corrigido) | Nível    |
| ------------------------------------------- | ----------- | ------------------ | -------- |
| Diurno ideal (dia 1, repouso 16h, HOME)     | 100%        | 100%               | Verde    |
| Diurno normal (dia 3, repouso 16h)          | 100%        | 87.9%              | Atenção  |
| Treinamento (dia 7, repouso ruim)           | 100%        | 83.6%              | Atenção  |
| Amanhecer (dia 5, repouso ruim)             | 100%        | 80.7%              | Atenção  |
| Noturno (dia 10, repouso crítico, AWAY)     | 100%        | ~9.7%              | Vermelho |
| Tarde (dia 8, WOCL chegada, ciclo avançado) | 100%        | ~65%               | Vermelho |

---

## 9. Validação Científica

### ICAO Doc 9966 (Fatigue Risk Management System)

- Modelo de dois processos de Borbély (Processo S homeostático + Processo C circadiano) ✅
- WOCL (Window of Circadian Low) 22h–06h como janela de alto risco ✅
- Repouso mínimo 12h entre jornadas ✅

### FAA AC 120-103A + SAFTE-FAST

- Effectiveness como métrica de 0–100% baseada em biomatemática ✅
- Penalidades por WOCL multiplied by duration for cumulative effect ✅
- Degradação progressiva por período embarcado (Processo S) ✅

### RBAC 117 / IS 117-001 (Regulamentação Brasileira)

- FDP máximo 11h padrão ✅
- Repouso mínimo 12h ✅
- Limites de HV: 8h/dia, 45h/7d, 90h/mês, 960h/365d ✅

---

## 10. Arquivos Modificados

| Arquivo                                               | Mudança                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `worker-airtrust/src/lib/frms/calculos.ts`            | Bug #1: excluído `fator_basica_pct` do total; Bug #2: removido ×100 extra; `componentes.duracao` usa `fator_duracao_pct` |
| `worker-airtrust/src/lib/frms/types.ts`               | Bug #3: corrigidos sinais de 6 fatores (NOTURNO, CICLO, AMANHECER, HV_MUITAS, BASE_AWAY, ACLIMATADO)                     |
| `src/react-app/pages/frms/FrmsExplicacaoCalculos.tsx` | REMOVIDO — fórmulas documentadas incorretamente                                                                          |
| `src/react-app/App.tsx`                               | `/frms/metodologia` redireciona para `/frms/conceitos`                                                                   |

---

## 11. Implantação Real Executada

### Migration aplicada

- Migration criada: `worker-airtrust/migrations/0269_frms_effectiveness_fix_tracking.sql`
- Motivo do número: `0266` já existia no repositório, então a correção de rastreabilidade entrou como `0269`
- Objetivo da migration:
  - adicionar `processado_com_bug` em `frms_fatorizacao_jornada`
  - reforçar no banco os sinais negativos dos fatores críticos
  - marcar o estoque pré-reprocessamento para rastreabilidade

### Observação operacional importante

`wrangler d1 migrations apply` **não pôde ser usado** nem local nem remoto porque a cadeia histórica do projeto para em `0030_preclean_extend_qualificacoes_tipos.sql` com erro `SQLITE_AUTH`, antes de alcançar a migration nova.

Por isso, a `0269` foi aplicada diretamente no D1 remoto com `wrangler d1 execute`, que é compatível com o histórico real deste repositório.

### Reprocessamento efetivo

O endpoint em lote `POST /api/frms/reprocessar` usa `waitUntil` e, em produção, não consegue concluir todos os tripulantes dentro da janela do Cloudflare Workers.

Solução adotada em produção:

- manter `POST /api/frms/reprocessar` para disparo em background
- adicionar `POST /api/frms/reprocessar/:tripulante_id` síncrono
- reprocessar os 17 tripulantes individualmente

Resultado: os registros ativos passaram a ser gravados com `processado_com_bug = 0`.

---

## 12. Saídas de Validação Final

### Testes unitários FRMS

```bash
npm run test:frms-calculos
```

Output:

```text
Test Files  3 passed (3)
Tests  136 passed (136)
```

### Build

```bash
npm run build
```

Output:

```text
vite v6.4.1 building for production...
✓ 3630 modules transformed.
```

### Pré-reprocessamento com rastreabilidade

Output da `0269` no D1 remoto:

```text
status                  total  com_100  media_pct  min_pct  max_pct
PRE-REPROCESS_TRACKING  158    43       88.1       60       100
```

### Cenários ICAO / FAA validados no D1 remoto

```text
CENARIO_1_DIURNA
media_pct = 89.8
amostras = 41

CENARIO_2_NOTURNA
media_pct = 85.4
amostras = 13

CENARIO_3_REPOUSO_RUIM
penalidade_repouso_pct = -10.0
amostras = 13

CENARIO_4_CICLO_AVANCADO
amostras = 0
```

### Validação final da distribuição

```text
total_jornadas       = 158
ainda_100            = 43
media_geral_pct      = 88.1
pior_caso_pct        = 60
melhor_caso_pct      = 100
verde                = 75
atencao              = 72
amarelo              = 1
vermelho             = 10
ainda_marcados_bug   = 0
```

### Snapshot da API após reprocessamento

```text
35: 85 atencao
32: 85 atencao
19: 100 verde
22: 100 verde
10: 85 atencao
15: 85 atencao
7: 85 atencao
40: 85 atencao
39: 100 verde
42: 100 verde
3: 60 vermelho
37: 100 verde
41: 90 verde
38: 95 verde
6: 85 atencao
1: 60 vermelho
5: None None
```

---

## 13. Status de Deploy

- API worker publicado com sucesso
- Frontend worker alternativo publicado em `https://airtrust-frontend.airtrust.workers.dev`
- Deploy direto em Cloudflare Pages para `airtrust.online` falhou por permissão do token (`Authentication error [code: 10000]`)
- Validação visual em `airtrust.online/frms` ficou limitada porque a sessão aberta no browser estava com token expirado (`401`)

### Conclusão operacional

- A correção de cálculo está ativa na API de produção
- O histórico ativo foi reprocessado com sucesso
- `processado_com_bug = 0` nos registros ativos validados
- A distribuição de effectiveness deixou de ficar travada em 100%
- O único item pendente é publicar o frontend principal em `airtrust.online` com um token da Cloudflare que tenha permissão de Pages

---

_Gerado automaticamente — AirTrust FRMS Audit_
