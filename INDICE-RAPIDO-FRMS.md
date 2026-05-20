# ÍNDICE RÁPIDO — Cálculos FRMS

## 🗂️ ARQUIVO × FUNÇÃO × LINHAS (Quick Reference)

### Backend: Cálculos Puros

**Arquivo:** `worker-airtrust/src/lib/frms/calculos.ts`

| Função                      | Linhas  | Tipo              | Entrada                         | Saída                         |
| --------------------------- | ------- | ----------------- | ------------------------------- | ----------------------------- |
| `calcDuracaoJornada()`      | 100–107 | Helper            | jornada                         | minutos                       |
| `calcFatorizacao()`         | 155–245 | **PRINCIPAL**     | jornada, repouso, limites, dias | 15 fatores (9 jornada + 4 HV) |
| `calcFatorApresentacao()`   | 248–265 | Sub-fator         | hora apresentação               | penalidade -0.2 to 0          |
| `calcFatorDuracao()`        | 268–272 | Sub-fator         | duração em min                  | penalidade -0.1 or 0          |
| `calcFatorRepouso()`        | 275–282 | Sub-fator         | repouso anterior                | penalidade -0.2 to 0          |
| `calcFatorHvQuantidade()`   | 285–289 | Sub-fator         | HV em min                       | penalidade -0.1 or 0          |
| `calcFatorCicloEmbarcado()` | 294–316 | **Borbély**       | dia ciclo, max, pcts            | interpolação linear           |
| `calcEffectiveness()`       | 388–540 | **EFFECTIVENESS** | fatorizacao, limites, jornada   | 0–100% + nivel + componentes  |
| `calcAcumuloRolling()`      | 553–619 | **ACÚMULO**       | tripulante, data, histórico     | 7d, 28d, 365d, mês, pcts      |
| `calcRepousoAnterior()`     | 622–660 | Helper            | data, jornadas                  | minutos                       |
| `calcAcumuloMensal()`       | 691–735 | **MENSAL**        | jornadas, fatorizacoes          | soma mensal, dias             |

---

### Backend: Tipos & Constants

**Arquivo:** `worker-airtrust/src/lib/frms/types.ts`

| Item              | Linhas  | Descrição                       | Valores-chave                                  |
| ----------------- | ------- | ------------------------------- | ---------------------------------------------- |
| `FrmsStatus`      | 6–23    | Status de jornada               | ES, TS, TV, EX, RE, SA, FE, FR, FS, AM, DM, OT |
| `FDP_STATUS`      | 26      | Jornadas com FDP                | ['ES', 'TS', 'TV', 'EX', 'RE', 'SA']           |
| `FOLGA_STATUS`    | 29      | Folgas (zeros)                  | ['FE', 'FR', 'FS', 'AM', 'DM', 'OT']           |
| `LimitesMap`      | 133–280 | **53 parâmetros configuráveis** | Todos vêm do banco                             |
| `LIMITES_DEFAULT` | —       | Fallback                        | Padrões se banco vazio                         |

**Limites Críticos:**

```
Compliance: ALERTA_AVISO_PCT=80%, ALERTA_ATENCAO_PCT=90%, ALERTA_CRITICO_PCT=95%, ALERTA_VIOLACAO_PCT=101%
Efetividade: EFFECTIV_VERDE_MIN=90%, EFFECTIV_AMARELO_MAX=77%, EFFECTIV_VERMELHO_MAX=65%
Duração: DURACAO_LONGA_MINUTOS=600, DURACAO_CURTA_MINUTOS=360
HV: HV_MUITAS_MINUTOS=300, HV_POUCAS_MINUTOS=120
Repouso: REPOUSO_ADEQUADO_MINUTOS=720, REPOUSO_RUIM_MINUTOS=480
Noturno: NOTURNO_INICIO_HORA=22, NOTURNO_FIM_HORA=5, NOTURNO_FATOR=-0.1
Ciclo: CICLO_EMBARCADO_DIA_MAX=15, CICLO_EMBARCADO_PCT_MAX=-0.15
Sono: REPOUSO_MIN_PRE_APRESENTACAO=90, REPOUSO_MIN_POS_LIBERACAO=60, REPOUSO_QUALIDADE_HOTEL=92
```

---

### Backend: Database Service

**Arquivo:** `worker-airtrust/src/lib/frms/db-service.ts`

| Função                               | Linhas | O que faz                                    |
| ------------------------------------ | ------ | -------------------------------------------- |
| `carregarLimites()`                  | 48–68  | **Carrega LimitesMap do banco**              |
| `buscarHistoricoJornadas()`          | 83–95  | Últimas N jornadas em janela                 |
| `calcularPeriodoEmbarcadoPorFaixa()` | 97–118 | Dia/total período embarque                   |
| `salvarJornada()`                    | 140+   | **Pipeline: fatorizar → acumular → alertar** |

---

### Frontend: Cores & Thresholds

**Arquivo:** `src/react-app/pages/frms/frmsUtils.ts`

| Função              | Range   | Verde | Amarelo | Laranja   | Vermelho |
| ------------------- | ------- | ----- | ------- | --------- | -------- |
| **Compliance()**    | 0–101%+ | <85%  | 85–89%  | 90–100%   | ≥101%    |
| **Effectiveness()** | 0–100%  | ≥90%  | 77–89%  | (atencao) | ≤65%     |

---

### Frontend: Componentes

**Pasta:** `src/react-app/pages/frms/`

| Componente     | Arquivo                    | Função Principal                         |
| -------------- | -------------------------- | ---------------------------------------- |
| Dashboard      | `FrmsDashboard.tsx`        | Orquestrador principal                   |
| Tabela         | `FrmsTripulantesTable.tsx` | Sort por compliance/effectiveness/status |
| Heatmap        | `FrmsHeatmap.tsx`          | Compliance ou effectiveness por dia      |
| Métrica Cards  | `FrmsMetricCards.tsx`      | Contagem tripulantes por nível           |
| Filtros        | `FrmsFilters.tsx`          | Sidebar período/modelo/status            |
| Filter Context | `FrmsFilterContext.tsx`    | State + sessionStorage                   |
| Conceitos      | `FrmsConceitos.tsx`        | Página educativa (mostrar fórmulas)      |

**Utilities:**

- `frmsUtils.ts` — Cores + labels (80+ linhas)
- `frmsFilterUtils.ts` — Filtros + resolução nível (custom hooks)

---

### Testes

**Arquivo:** `worker-airtrust/src/__tests__/frms/calculos-alertas.test.ts`

| Função               | # Testes | Cenários                                       |
| -------------------- | -------- | ---------------------------------------------- |
| `calcFatorizacao`    | 50+      | Apresentação, duração, repouso, noturno, ciclo |
| `calcEffectiveness`  | 10+      | Sono, progresso                                |
| `calcAcumuloRolling` | 30+      | 7d, 28d, 365d, mensal                          |
| `calcAcumuloMensal`  | 5+       | Soma, dias embarcado/folga                     |

---

### API Routes

**Arquivo:** `worker-airtrust/src/routes/frms.ts`

| Endpoint                                | Método | Cálculos                                  | Retorna                      |
| --------------------------------------- | ------ | ----------------------------------------- | ---------------------------- |
| `/api/frms/jornada`                     | POST   | calcFatorizacao, calcRolling, efectividad | effectiveness_pct, alertas   |
| `/api/frms/acumulo-frota`               | GET    | calcAcumuloRolling                        | pct_7d, pct_mes, pct_365d    |
| `/api/frms/acumulo-tripulante/:id`      | GET    | calcAcumuloRolling + calcAcumuloMensal    | detalhado                    |
| `/api/frms/heatmap`                     | GET    | efectividad por dia                       | matriz tripulante × data     |
| `/api/frms/configuracoes`               | GET    | carregarLimites                           | LimitesMap atual             |
| `/api/frms/configuracoes/limites/:nome` | PUT    | UPDATE DB                                 | success                      |
| `/api/frms/reprocessar`                 | POST   | Batch recalc                              | effectiveness para histórico |

---

## 🎯 ENCONTRAR CÁLCULO ESPECÍFICO

### "% Jornada Total"

- Backend: `calcAcumuloRolling()` linhas 553–619 → `hv_*_min / limite * 100` = `pct_limite_*`
- Frontend: `FrmsTripulantesTable.tsx` → coluna "Compliance %"
- Constantes: `HV_7_DIAS_HORAS`, `HV_MES_HORAS`, `HV_365_DIAS_HORAS`, `HV_DIARIA_HORAS`

### "% HV"

- Backend: `calcAcumuloRolling()` → `pct_limite_7d`, `pct_limite_28d`, `pct_limite_365d`, `pct_limite_dia`
- Schema: `frms_acumulo_rolling` tabela

### "% HV Diária"

- Backend: `calcAcumuloRolling()` linha 615 → `hvDia / limiteDiaMin * 100`
- Limite: `HV_DIARIA_HORAS` (default 8h)

### "Acúmulo Fadiga"

- Backend: `calcFatorizacao()` linha 245 → `total_fatorizado_jornada` (soma 9 fatores)
- Components: apresentação, duração, repouso, noturno decolagem, noturno chegada, ciclo, base away, aclimatacao

### "Score de Efetividade"

- Backend: `calcEffectiveness()` linhas 388–540 → `effectiveness_pct` (0–100%)
- Fórmula: `max(0, min(100, 100 + totalCalibrado × 100))`
- Persistência: `frms_fatorizacao_jornada.effectiveness_pct`
- Frontend: `getEffectivenessColor/Hex/Label()` em `frmsUtils.ts`

---

## 🧮 FÓRMULAS-CHAVE

### Compliance (Painel B)

```
pct = (horas_acumuladas / limite) × 100
```

### Effectiveness (Painel A)

```
totalCalibrado = total_fatorizado_jornada + fatorRepousoCalibrado + fatorProgressivo
effectiveness = max(0, min(100, 100 + totalCalibrado × 100))
```

### Fator Ciclo (Process S Borbély)

```
se diaDoCiclo >= diaMax:  penalidade = pctMax
senão:
  progresso = (diaDoCiclo - diaInicio) / (diaMax - diaInicio)
  penalidade = pctMin + progresso × (pctMax - pctMin)
```

### Acúmulo Rolling

```
hv_7d = soma HV últimos 7 dias
hv_28d = soma HV últimos 28 dias
hv_365d = soma HV últimos 365 dias
hv_mes = soma HV mês calendário corrente
```

### Acúmulo Mensal

```
jornada_realizada_min = soma duração jornadas mês
hv_realizada_min = soma HV mês
jornada_fatorizada_pct = média penalidades jornada
hv_fatorizada_pct = média penalidades HV
dias_embarcado = contagem ES/TS/TV/EX/RE/SA
dias_folga = contagem FR/FS
dias_ferias = contagem FE
```

---

## ⚡ PERFORMANCE & CACHE

- **API Caching:** `staleTime: 15min` para acumulo-frota/heatmap
- **DB Indexes:** `frms_jornada(tripulante_id, data)`, `frms_acumulo_rolling(tripulante_id, data)`
- **Batch Processing:** `/api/frms/reprocessar` para retroatividade

---

## 🔗 DIAGRAMA FLUXO

```
START: Lançamento de Jornada
  │
  ├─→ Load limites (carregarLimites)
  │
  ├─→ Buscar histórico 365 dias (buscarHistoricoJornadas)
  │
  ├─→ calcAcumuloRolling()
  │   └─→ hv_7d, hv_28d, hv_365d, hv_mes, pct_*
  │
  ├─→ calcFatorizacao()
  │   ├─→ calcFatorApresentacao()
  │   ├─→ calcFatorDuracao()
  │   ├─→ calcFatorRepouso()
  │   ├─→ calcFatorHvQuantidade()
  │   ├─→ calcFatorCicloEmbarcado() ← Borbély Process S
  │   └─→ total_fatorizado_jornada (soma 9 fatores)
  │
  ├─→ calcEffectiveness()
  │   ├─→ Modelo sono offshore
  │   ├─→ Fator progressivo período
  │   └─→ effectiveness_pct (0–100%)
  │
  ├─→ Persistir: frms_fatorizacao_jornada + frms_acumulo_rolling
  │
  ├─→ processarAlertas()
  │   └─→ Gerar se pct >= 80%, 90%, 95%, >100%
  │
  └─→ RETORN: { success, effectiveness_pct, alertas }
        └→ Frontend atualiza cards, heatmap, tabela
```

---

## 📚 DOCUMENTAÇÃO COMPLEMENTAR

- **Conceitos:** `FrmsConceitos.tsx` (página educativa)
- **Auditoria:** `AUDITORIA-FRMS-DINAMISMO-HARDCODES-20260310.md`
- **Refatoracao:** `RELATORIO-FRMS-REFATORACAO-20260311.md`
- **Implementacao:** `FRMS-RELATORIO-IMPLEMENTACAO-COMPLETO-2026-03-11.md`
- **Layout:** `RELATORIO-FRMS-LAYOUT-EFETIVIDADE-SESSAO-20260312.md`

---

**Última atualização:** 13/03/2026  
**Versão:** FRMS v3 Dual-Panel
