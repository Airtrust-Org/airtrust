# AUDITORIA COMPLETA FRMS — DINAMISMO E HARDCODES

**Data**: 10 de Março de 2026  
**Escopo**: Módulo FRMS do AirTrust — cálculos, alertas, gráficos, legendas, textos  
**Objetivo**: Verificar se todos os parâmetros são dinâmicos (lidos do banco D1) e se não há valores hardcoded

---

## RESUMO EXECUTIVO

| Métrica                                           | Valor                                     |
| ------------------------------------------------- | ----------------------------------------- |
| **Total de parâmetros configuráveis auditados**   | 49                                        |
| **Parâmetros 100% dinâmicos no backend (Worker)** | 49 ✅                                     |
| **Hardcodes críticos no backend**                 | 2 ❌ (função fallback + INTERVALO_ALMOCO) |
| **Hardcodes críticos no frontend**                | 6 ❌                                      |
| **Inconsistências entre telas**                   | 3 ⚠️                                      |
| **Problemas de cache**                            | 1 ⚠️                                      |
| **Prioridade Crítica (fixar imediatamente)**      | 4                                         |
| **Prioridade Alta**                               | 5                                         |
| **Prioridade Média**                              | 6                                         |

---

## 1. ARQUITETURA DO FLUXO DE CONFIGURAÇÃO

### 1.1 Onde são armazenados os parâmetros

- **Tabela D1**: `frms_configuracao_limites`
- **Schema**: `(id TEXT PK, nome TEXT, valor_numerico REAL, unidade TEXT, descricao TEXT, ativo INT, created_at, updated_at, deleted_at)`
- **Total de registros ativos em produção**: 49
- **Seed inicial**: Migration `0213_frms_seed_limites.sql` (14 parâmetros regulatórios) + Migration `0214_frms_evolution_scientific.sql` (35 parâmetros científicos)

### 1.2 Fluxo de leitura (DB → Worker → React)

```
┌────────────────────┐
│  D1: frms_         │
│  configuracao_     │──→ carregarLimites(db) ──→ LimitesMap
│  limites           │     (db-service.ts:51)
└────────────────────┘           │
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              Pipeline de cálculo       API Response
              (cada salvarJornada)      GET /configuracoes
                    │                         │
         calcFatorizacao(limites)    React: useFrmsConfiguracoes()
         calcAcumuloRolling(limites)    staleTime = 15min
         processarAlertas(limites)
```

### 1.3 Fluxo de escrita (React → Worker → DB → Recálculo)

```
React: PUT /api/frms/configuracoes
  └→ body: { configs: [{ nome, valor_numerico }] }
     └→ atualizarConfiguracao(db, configs)
        └→ UPDATE frms_configuracao_limites SET valor_numerico=? WHERE nome=?
     └→ carregarLimites(db) // relê do banco
     └→ c.executionCtx.waitUntil(reprocessarTodosTripulantes(db))
        └→ Para cada tripulante ativo:
           └→ reprocessarTripulanteCompleto(db, id, NOVOS limites)
              └→ Para cada jornada: recalcularPipeline(db, jornada, limites)
     └→ clearApiCacheByPattern('/frms') // React invalida cache local
```

**Veredicto do fluxo**: ✅ **CORRETO**. Após salvar, o Worker:

1. Atualiza o banco
2. Relê os limites frescos
3. Reprocessa TODAS as fatorizações/acúmulos/alertas em background
4. Retorna os novos limites ao React
5. O React invalida o cache local

---

## 2. AUDITORIA POR PARÂMETRO

### 2.1 PROCESS S — Ciclo Embarcado (Modelo Borbély)

#### 🔧 CICLO_EMBARCADO_ATIVO

- **Valor atual no banco**: `1`
- **Tabela/coluna**: `frms_configuracao_limites.nome = 'CICLO_EMBARCADO_ATIVO'`
- **Worker que lê**: `db-service.ts:51` → `carregarLimites()`
- **Onde é usado**: `calculos.ts:276` → `calcFatorCicloEmbarcado()` — `if (!limites.CICLO_EMBARCADO_ATIVO) return 0;`
- **Componentes React**: `FrmsConfiguracoes.tsx` (input editável)
- **É dinâmico?** ✅ Sim
- **Hardcode?** ✅ Nenhum

#### 🔧 CICLO_EMBARCADO_DIA_INICIO

- **Valor atual**: `1`
- **Tabela/coluna**: `frms_configuracao_limites.nome = 'CICLO_EMBARCADO_DIA_INICIO'`
- **Usado em**: `calculos.ts:277-278` → `if (diaDoCiclo < limites.CICLO_EMBARCADO_DIA_INICIO) return 0`
- **É dinâmico?** ✅ Sim
- **Hardcode?** ✅ Nenhum

#### 🔧 CICLO_EMBARCADO_DIA_MAX

- **Valor atual**: `15`
- **Usado em**: `calculos.ts:280-287` → interpolação linear `if (diaDoCiclo >= diaMax) return pctMax`
- **É dinâmico?** ✅ Sim
- **Hardcode?** ✅ Nenhum

#### 🔧 CICLO_EMBARCADO_PCT_MIN

- **Valor atual**: `0`
- **Usado em**: `calculos.ts:281` → `const pctMin = limites.CICLO_EMBARCADO_PCT_MIN`
- **É dinâmico?** ✅ Sim
- **Hardcode?** ✅ Nenhum

#### 🔧 CICLO_EMBARCADO_PCT_MAX

- **Valor atual**: `0.15`
- **Usado em**: `calculos.ts:282` → `const pctMax = limites.CICLO_EMBARCADO_PCT_MAX`
- **É dinâmico?** ✅ Sim
- **Hardcode?** ✅ Nenhum

---

### 2.2 PROCESS C — Fator Apresentação (Circadiano)

#### 🔧 APRESENTACAO_MADRUGADA_H_MIN / H_MAX / FATOR

- **Valores atuais**: `0` / `4` / `-0.2`
- **Usado em**: `calculos.ts:240-241` → `calcFatorApresentacao()` → `if (h >= limites.APRESENTACAO_MADRUGADA_H_MIN && h <= limites.APRESENTACAO_MADRUGADA_H_MAX) return limites.APRESENTACAO_MADRUGADA_FATOR`
- **É dinâmico?** ✅ Sim
- **Hardcode?** ✅ Nenhum no cálculo

#### 🔧 APRESENTACAO_AMANHECER_H_MIN / H_MAX / FATOR

- **Valores atuais**: `5` / `6` / `0.1`
- **Usado em**: `calculos.ts:238-239` → mesma função
- **É dinâmico?** ✅ Sim
- **Hardcode?** ✅ Nenhum

#### 🔧 APRESENTACAO_DIURNO_H_MIN / H_MAX / FATOR

- **Valores atuais**: `7` / `11` / `0`
- **É dinâmico?** ✅ Sim

#### 🔧 APRESENTACAO_TARDE_H_MIN / H_MAX / FATOR

- **Valores atuais**: `12` / `17` / `-0.1`
- **É dinâmico?** ✅ Sim

#### 🔧 APRESENTACAO_NOITE_FATOR

- **Valor atual**: `-0.2`
- **Usado em**: `calculos.ts:246` → `return limites.APRESENTACAO_NOITE_FATOR` (catch-all para 18h-23h)
- **É dinâmico?** ✅ Sim

---

### 2.3 Noturno (WOCL — ICAO Doc 9966)

#### 🔧 NOTURNO_INICIO_HORA / FIM_HORA / FATOR

- **Valores atuais**: `22` / `5` / `0.1`
- **Usado em**: `calculos.ts:72-79` → `isNoturno()` usa `limites?.NOTURNO_INICIO_HORA ?? 22` e `limites?.NOTURNO_FIM_HORA ?? 5`
- **Usado em cálculo**: `calculos.ts:199-200` (dep) e `calculos.ts:204-205` (arr) → `isNoturno(hora, limites) ? limites.NOTURNO_FATOR : 0`
- **É dinâmico?** ✅ Sim
- **Hardcode?** ⚠️ BAIXO — fallback `?? 22` e `?? 5` em `isNoturno()`. Funcional como segurança mas implica valor default inline. Aceitável.

---

### 2.4 Classificação do Repouso Inter-Jornada

#### 🔧 REPOUSO_ADEQUADO_MINUTOS / FATOR

- **Valores atuais**: `720` / `0`
- **Usado em**: `calculos.ts:254-255` → `calcFatorRepouso()` → `if (repousoMin >= limites.REPOUSO_ADEQUADO_MINUTOS) return limites.REPOUSO_ADEQUADO_FATOR`
- **É dinâmico?** ✅ Sim

#### 🔧 REPOUSO_RUIM_MINUTOS / FATOR

- **Valores atuais**: `480` / `-0.1`
- **Usado em**: `calculos.ts:256` → `if (repousoMin >= limites.REPOUSO_RUIM_MINUTOS) return limites.REPOUSO_RUIM_FATOR`
- **É dinâmico?** ✅ Sim

#### 🔧 REPOUSO_CRITICO_FATOR

- **Valor atual**: `-0.2`
- **Usado em**: `calculos.ts:257` → `return limites.REPOUSO_CRITICO_FATOR` (catch-all)
- **É dinâmico?** ✅ Sim

---

### 2.5 Classificação por Volume de HV no Dia

#### 🔧 HV_MUITAS_MINUTOS / FATOR

- **Valores atuais**: `300` / `0.1`
- **Usado em**: `calculos.ts:261-262` → `calcFatorHvQuantidade()` → `if (hvMin >= limites.HV_MUITAS_MINUTOS) return limites.HV_MUITAS_FATOR`
- **É dinâmico?** ✅ Sim

#### 🔧 HV_POUCAS_MINUTOS / FATOR

- **Valores atuais**: `120` / `-0.1`
- **É dinâmico?** ✅ Sim

#### 🔧 HV_NORMAL_FATOR

- **Valor atual**: `0`
- **É dinâmico?** ✅ Sim

---

### 2.6 Limites Regulatórios

#### 🔧 FDP_MAXIMO_HORAS

- **Valor atual**: `11`
- **Usado em**: `calculos.ts:177` (fator_basica_pct), `alertas.ts:68-77` (alerta FDP), `calculos.ts:574` (validar escala futura)
- **É dinâmico?** ✅ Sim

#### 🔧 REPOUSO_MINIMO_HORAS

- **Valor atual**: `12`
- **Usado em**: `calculos.ts:466` → `acumulo.repouso_suficiente` e `alertas.ts:157`
- **É dinâmico?** ✅ Sim

#### 🔧 HV_7_DIAS_HORAS / HV_MES_HORAS / HV_365_DIAS_HORAS / HV_DIARIA_HORAS

- **Valores atuais**: `45` / `90` / `960` / `8`
- **Usados em**: `calculos.ts:436-447` (calcAcumuloRolling percentuais)
- **É dinâmico?** ✅ Sim

#### 🔧 ALERTA_AVISO_PCT / ATENCAO_PCT / CRITICO_PCT / VIOLACAO_PCT

- **Valores atuais no banco**: `85` / `90` / `95` / `101`
- **⚠️ NOTA**: O banco tem `ALERTA_AVISO_PCT=85` (fallback do default era 80) e `ALERTA_VIOLACAO_PCT=101` (personalizado pela operação)
- **Usados em**: `alertas.ts:188-193` → `resolverNivel()`, `calculos.ts:589-634` (validação escala futura)
- **É dinâmico?** ✅ Sim

---

## 3. HARDCODES CRÍTICOS ENCONTRADOS

### ❌ HC-01: `fatorizacaoDiaSemJornada()` — Backend (CRÍTICO)

**Arquivo**: `worker-airtrust/src/lib/frms/calculos.ts:303-319`

```typescript
function fatorizacaoDiaSemJornada(): FatorizacaoResult {
  return {
    fator_basica_pct: 0,
    fator_apresentacao_pct: -0.2,     // ❌ Deveria ser limites.APRESENTACAO_MADRUGADA_FATOR
    fator_duracao_pct: 0.1,           // ❌ Deveria ser limites.APRESENTACAO_AMANHECER_FATOR
    fator_repouso_pct: -0.1,         // ❌ Deveria ser limites.REPOUSO_RUIM_FATOR
    ...
    total_fatorizado_jornada: -0.2,   // ❌ Deve ser soma dos componentes
    ...
  };
}
```

**Problema**: Para jornadas ES sem horário preenchido, retorna valores fixos que NÃO refletem a configuração do banco.

**Impacto**: Se o operador alterar `APRESENTACAO_MADRUGADA_FATOR` de `-0.2` para `-0.35`, esta função continuará usando `-0.2`.

**Correção necessária**: Receber `limites: LimitesMap` como parâmetro e calcular os valores a partir dele.

**Severidade**: 🔴 **CRÍTICA** — Afeta cálculo de score de fadiga

---

### ❌ HC-02: `INTERVALO_ALMOCO_MIN = 60` — Backend (ALTO)

**Arquivo**: `worker-airtrust/src/lib/frms/calculos.ts:105`

```typescript
const INTERVALO_ALMOCO_MIN = 60;
```

**Problema**: Intervalo de almoço fixo em 60 minutos, sem possibilidade de configuração pela operação.

**Impacto**: Operações que não deduzem almoço ou usam intervalo diferente não podem ajustar.

**Correção necessária**: Adicionar `INTERVALO_ALMOCO_MINUTOS` ao `LimitesMap` e ler do banco.

**Severidade**: 🟡 **ALTO** — Afeta cálculo de duração de jornada

---

### ❌ HC-03: `FRMS_VISUAL_LIMITS` — Frontend (CRÍTICO)

**Arquivo**: `src/react-app/pages/frms/frmsUtils.ts:4-7`

```typescript
export const FRMS_VISUAL_LIMITS = {
  atencao: 40, // ❌ Não existe no banco — hardcoded
  critico: 85, // ❌ Hardcoded
  violacao: 95, // ❌ Hardcoded
} as const;
```

**Problema**: O frontend usa thresholds VISUAIS fixos (40/85/95) que são COMPLETAMENTE DIFERENTES dos thresholds regulatórios do banco (85/90/95/101).

**Impacto**: A barra de progresso e cores no dashboard usam thresholds que o operador **NÃO pode alterar**.

**Dupla inconsistência**:

- `FRMS_VISUAL_LIMITS.atencao = 40%` ≠ `ALERTA_AVISO_PCT = 85%` (banco)
- `FRMS_VISUAL_LIMITS.critico = 85%` ≠ `ALERTA_CRITICO_PCT = 95%` (banco)

**Correção necessária**: Remover `FRMS_VISUAL_LIMITS`. Usar os limites do banco carregados via `useFrmsConfiguracoes()` e passá-los via Context API.

**Severidade**: 🔴 **CRÍTICA** — Inconsistência visual vs regulatória

---

### ❌ HC-04: Thresholds hardcoded no `FrmsTripulantesTable.tsx` (CRÍTICO)

**Arquivo**: `src/react-app/pages/frms/components/FrmsTripulantesTable.tsx:70-73`

```typescript
pct >= 95
  ? 'bg-red-500'
  : pct >= 85
    ? 'bg-orange-500'
    : pct >= 40
      ? 'bg-amber-500'
      : 'bg-emerald-500';
```

**Problema**: Cores de status hardcoded com `95`, `85`, `40` ao invés de usar `FRMS_VISUAL_LIMITS` ou limites do banco.

**Severidade**: 🔴 **CRÍTICA** — Cor errada se configuração mudar

---

### ❌ HC-05: Legendas hardcoded no `FrmsHeatmap.tsx` (CRÍTICO)

**Arquivo**: `src/react-app/pages/frms/components/FrmsHeatmap.tsx:244-248`

```typescript
legend = ['< 40%', '40-84%', '85-94%', '≥ 95%'];
```

**Problema**: Textos de legenda fixos. Se `FRMS_VISUAL_LIMITS` ou limites do banco mudarem, a legenda fica incorreta.

**Severidade**: 🔴 **CRÍTICA** — Legenda desatualizada confunde o operador

---

### ❌ HC-06: Fallbacks inconsistentes no `FrmsTimelineChart.tsx` (ALTO)

**Arquivo**: `src/react-app/pages/frms/components/FrmsTimelineChart.tsx:82-83`

```typescript
limiteAtencaoPct = ... ?? 85   // Fallback 85 (banco tem ALERTA_AVISO_PCT=85, ATENCAO=90)
limiteCriticoPct = ... ?? 95   // Fallback 95 (bate com banco)
```

**Problema**: O componente tenta usar limites do banco mas tem fallback para valores que podem conflitar.

**Severidade**: 🟡 **ALTO** — Funciona porém inconsistente

---

### ❌ HC-07: Defaults duplicados no `FrmsFichaTripulante.tsx` (ALTO)

**Arquivo**: `src/react-app/pages/frms/FrmsFichaTripulante.tsx:120-124 + 291-297`

```typescript
const limiteAvisoPct = config?.ALERTA_AVISO_PCT ?? 80; // Default 80, banco tem 85
const limiteCriticoPct = config?.ALERTA_CRITICO_PCT ?? 95; // OK
const limiteViolacaoPct = config?.ALERTA_VIOLACAO_PCT ?? 100; // Default 100, banco tem 101
```

E também na função `ProgressBar()`:

```typescript
function ProgressBar({ limiteAvisoPct = 80, limiteCriticoPct = 95, limiteViolacaoPct = 100 });
```

**Problema**: Fallbacks duplicados em 2 locais, desalinhados com valores do banco.

**Severidade**: 🟡 **ALTO** — Confusão se config não carregar

---

## 4. TESTE MENTAL DE DINAMISMO

### Cenário: Operador altera "Fator madrugada" de -0.2 para -0.35

| Passo                                                                                      | Resultado                                                         | Status   |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------- |
| 1. PUT `/api/frms/configuracoes` → body inclui `APRESENTACAO_MADRUGADA_FATOR: -0.35`       | `atualizarConfiguracao()` faz UPDATE no D1                        | ✅       |
| 2. Worker atualiza `frms_configuracao_limites` WHERE nome = 'APRESENTACAO_MADRUGADA_FATOR' | `valor_numerico = -0.35` salvo no D1                              | ✅       |
| 3. Próximo cálculo `calcFatorApresentacao()` busca `limites.APRESENTACAO_MADRUGADA_FATOR`  | Usa `-0.35` (novo valor)                                          | ✅       |
| 4. Gráfico de timeline usa limites do banco?                                               | Timeline usa `ALERTA_*_PCT`, não fator madrugada diretamente      | ✅ (N/A) |
| 5. Legenda "Madrugada (00h-04h): fator -0.2" atualiza?                                     | ❌ **NÃO** — não existe legenda dinâmica no dashboard             | ❌       |
| 6. Função `fatorizacaoDiaSemJornada()` usa novo valor?                                     | ❌ **NÃO** — retorna `-0.2` hardcoded                             | ❌       |
| 7. Reprocessamento recalcula com novos limites?                                            | ✅ `reprocessarTodosTripulantes` usa `carregarLimites(db)` fresco | ✅       |

### Cenário: Operador altera "Dia fator máximo" de 15 para 21

| Passo                                                                | Resultado                                        | Status |
| -------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| 1-2. Salva no banco                                                  | `CICLO_EMBARCADO_DIA_MAX = 21`                   | ✅     |
| 3. `calcFatorCicloEmbarcado()` usa `limites.CICLO_EMBARCADO_DIA_MAX` | Interpola até dia 21 ao invés de 15              | ✅     |
| 4. Reprocessamento                                                   | Todas as jornadas recalculadas com `diaMax = 21` | ✅     |

### Cenário: Operador altera "Repouso adequado mín" de 720 para 600

| Passo                                                          | Resultado                                                                    | Status |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| 1-2. Salva no banco                                            | `REPOUSO_ADEQUADO_MINUTOS = 600`                                             | ✅     |
| 3. `calcFatorRepouso()` usa `limites.REPOUSO_ADEQUADO_MINUTOS` | ≥ 600min agora é "adequado"                                                  | ✅     |
| 4. Alerta de repouso                                           | `calcAcumuloRolling()` compara com `REPOUSO_MINIMO_HORAS` (não com ADEQUADO) | ✅     |

---

## 5. VERIFICAÇÃO DE CONSISTÊNCIA ENTRE TELAS

### 5.1 Dashboard FRMS

- **Score exibido**: Usa `pct_mes`, `pct_7d`, `pct_dia`, `pct_365d` do endpoint `/acumulo-frota`
- **Esses valores são recalculados** com `limites` do banco via `calcAcumuloRolling()`
- **Cores (FrmsTripulantesTable)**: ❌ **INCONSISTENTE** — Usa 95/85/40 hardcoded em vez de `ALERTA_CRITICO_PCT`/`ALERTA_ATENCAO_PCT`/`ALERTA_AVISO_PCT`
- **Cores (FrmsHeatmap)**: ❌ **INCONSISTENTE** — Usa `FRMS_VISUAL_LIMITS` hardcoded

### 5.2 Escala/Roster

- **`validarEscalaFutura()`**: ✅ Usa `limites` carregados do banco
- **Violação FDP**: ✅ `limites.FDP_MAXIMO_HORAS`
- **Alertas projetados**: ✅ `limites.ALERTA_AVISO_PCT`, etc.

### 5.3 Relatório FRMS

- **`relatorioIndividual()`**: Recalcula com dados do banco
- **`relatorioCompliance()`**: ✅ Usa limites do banco
- **`relatorioMapaFadiga()`**: ✅ Usa limites do banco

### 5.4 Notificações/Alertas

- **Thresholds de alerta**: ✅ `processarAlertas()` usa `limites.ALERTA_*_PCT` do banco
- **Despacho por cargo**: ✅ Usa `frms_notificacao_config` do banco

### 5.5 Tooltips/Legendas

- **Heatmap legenda**: ❌ **INCONSISTENTE** — `'< 40%', '40-84%', '85-94%', '≥ 95%'` hardcoded
- **Timeline chart**: Linhas de referência usam limites do banco (com fallback)
- **FrmsFichaTripulante ProgressBar**: ❌ **INCONSISTENTE** — Defaults hardcoded `80/95/100` vs banco `85/95/101`

---

## 6. VERIFICAÇÃO DE CACHE E INVALIDAÇÃO

### 6.1 Backend (Worker)

- **Cache de limites**: ❌ **NENHUM CACHE NO WORKER** — Cada operação faz `carregarLimites(db)` lendo do D1 diretamente
- **Impacto**: Operações são sempre consistentes. Custo: ~1 query extra por operação (aceitável)
- **Consistência multi-instância**: ✅ Sem risco — não há cache compartilhado entre instâncias Worker

### 6.2 Frontend (React)

| Hook                   | staleTime | Invalidação manual?                                  |
| ---------------------- | --------- | ---------------------------------------------------- |
| `useFrmsConfiguracoes` | 15 min    | ✅ `clearApiCacheByPattern('/frms')` no `handleSave` |
| `useFrmsLimites`       | 15 min    | ❌ Não invalidado após salvar configuração           |
| `useFrmsFrota`         | 2 min     | ✅ `clearApiCacheByPattern('/frms')`                 |
| `useFrmsAlertas`       | 1 min     | ✅ Invalidado                                        |
| `useFrmsAlertasCount`  | 1 min     | ✅ Invalidado                                        |

**Problema**: Após salvar configuração via `FrmsConfiguracoes.tsx`, o `clearApiCacheByPattern('/frms')` invalida o cache. O Dashboard navegará com dados frescos. **Porém**, `useFrmsLimites()` (se usado separadamente) pode retornar stale por até 15 minutos.

### 6.3 Estratégia recomendada

O sistema atual é aceitável:

- Worker sem cache → sempre lê D1 fresco → ✅
- React com cache curto (1-2min para dados operacionais, 15min para config) → ✅ aceitável
- Invalidação manual `clearApiCacheByPattern('/frms')` após salvar → ✅

**Melhoria sugerida**: Adicionar `clearApiCacheByPattern('/frms')` também no `handleRestore` do `FrmsConfiguracoes.tsx`.

---

## 7. FÓRMULA FINAL INTEGRADA

### 7.1 Score de Fatorização da Jornada

```
total_fatorizado_jornada =
    fator_basica_pct                    [duracaoMin / (diasDoMes × FDP_MAXIMO_HORAS × 60) × 100]
  + fator_apresentacao_pct              [calcFatorApresentacao(hora, limites)]
  + fator_duracao_pct                   [calcFatorDuracao(duracaoMin, limites)]
  + fator_repouso_pct                   [calcFatorRepouso(repousoAnteriorMin, status, limites)]
  + fator_noturno_dep_pct              [isNoturno(decolagem) ? NOTURNO_FATOR : 0]
  + fator_noturno_arr_pct             [isNoturno(pouso) ? NOTURNO_FATOR : 0]
  + fator_ciclo_embarcado_pct          [calcFatorCicloEmbarcado(diaDoCiclo, limites)]
  + fator_base_away_pct               [tipo_base === 'AWAY' ? FATOR_BASE_AWAY_PCT : 0]
  + fator_aclimatacao_pct             [aclimatado === 0 ? FATOR_ACLIMATADO_NAO_PCT : 0]
```

**Arquivo**: `calculos.ts:148-230`  
**Função**: `calcFatorizacao()`

### 7.2 Score de Fatorização das Horas de Voo

```
total_fatorizado_hv =
    fator_hv_basica_pct                [hvMin / (HV_MES_HORAS × 60) × 100]
  + fator_hv_quantidade_pct            [calcFatorHvQuantidade(hvMin, limites)]
  + fator_hv_noturno_dep_pct          [= fator_noturno_dep_pct]
  + fator_hv_noturno_arr_pct          [= fator_noturno_arr_pct]
```

### 7.3 Score de Acúmulo (Percentual do Limite)

```
pct_limite_7d     = (hv_7_dias_min / (HV_7_DIAS_HORAS × 60)) × 100
pct_limite_28d    = (hv_28_dias_min / (HV_MES_HORAS × 60)) × 100
pct_limite_mes    = (hv_mes_cal_min / (HV_MES_HORAS × 60)) × 100
pct_limite_365d   = (hv_365_dias_min / (HV_365_DIAS_HORAS × 60)) × 100
pct_limite_dia    = (hv_dia_min / (HV_DIARIA_HORAS × 60)) × 100
```

**Arquivo**: `calculos.ts:432-458`  
**Função**: `calcAcumuloRolling()`

### 7.4 Armazenamento

- Fatorização: ✅ Armazenada em `frms_fatorizacao_jornada` (recalculada a cada nova jornada e no reprocessamento)
- Acúmulo Rolling: ✅ Armazenado em `frms_acumulo_rolling` (recalculado na mesma pipeline)
- Alertas: ✅ Armazenados em `frms_alerta` (recriados a cada pipeline)
- **Todos usam valores do banco** — confirmado pela assinatura `limites: LimitesMap` em toda a cadeia

---

## 8. VALORES EM PRODUÇÃO vs DEFAULTS

| Parâmetro                     | Default (LIMITES_DEFAULT) | Valor Produção | Diverge?                     |
| ----------------------------- | ------------------------- | -------------- | ---------------------------- |
| ALERTA_AVISO_PCT              | 80                        | **85**         | ⚠️ Sim — operação customizou |
| ALERTA_VIOLACAO_PCT           | 100                       | **101**        | ⚠️ Sim — operação customizou |
| Todos os outros 47 parâmetros | Default                   | Default        | ✅ Iguais                    |

---

## 9. LISTA PRIORIZADA DE CORREÇÕES

### 🔴 PRIORIDADE CRÍTICA (afeta cálculos ou consistência regulatória)

| #   | Descrição                                                                         | Arquivo                    | Linha    | Ação                                                          |
| --- | --------------------------------------------------------------------------------- | -------------------------- | -------- | ------------------------------------------------------------- |
| C1  | `fatorizacaoDiaSemJornada()` retorna valores hardcoded                            | `calculos.ts`              | 303-319  | Receber `limites` como param e calcular valores dinamicamente |
| C2  | `FRMS_VISUAL_LIMITS` hardcoded (40/85/95) diverge dos limites do banco (85/90/95) | `frmsUtils.ts`             | 4-7      | Remover const e usar limites via Context API                  |
| C3  | Heatmap legenda hardcoded (`< 40%`, `40-84%`, etc.)                               | `FrmsHeatmap.tsx`          | ~244-248 | Gerar legendas a partir dos limites configurados              |
| C4  | FrmsTripulantesTable cores hardcoded (95/85/40)                                   | `FrmsTripulantesTable.tsx` | ~70-73   | Usar limites do Context ou importar de utils dinâmico         |

### 🟡 PRIORIDADE ALTA

| #   | Descrição                                                     | Arquivo                   | Linha              | Ação                                                            |
| --- | ------------------------------------------------------------- | ------------------------- | ------------------ | --------------------------------------------------------------- |
| A1  | `INTERVALO_ALMOCO_MIN = 60` hardcoded                         | `calculos.ts`             | 105                | Adicionar `INTERVALO_ALMOCO_MINUTOS` ao LimitesMap e seed       |
| A2  | FrmsTimelineChart fallbacks 85/95                             | `FrmsTimelineChart.tsx`   | ~82-83             | Usar `FRMS_VISUAL_LIMITS` (quando fix C2) ou limites do Context |
| A3  | FrmsFichaTripulante defaults duplicados 80/95/100             | `FrmsFichaTripulante.tsx` | ~120-124, ~291-297 | Sempre receber limites do Context, remover defaults             |
| A4  | `clearApiCacheByPattern('/frms')` faltando no `handleRestore` | `FrmsConfiguracoes.tsx`   | ~299               | Adicionar invalidação de cache após restaurar padrão            |
| A5  | `useFrmsLimites()` não invalidado após salvar config          | `useFrms.ts`              | ~213-218           | Invalidar junto com `/frms` pattern ou reduzir staleTime        |

### 🟢 PRIORIDADE MÉDIA

| #   | Descrição                                                  | Arquivo                    | Linha    | Ação                                                    |
| --- | ---------------------------------------------------------- | -------------------------- | -------- | ------------------------------------------------------- |
| M1  | FrmsTimelineChart `domain={[0, 110]}` Y-axis max fixo      | `FrmsTimelineChart.tsx`    | ~115     | Calcular a partir de `ALERTA_VIOLACAO_PCT + margem`     |
| M2  | FrmsFilterContext `periodo: 30` default hardcoded          | `FrmsFilterContext.tsx`    | ~20      | Mover para constante nomeada ou config                  |
| M3  | FrmsAlertasPainel `limit = 25` paginação hardcoded         | `FrmsAlertasPainel.tsx`    | ~78      | Mover para constante nomeada                            |
| M4  | FrmsTripulantesTable `PAGE_SIZE = 20`                      | `FrmsTripulantesTable.tsx` | ~24      | Mover para constante nomeada                            |
| M5  | FrmsHeatmap `rowHeight` thresholds (20/32/22/40)           | `FrmsHeatmap.tsx`          | ~100-101 | Mover para constante nomeada (são UI, não regulatórios) |
| M6  | FrmsRelatorios `d.setDate(d.getDate() - 30)` lookback fixo | `FrmsRelatorios.tsx`       | ~57      | Usar período do FilterContext                           |

---

## 10. CONCLUSÃO

### O que funciona BEM ✅

1. **Toda a camada de cálculo backend** (`calculos.ts`) usa exclusivamente `LimitesMap` — zero hardcode nos cálculos científicos (Process S, Process C, repouso, HV)
2. **O motor de alertas** (`alertas.ts`) usa 100% `limites` do banco
3. **O pipeline de salvamento/reprocessamento** busca limites frescos a cada operação
4. **O reprocessamento pós-config** recalcula TUDO com os novos parâmetros
5. **A tela de configuração** (`FrmsConfiguracoes.tsx`) expõe TODOS os 49 parâmetros editáveis
6. **As seeds** cobrem todos os 49 parâmetros com valores iniciais corretos
7. **A auditoria** registra cada alteração de configuração

### O que precisa de atenção ❌

1. **`fatorizacaoDiaSemJornada()`** é o único ponto no backend onde valores hardcoded entram na fórmula
2. **O frontend tem dois sistemas de thresholds paralelos** que não se conversam:
   - `FRMS_VISUAL_LIMITS` (40/85/95) — puro frontend, não editável
   - `ALERTA_*_PCT` (85/90/95/101) — vindo do banco, editável
   - A solução é unificar no Context API dos limites do banco
3. **Legendas e textos** no Heatmap são estáticos e ficam desatualizados
4. **INTERVALO_ALMOCO_MIN** deveria ser configurável

### Nota sobre a discrepância VISUAL vs REGULATÓRIO

A existência de `FRMS_VISUAL_LIMITS` separados pode ser **intencional** — os limits visuais (40%=amarelo) servem para semaforizar o dashboard ANTES de atingir o limite regulatório (85%=alerta AVISO). Esta é uma camada de "early warning" visual.

Se for intencional, a recomendação é:

1. Tornar `FRMS_VISUAL_LIMITS` **também configurável** no banco (ex: `VISUAL_ATENCAO_PCT`, `VISUAL_CRITICO_PCT`, `VISUAL_VIOLACAO_PCT`)
2. Expor na tela de Configurações como seção "Thresholds Visuais"
3. Garantir que legendas sejam geradas dinamicamente a partir desses valores

---

_Fim da Auditoria — 10 de Março de 2026_
