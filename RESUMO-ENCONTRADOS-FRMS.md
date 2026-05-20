# RESUMO DE ENCONTRADOS — Lógica de Cálculo FRMS

**Data da Busca:** 13 de março de 2026  
**Escopo:** Toda codebase Airtrust

---

## 📍 LOCALIZAÇÃO DOS ARQUIVOS

### ✅ Arquivos Encontrados

#### Backend — Cálculos Científicos

1. **`worker-airtrust/src/lib/frms/calculos.ts`** (650+ linhas)
   - `calcFatorizacao()` — **Principal algoritmo de fadiga** (linhas 155–245)
   - `calcEffectiveness()` — **Conversão para % cognitivo** (linhas 388–540)
   - `calcAcumuloRolling()` — **Janelas 7/28/365d** (linhas 553–619)
   - `calcAcumuloMensal()` — **Consolidação mensal** (linhas 691–735)
   - 10+ funções helper de tempo e sub-fatores

2. **`worker-airtrust/src/lib/frms/types.ts`** (350+ linhas)
   - `LimitesMap` — **53 parâmetros dinâmicos** (linhas 133–280)
   - `LIMITES_DEFAULT` — Fallback seguro
   - Tipos: `FrmsJornada`, `FrmsFatorizacao`, `FrmsAcumuloRolling`

3. **`worker-airtrust/src/lib/frms/db-service.ts`** (1000+ linhas)
   - `carregarLimites()` — **Load dinâmico do banco** (linhas 48–68)
   - `salvarJornada()` — **Pipeline orquestrada** (linhas 140+)
   - `buscarHistoricoJornadas()` — Para rolling window
   - `calcularPeriodoEmbarcadoPorFaixa()` — Ciclos offshore

#### Frontend — Visualização

4. **`src/react-app/pages/frms/frmsUtils.ts`** (350+ linhas)
   - `getComplianceColor/Hex/Label()` — **Paleta Compliance** (linhas 1–102)
   - `getEffectivenessColor/Hex/Label()` — **Paleta Efetividade** (linhas 107–186)
   - `buildHeatmapLegend()` — Legendas dinâmicas (linhas 323–370)
   - Thresholds config-driven: 85%, 90%, 95%, 101%

5. **`src/react-app/pages/frms/frmsFilterUtils.ts`**
   - `applyFrmsFrotaFilters()` — Filtro de frota
   - `resolveFrmsDashboardNivelCompleto()` — **Resolve pior status**

6. **`src/react-app/pages/frms/FrmsConceitos.tsx`** (500+ linhas)
   - Página educativa com fórmulas e diagramas
   - Explicações de "% Jornada", "% HV", "Acúmulo Fadiga", "Score Efetividade"

#### Componentes React

7. **`FrmsDashboard.tsx`** — Orquestrador principal
8. **`FrmsTripulantesTable.tsx`** — Tabela com compliance/effectiveness/status
9. **`FrmsHeatmap.tsx`** — Mapa de calor compliance vs effectiveness
10. **`FrmsMetricCards.tsx`** — Cards de contagem por status
11. **`FrmsFilters.tsx`** — Sidebar de filtros
12. **`FrmsFilterContext.tsx`** — State + sessionStorage

#### Testes

13. **`worker-airtrust/src/__tests__/frms/calculos-alertas.test.ts`** (1100+ linhas)
    - 100+ casos de teste
    - Cobre todas as funções de cálculo

14. **`src/react-app/pages/frms/__tests__/frmsUtils.test.ts`**
    - Testes de cores e formatação

#### API

15. **`worker-airtrust/src/routes/frms.ts`** (4000+ linhas)
    - `POST /api/frms/jornada` — Salva + calcula + alerta
    - `GET /api/frms/acumulo-frota` — Por tripulante
    - `GET /api/frms/heatmap` — Effectiveness por dia
    - `PUT /api/frms/configuracoes/limites/:nome` — Ajusta dinâmicamente

---

## 🎯 RESPOSTA DIRETA ÀS BUSCAS

### 1. Funções que calculam "% Jornada Total"

✅ **ENCONTRADO**

- Arquivo: `worker-airtrust/src/lib/frms/calculos.ts`
- Função: `calcAcumuloRolling()` linhas 553–619
- Fórmula: `(hv_acumulado / limite_horas) × 100`
- Variáveis: `pct_limite_7d`, `pct_limite_28d`, `pct_limite_365d`

### 2. Funções que calculam "% HV"

✅ **ENCONTRADO**

- Arquivo: `worker-airtrust/src/lib/frms/calculos.ts`
- Função: `calcAcumuloRolling()` linhas 613–616
- 4 percentuais: 7d, 28d, 365d, diário
- Frontend: `FrmsTripulantesTable.tsx` coluna "Compliance %"

### 3. Funções que calculam "% HV Diária"

✅ **ENCONTRADO**

- Arquivo: `worker-airtrust/src/lib/frms/calculos.ts`
- Função: `calcAcumuloRolling()` linha 615
- Fórmula: `(hvDia / limiteDiaMin) × 100`
- Limite: `HV_DIARIA_HORAS` default 8h

### 4. Funções que calculam "Acúmulo Fadiga"

✅ **ENCONTRADO**

- Arquivo: `worker-airtrust/src/lib/frms/calculos.ts`
- Função: `calcFatorizacao()` linhas 155–245
- Saída: `total_fatorizado_jornada` (soma 9 fatores)
- Sub-funções: apresentação, duração, repouso, noturno, ciclo, base away, aclimatacao
- Cada fator vem de LimitesMap (configurável)

### 5. Funções que calculam "Score de Efetividade"

✅ **ENCONTRADO**

- Arquivo: `worker-airtrust/src/lib/frms/calculos.ts`
- Função: `calcEffectiveness()` linhas 388–540
- Saída: `effectiveness_pct` (0–100%)
- Fórmula: `max(0, min(100, 100 + totalCalibrado × 100))`
- Componentes: processo_s, processo_c, repouso, hv, duracao
- Modelo: SAFTE-FAST calibrado para sono offshore

### 6. Constantes de limites FRMS

✅ **ENCONTRADO**

- Arquivo: `worker-airtrust/src/lib/frms/types.ts`
- Interface: `LimitesMap` linhas 133–280
- **53 constantes** configuráveis:
  - Compliance: 80%, 90%, 95%, 101%
  - Efetividade: 90%, 77%, 65%
  - Duração: 600min (longa), 360min (curta)
  - HV: 45h (7d), 90h (28d), 960h (365d), 8h (dia)
  - Repouso: 720min (adequado), 480min (ruim)
  - Noturno: 22h–05h, fator -0.1
  - Ciclo: dia 1–15, penalidade 0% a -0.15%
  - Sono: 90min pré, 60min pós, 92% hotel
  - E mais...

### 7. Fórmulas ou algoritmos de cálculo

✅ **ENCONTRADO**

**Fatorização (9 factores jornada):**

```
total_fatorizado_jornada =
  fator_apresentacao +
  fator_duracao +
  fator_repouso +
  fator_noturno_decolagem +
  fator_noturno_chegada +
  fator_ciclo_embarcado +
  fator_base_away +
  fator_aclimatacao
```

**Effectiveness:**

```
totalCalibrado = total_fatorizado_jornada + fatorRepousoCalibrado + fatorProgressivo
effectiveness = max(0, min(100, 100 + totalCalibrado × 100))
```

**Compliance:**

```
pct = (horas_acumuladas / limite_horas) × 100
```

**Acúmulo Rolling:**

```
hv_7d = soma últimos 7 dias
hv_28d = soma últimos 28 dias
hv_365d = soma últimos 365 dias
hv_mes = soma mês calendário
```

### 8. Serviços ou utilitários FRMS

✅ **ENCONTRADO**

**Backend Services:**

- `calculos.ts` — Funções puras
- `db-service.ts` — Persistência + orquestração
- `alertas.ts` — Geração de alertas (mencionado em imports)
- `handlers/frmsHandlers.ts` — Event handlers

**Frontend Utilities:**

- `frmsUtils.ts` — Cores + formatação
- `frmsFilterUtils.ts` — Filtros + setup
- `FrmsFilterContext.tsx` — State management

**API:**

- `routes/frms.ts` — Endpoints REST

### 9. DTOs ou tipos relacionados a FRMS

✅ **ENCONTRADO**

**Tipos Principais:**

- `FrmsJornada` — Dados jornada (linhas 37–69)
- `FrmsFatorizacao` — Cálculos de fadiga (linhas 72–89)
- `FrmsAcumuloRolling` — Acúmulo rolling (linhas 92–111)
- `FrmsAlerta` — Alertas gerados (linhas 114–138)
- `FrmsEscala` — Períodos embarcado (linhas 141–156)
- `FrmsConfigLimite` — Limite configurável (linhas 159–164)
- `LimitesMap` — Mapa de todos os 53 limites (linhas 167–280)
- `EffectivenessResult` — Score + componentes (saída `calcEffectiveness()`)
- `AcumuloRollingResult` — Saída `calcAcumuloRolling()`
- `AcumuloMensalResult` — Saída `calcAcumuloMensal()`

---

## 📊 ESTATÍSTICAS

| Categoria                | Quantidade | Linhas     |
| ------------------------ | ---------- | ---------- |
| **Funções de Cálculo**   | 20+        | 1500+      |
| **Tipos/Interfaces**     | 12         | 300+       |
| **Constantes Dinâmicas** | 53         | (no banco) |
| **Componentes React**    | 12         | 5000+      |
| **Testes**               | 100+ casos | 1100+      |
| **Rotas API**            | 7+         | 4000+      |
| **Documentação**         | 3 arquivos | 2000+      |

---

## 🔗 CONEXÕES PRINCIPAIS

```
Usuário lança jornada
  ↓
routes/frms.ts:POST /api/frms/jornada
  ↓
db-service.ts:salvarJornada()
  ↓
calculos.ts:calcFatorizacao() ← 9 fatores penalidade
  ↓
calculos.ts:calcEffectiveness() ← SAFTE-FAST model
  ↓
calculos.ts:calcAcumuloRolling() ← 7/28/365d
  ↓
Persistir em banco:
  - frms_fatorizacao_jornada (effectiveness_pct)
  - frms_acumulo_rolling (pct_limite_*d)
  ↓
Frontend component recebe dados
  ↓
frmsUtils.ts:getComplianceColor/getEffectivenessColor()
  ↓
Render: Card verde/amarelo/laranja/vermelho
```

---

## 💾 CAMADAS DE PERSISTÊNCIA

| Tabela                      | Função                              | Atualizado                    |
| --------------------------- | ----------------------------------- | ----------------------------- |
| `frms_configuracao_limites` | **53 parâmetros dinâmicos**         | Via UI (FrmsConfiguracoes)    |
| `frms_jornada`              | Dados entrada                       | Por usuário (POST)            |
| `frms_fatorizacao_jornada`  | calcFatorizacao + calcEffectiveness | Auto (ao lançar jornada)      |
| `frms_acumulo_rolling`      | calcAcumuloRolling                  | Auto diário                   |
| `frms_alerta`               | Alertas gerados                     | Automático (processarAlertas) |
| `frms_escala`               | Períodos embarcado                  | Manual                        |

---

## 🎯 PRÓXIMOS PASSOS

Se você quer:

1. **Adicionar novo fator de fadiga**
   - Arquivo: `worker-airtrust/src/lib/frms/calculos.ts` ~linha 240
   - Passo 1: Criar novo limite em `LIMITES_DEFAULT`
   - Passo 2: Criar `calcFatorNovo(limites)` function
   - Passo 3: Incluir em `total_fatorizado_jornada`

2. **Mudar threshold de alerta**
   - Arquivo: `src/react-app/pages/frms/FrmsConfiguracoes.tsx`
   - Clicar no formulário, alterar porcentagem
   - Salva automaticamente em `frms_configuracao_limites`

3. **Adicionar novo painel**
   - Arquivo: `src/react-app/pages/frms/FrmsDashboard.tsx`
   - Chamar `carregarLimites()` → pegar novo limite
   - Renderizar novo componente com `config={frmsConfig}`

4. **Debugar cálculo de um tripulante**
   - Call: `GET /api/frms/acumulo-tripulante/123`
   - Retorna rolling + mensal console.log()
   - Verificar `effectiveness_pct` no heatmap

---

## 📚 DOCUMENTOS CRIADOS

1. **`MAPA-CALCULOS-FRMS-COMPLETO.md`**
   - Documentação técnica completa
   - Todas as funções com linhas
   - Explicação de cada fator

2. **`INDICE-RAPIDO-FRMS.md`**
   - Tabelas de referência rápida
   - Busca por conceito
   - Fórmulas-chave

3. **`CHEAT-SHEET-FRMS.md`**
   - Exemplos práticos
   - Casos de teste
   - Diagrama visual
   - Pitfalls comuns

4. **`RESUMO-ENCONTRADOS-FRMS.md`** (este arquivo)
   - Localização exata dos arquivos
   - Respostas diretas às buscas
   - Estatísticas + checklist

---

**Conclusão:** ✅ **Todos os cálculos FRMS foram mapeados e documentados completamente.**

Versão: **FRMS v3 Dual-Panel** (Painel A Efetividade + Painel B Compliance)  
Data: **13 de março de 2026**
