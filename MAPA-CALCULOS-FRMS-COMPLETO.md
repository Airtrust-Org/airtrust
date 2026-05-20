# MAPA COMPLETO — Lógica de Cálculo FRMS (Ficha de Jornadas e Fadiga)

**Data:** 13 de março de 2026  
**Objetivo:** Documentar todos os arquivos, funções e constantes relacionadas a cálculos FRMS na codebase.

---

## 📋 SUMÁRIO EXECUTIVO

A lógica de cálculo do FRMS está distribuída em **3 camadas principais**:

1. **Backend (Worker) — Cálculos Científicos** (`worker-airtrust/src/lib/frms/`)
   - Funções puras de cálculo (sem efeitos colaterais)
   - Leitura de limites configuráveis do banco de dados
   - Modelo científico dual-painel (Compliance + Efetividade)

2. **Frontend — Visualização e UI** (`src/react-app/pages/frms/`)
   - Funções de formatação e colorização
   - Componentes de painel e tabelas
   - Utilitários de filtro e cache

3. **Banco de Dados — Persistência** (`worker-airtrust/src/lib/frms/`)
   - Camada DB para acesso a limites configuráveis
   - Persistência de fatorização e acúmulo
   - Alertas automáticos

---

## 🔧 BACKEND — FUNÇÕES DE CÁLCULO PURO

### Arquivo: `worker-airtrust/src/lib/frms/calculos.ts`

Este é o **coração científico** do FRMS. Todas as funções são puras (determinísticas, sem DB).

#### 1. **Helpers de Tempo**

| Função                 | Linhas | Descrição                                                    |
| ---------------------- | ------ | ------------------------------------------------------------ |
| `hhmmToMinutes()`      | 28–36  | Converte "HH:MM" em minutos desde meia-noite                 |
| `minutesToHhmm()`      | 39–46  | Converte minutos em "HH:MM"                                  |
| `calcDuracaoMinutos()` | 49–57  | Calcula duração entre dois HH:MM (suporta cruzar meia-noite) |
| `diasNoMes()`          | 60–62  | Retorna número de dias no mês                                |
| `getHora()`            | 65–70  | Extrai hora de "HH:MM"                                       |
| `isNoturno()`          | 73–81  | Verifica se hora está em janela WOCL (configurável)          |

#### 2. **Validação de Repouso**

| Função                       | Linhas | Descrição                           |
| ---------------------------- | ------ | ----------------------------------- |
| `validarRepousoPlataforma()` | 84–94  | Valida repouso em plataforma (3–6h) |

#### 3. **Duração de Jornada**

| Função                 | Linhas  | Descrição                                                      |
| ---------------------- | ------- | -------------------------------------------------------------- |
| `calcDuracaoJornada()` | 100–107 | Calcula duração de jornada (apres. → término, deduz 1h almoço) |

#### 4. **FATORIZAÇÃO DA JORNADA** (Principal Algorithm)

| Função              | Linhas  | Descrição                                                                                          |
| ------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `calcFatorizacao()` | 155–245 | **Fórmula principal para cálculo de fadiga**. Computa 9 fatores de penalidade de jornada + 4 de HV |

**Entradas:**

- `jornada`: dados da jornada (status, horários, HV)
- `repousoAnteriorMin`: minutos de repouso desde jornada anterior
- `limites`: LimitesMap (todos os parâmetros vêm do banco)
- `diasDoMes`: para normalização
- `diaDoCiclo`: dia embarcado no ciclo (null se não aplicável)

**Saídas — 15 fatores:**

```
Jornada:
  fator_basica_pct           — % FDP máximo usado
  fator_apresentacao_pct     — penalidade por horário de início
  fator_duracao_pct          — penalidade jornada longa/curta
  fator_repouso_pct          — penalidade repouso anterior
  fator_noturno_dep_pct      — penalidade WOCL decolagem
  fator_noturno_arr_pct      — penalidade WOCL chegada
  fator_ciclo_embarcado_pct  — acúmulo homeostático (Borbély Process S)
  fator_base_away_pct        — penalidade operação fora base
  fator_aclimatacao_pct      — penalidade não-aclimatado
  total_fatorizado_jornada   — soma de penalidades

HV:
  fator_hv_basica_pct        — % HV mês usado
  fator_hv_quantidade_pct    — penalidade HV muita/pouca
  fator_hv_noturno_dep_pct   — penalidade HV noturna decolagem
  fator_hv_noturno_arr_pct   — penalidade HV noturna chegada
  total_fatorizado_hv        — soma penalidades HV
```

#### 5. **Sub-funções de Fatorização**

| Função                       | Linhas  | Descrição                                                                        |
| ---------------------------- | ------- | -------------------------------------------------------------------------------- |
| `calcFatorApresentacao()`    | 248–265 | Fator horário (madrugada/amanhecer/diurno/tarde/noite)                           |
| `calcFatorDuracao()`         | 268–272 | Fator duração (longa > 600min / curta < 360min / normal)                         |
| `calcFatorRepouso()`         | 275–282 | Fator repouso (adequado ≥ 720min / ruim ≥ 480min / crítico)                      |
| `calcFatorHvQuantidade()`    | 285–289 | Fator HV (muitas ≥ 300min / poucas < 120min / normal)                            |
| `calcFatorCicloEmbarcado()`  | 294–316 | **Fator Borbély Process S** — acúmulo ao longo do embarque (interpolação linear) |
| `fatorizacaoDiaSemJornada()` | 334–362 | Padrão para ES/TS/TV/EX/RE/SA sem horário preenchido                             |
| `zeroFatorizacao()`          | 365–381 | Retorna zeros para folga                                                         |

#### 6. **EFFECTIVENESS (SAFTE-FAST / Modelo Biomatemático)**

| Função                | Linhas  | Descrição                                                                                           |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `calcEffectiveness()` | 388–540 | **Converte fatorização em Score de Efetividade (0–100%)**. Modelo calibrado para offshore com hotel |

**Entradas:**

- `fatorizacao`: resultado de `calcFatorizacao()`
- `limites`: LimitesMap
- `jornada`: dados opcionais (datas, dia do período embarcado)

**Fórmula:**

```
duracao_sono_efetiva = (despertar_time - inicio_sono_time) × qualidade_hotel
fatorRepousoCalibrado = max(-0.5, min(0, ((480 - sono) / 480) × -0.3))
fatorProgressivo = -progMaxPct × (diaPeriodo - 1) / (totalPeriodo - 1)
totalCalibrado = total_fatorizado_jornada + fatorRepousoCalibrado + fatorProgressivo
effectiveness = max(0, min(100, 100 + totalCalibrado × 100))
```

**Saídas:**

```typescript
interface EffectivenessResult {
  effectiveness_pct: number; // 0–100%
  nivel: 'verde' | 'amarelo' | 'atencao' | 'vermelho';
  tempo_abaixo_limiar_pct: number;
  fatorizacao_delta: number;
  duracao_sono_efetiva_min: number | null;
  hora_despertar: string | null;
  hora_inicio_sono: string | null;
  componentes: {
    processo_s: number; // ciclo embarcado
    processo_c: number; // fases circadianas
    repouso: number;
    hv: number;
    duracao: number;
  };
}
```

#### 7. **ACÚMULO ROLLING (Janelas Deslizantes)**

| Função                 | Linhas  | Descrição                                                                                                              |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `calcAcumuloRolling()` | 553–619 | **Calcula horas de voo acumuladas em janelas 7/28/365 dias e mês calendário**, com percentuais vs limites regulatórios |

**Entradas:**

- `tripulanteId`: identificador
- `dataReferencia`: data de cálculo (YYYY-MM-DD)
- `jornadasHistorico`: array de jornadas passadas
- `limites`: LimitesMap

**Saídas:**

```
hv_7_dias_min              — horas de voo últimos 7 dias
hv_28_dias_min             — últimos 28 dias
hv_365_dias_min            — últimos 365 dias
hv_mes_calendario_min      — mês calendário corrente
hv_dia_min                 — hoje
pct_limite_7d              — % do limite 7 dias
pct_limite_28d             — % do limite 28 dias (mensal)
pct_limite_365d            — % do limite 365 dias
pct_limite_dia             — % do limite diário
repouso_anterior_min       — minutos desde última jornada
repouso_suficiente         — flag: repouso ≥ 12h?
```

#### 8. **Repouso Anterior (Helper)**

| Função                  | Linhas  | Descrição                                                            |
| ----------------------- | ------- | -------------------------------------------------------------------- |
| `calcRepousoAnterior()` | 622–660 | Calcula tempo entre término jornada dia anterior e apresentação hoje |

#### 9. **ACÚMULO MENSAL**

| Função                | Linhas  | Descrição                                                                                                |
| --------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `calcAcumuloMensal()` | 691–735 | **Consolida métricas mensais**: jornada realizada, HV, dias embarcado/folga/férias, fatorização agregada |

**Saídas:**

```
jornada_realizada_min      — total jornada mês
hv_realizada_min           — total HV mês
jornada_fatorizada_pct     — % agregado fatorização
hv_fatorizada_pct          — % agregado fatorização HV
dias_embarcado             — dias com status ES/TS/TV/EX/RE
dias_folga                 — dias com status FR/FS
dias_ferias                — dias com status FE
```

#### 10. **Utilidades**

| Função     | Linhas | Descrição                    |
| ---------- | ------ | ---------------------------- |
| `round4()` | 382    | Arredonda a 4 casas decimais |

---

## 📊 TIPOS E CONSTANTES

### Arquivo: `worker-airtrust/src/lib/frms/types.ts`

#### Status de Jornada

```typescript
export const FRMS_STATUS = [
  'ES',
  'TS',
  'TV',
  'EX',
  'RE',
  'SA', // Em Serviço
  'FE',
  'FR',
  'FS',
  'AM',
  'DM',
  'OT',
]; // Fora de Serviço
export const FDP_STATUS = ['ES', 'TS', 'TV', 'EX', 'RE', 'SA'];
export const FOLGA_STATUS = ['FE', 'FR', 'FS', 'AM', 'DM', 'OT'];
```

#### Limites Configuráveis (LimitesMap — Linhas 133–280)

| Categoria                                     | Constante                      | Default      | Descrição                          |
| --------------------------------------------- | ------------------------------ | ------------ | ---------------------------------- |
| **Regulatórios**                              | `FDP_MAXIMO_HORAS`             | 11           | Duração máxima jornada             |
|                                               | `REPOUSO_MINIMO_HORAS`         | 12           | Repouso mínimo entre jornadas      |
|                                               | `HV_7_DIAS_HORAS`              | 45           | Limite HV 7 dias                   |
|                                               | `HV_MES_HORAS`                 | 90           | Limite HV mensal                   |
|                                               | `HV_365_DIAS_HORAS`            | 960          | Limite HV anual                    |
|                                               | `HV_DIARIA_HORAS`              | 8            | Limite HV diário                   |
| **Alertas**                                   | `ALERTA_AVISO_PCT`             | 80           | Aviso preventivo                   |
|                                               | `ALERTA_ATENCAO_PCT`           | 90           | Nível atenção                      |
|                                               | `ALERTA_CRITICO_PCT`           | 95           | Nível crítico                      |
|                                               | `ALERTA_VIOLACAO_PCT`          | **101**      | Violação (> 100%)                  |
| **Ciclo Embarcado** (Process S Borbély)       | `CICLO_EMBARCADO_DIA_INICIO`   | 1            | Dia início do fator                |
|                                               | `CICLO_EMBARCADO_DIA_MAX`      | 15           | Dia acúmulo máximo                 |
|                                               | `CICLO_EMBARCADO_PCT_MIN`      | 0            | Penalidade dia 1                   |
|                                               | `CICLO_EMBARCADO_PCT_MAX`      | -0.15        | Penalidade dia 15                  |
|                                               | `CICLO_EMBARCADO_ATIVO`        | 1            | Ativado?                           |
| **Apresentação (Faixas Horárias)**            | `APRESENTACAO_MADRUGADA_*`     | 0–4h, -0.2   | Madrugada                          |
|                                               | `APRESENTACAO_AMANHECER_*`     | 5–6h, -0.05  | Amanhecer                          |
|                                               | `APRESENTACAO_DIURNO_*`        | 7–11h, 0     | Diurno                             |
|                                               | `APRESENTACAO_TARDE_*`         | 12–17h, -0.1 | Tarde                              |
|                                               | `APRESENTACAO_NOITE_FATOR`     | -0.2         | Noite (18–23h)                     |
| **Duração Jornada**                           | `DURACAO_LONGA_MINUTOS`        | 600          | Limiar jornada longa               |
|                                               | `DURACAO_LONGA_FATOR`          | -0.1         | Penalidade jornada longa           |
|                                               | `DURACAO_CURTA_MINUTOS`        | 360          | Limiar jornada curta               |
|                                               | `DURACAO_CURTA_FATOR`          | -0.1         | Penalidade jornada curta           |
|                                               | `DURACAO_NORMAL_FATOR`         | 0            | Sem penalidade                     |
| **Repouso**                                   | `REPOUSO_ADEQUADO_MINUTOS`     | 720          | Repouso adequado (12h)             |
|                                               | `REPOUSO_ADEQUADO_FATOR`       | 0            | Sem penalidade                     |
|                                               | `REPOUSO_RUIM_MINUTOS`         | 480          | Repouso ruim (8h)                  |
|                                               | `REPOUSO_RUIM_FATOR`           | -0.1         | Penalidade                         |
|                                               | `REPOUSO_CRITICO_FATOR`        | -0.2         | Penalidade crítica                 |
| **Noturno (WOCL)**                            | `NOTURNO_INICIO_HORA`          | 22           | Início WOCL                        |
|                                               | `NOTURNO_FIM_HORA`             | 5            | Fim WOCL                           |
|                                               | `NOTURNO_FATOR`                | -0.1         | Penalidade                         |
| **HV Quantidade**                             | `HV_MUITAS_MINUTOS`            | 300          | Limiar HV muita                    |
|                                               | `HV_MUITAS_FATOR`              | -0.1         | Penalidade HV muita                |
|                                               | `HV_POUCAS_MINUTOS`            | 120          | Limiar HV pouca                    |
|                                               | `HV_POUCAS_FATOR`              | -0.1         | Penalidade HV pouca                |
|                                               | `HV_NORMAL_FATOR`              | 0            | Sem penalidade                     |
| **Operacionais** (migration 0216)             | `FATOR_BASE_AWAY_PCT`          | -0.1         | Penalidade base AWAY               |
|                                               | `FATOR_ACLIMATADO_NAO_PCT`     | -0.1         | Penalidade não-aclimatado          |
| **Efetividade** (SAFTE-FAST — migration 0263) | `EFFECTIV_VERDE_MIN`           | 90           | Threshold verde (desempenho pleno) |
|                                               | `EFFECTIV_AMARELO_MAX`         | 77           | Threshold amarelo                  |
|                                               | `EFFECTIV_VERMELHO_MAX`        | 65           | Threshold vermelho (fadiga severa) |
| **Modelo Sono Offshore** (migration 0267)     | `REPOUSO_MIN_PRE_APRESENTACAO` | 90 min       | Despertar antes apres.             |
|                                               | `REPOUSO_MIN_POS_LIBERACAO`    | 60 min       | Início sono após liberação         |
|                                               | `REPOUSO_QUALIDADE_HOTEL`      | 92           | Eficiência do hotel (%)            |
| **Período Embarcado** (migration 0268)        | `FRMS_EMBARQUE_PROGRESSO_MAX`  | 8            | % máximo degradação                |

---

## 🗄️ BANCO DE DADOS E PERSISTÊNCIA

### Arquivo: `worker-airtrust/src/lib/frms/db-service.ts`

#### Tabelas Relacionadas

| Tabela                      | Função Operación                                 | Linhas Rel.  |
| --------------------------- | ------------------------------------------------ | ------------ |
| `frms_jornada`              | Armazena jornadas diárias                        | CRUD         |
| `frms_fatorizacao_jornada`  | Persiste cálculos de fatorização + effectiveness | 200+         |
| `frms_acumulo_rolling`      | Acúmulo diário (7d/28d/365d)                     | Lookup       |
| `frms_alerta`               | Alertas gerados por limite ultrapassado          | Log          |
| `frms_configuracao_limites` | **LEI ABSOLUTA**: todos os parâmetros vêm daqui  | Carregamento |
| `frms_escala`               | Períodos de embarque (ciclos)                    | Contexto     |

#### Funções Principais DB

| Função                               | Linhas | O que faz                                                                           |
| ------------------------------------ | ------ | ----------------------------------------------------------------------------------- |
| `carregarLimites()`                  | 48–68  | **Carrega TODOS os limites do banco em LimitesMap** (fallback para LIMITES_DEFAULT) |
| `buscarHistoricoJornadas()`          | 83–95  | Busca últimas N jornadas em janela (para calcAcumuloRolling)                        |
| `calcularPeriodoEmbarcadoPorFaixa()` | 97–118 | Determina dia/total do período embarcado                                            |
| `salvarJornada()`                    | 140+   | **Pipeline completa**: salvar → fatorizar → acumular → alertar → auditoria          |

---

## 🎨 FRONTEND — FUNÇÕES DE VISUALIZAÇÃO

### Arquivo: `src/react-app/pages/frms/frmsUtils.ts`

#### Paleta de Cores por Compliance (Painel B)

| Função                    | Linhas | Descrição                                                                        |
| ------------------------- | ------ | -------------------------------------------------------------------------------- |
| `getComplianceColor()`    | 1–25   | Retorna cor de texto por % (85%=aviso, 90%=atenção, 95%=crítico, ≥101%=violação) |
| `getComplianceBg()`       | 28–50  | Background color                                                                 |
| `getComplianceHex()`      | 53–70  | Hex color                                                                        |
| `getComplianceLabel()`    | 73–82  | Label "Dentro Limite" / "Aviso" / "Atenção" / "Crítico" / "Violação"             |
| `getComplianceBarColor()` | 85–102 | Bar color para progress                                                          |

#### Paleta de Cores por Efetividade (Painel A)

| Função                     | Linhas  | Descrição                                                                    |
| -------------------------- | ------- | ---------------------------------------------------------------------------- |
| `getEffectivenessColor()`  | 107–122 | Cor por % (≥90%=verde, ≤65%=vermelho)                                        |
| `getEffectivenessBg()`     | 125–140 | Background                                                                   |
| `getEffectivenessHex()`    | 143–158 | Hex                                                                          |
| `getEffectivenessLabel()`  | 161–171 | Label "Desempenho Pleno" / "Início Degradação" / "Atenção" / "Fadiga Severa" |
| `getEffectivenessStroke()` | 174–186 | SVG stroke                                                                   |

#### Status Consolidado

| Função                     | Linhas  | Descrição                                                |
| -------------------------- | ------- | -------------------------------------------------------- |
| `getStatusConsolidado()`   | 208–224 | **Retorna pior status entre Compliance + Effectiveness** |
| `getComplianceStatus()`    | 226–234 | Mapeia % → status compliance                             |
| `getEffectivenessStatus()` | 237–246 | Mapeia % → status effectiveness                          |
| `STATUS_CONFIG`            | 248–273 | Config CSS por status (normal/atencao/critico/violacao)  |

#### Heatmap (Legenda Dinâmica)

| Função                  | Linhas  | Descrição                                                       |
| ----------------------- | ------- | --------------------------------------------------------------- |
| `getHeatmapCellColor()` | 279–320 | Cor célula heatmap (compliance ou effectiveness, config-driven) |
| `buildHeatmapLegend()`  | 323–370 | Constrói legenda dinâmica com ranges config                     |

#### Formatação e Helpers

| Função            | Linhas | Descrição                          |
| ----------------- | ------ | ---------------------------------- |
| `monthLabel()`    | —      | Converte "YYYY-MM" em "Março 2026" |
| `shiftMonthKey()` | —      | Mês anterior/próximo               |
| `formatMin()`     | —      | Converte minutos em "10h 30min"    |
| `round4()`        | —      | Arredonda                          |

---

### Arquivo: `src/react-app/pages/frms/frmsFilterUtils.ts`

| Função                                | Descrição                                                         |
| ------------------------------------- | ----------------------------------------------------------------- |
| `applyFrmsFrotaFilters()`             | Filtra frota por status, busca, período, etc.                     |
| `resolveFrmsDashboardNivelCompleto()` | **Resolve pior nível entre Compliance + Effectiveness + Alertas** |
| `getFrmsNivelWeight()`                | Ordem de severidade para sort                                     |

---

### Componentes React (Cálculos em JSX)

| Arquivo                    | Linhas           | Função                                                    |
| -------------------------- | ---------------- | --------------------------------------------------------- |
| `FrmsDashboard.tsx`        | 249              | Calcula `effectiveness_pct` para card                     |
| `FrmsTripulantesTable.tsx` | 180–189, 220–225 | Sorts por compliance %, status, effectiveness             |
| `FrmsHeatmap.tsx`          | 134–145, 321–327 | Filtra por status, calcula piores valores                 |
| `FrmsMetricCards.tsx`      | —                | Conta tripulantes por nível (OK/ATENCAO/CRITICO/VIOLACAO) |
| `FrmsConceitos.tsx`        | 120–350          | Página educativa sobre fórmulas (comentar)                |

---

## 🧪 TESTES

### Arquivo: `worker-airtrust/src/__tests__/frms/calculos-alertas.test.ts`

| Função Testada       | Linhas Test | Casos                                          |
| -------------------- | ----------- | ---------------------------------------------- |
| `calcFatorizacao`    | 1000+       | Apresentação, duração, repouso, noturno, ciclo |
| `calcEffectiveness`  | —           | Sono offshore, fator progressivo               |
| `calcAcumuloRolling` | 900+        | Janelas 7d/28d/365d, mês calendário            |
| `calcAcumuloMensal`  | 1058–1105   | Soma mensal, dias embarcado/folga              |

### Arquivo: `src/react-app/pages/frms/__tests__/frmsUtils.test.ts`

| Função Testada            | Descrição            |
| ------------------------- | -------------------- |
| `getComplianceColor()`    | Testes de thresholds |
| `getEffectivenessColor()` | Testes de faixas     |
| Limites customizados      | Config-driven OK     |

---

## 🚀 ROTAS API

### Arquivo: `worker-airtrust/src/routes/frms.ts`

| Endpoint                                    | Função               | Cálculos Envolvidos                                  |
| ------------------------------------------- | -------------------- | ---------------------------------------------------- |
| `POST /api/frms/jornada`                    | Salvar jornada       | `calcFatorizacao`, `calcRolling`, `processarAlertas` |
| `GET /api/frms/acumulo-frota`               | Acúmulo de frota     | `calcAcumuloRolling` por tripulante                  |
| `GET /api/frms/acumulo-tripulante/:id`      | Acúmulo tripulante   | `calcAcumuloRolling` + `calcAcumuloMensal`           |
| `GET /api/frms/heatmap`                     | Dados heatmap        | Effectiveness por dia                                |
| `GET /api/frms/configuracoes`               | Limites atuais       | `carregarLimites()`                                  |
| `PUT /api/frms/configuracoes/limites/:nome` | Atualizar limite     | Update `frms_configuracao_limites`                   |
| `POST /api/frms/reprocessar`                | Recalcular histórico | Batch `calcEffectiveness`                            |

---

## 🔄 FLUXO DE DADOS — JORNADA SALVAÇÃO

```
1. Usuario lanca jornada (ES, 25 Feb, 08:00–17:00, 6h HV, ...)
     ↓
2. salvarJornada(input)
     ↓
3. Buscar histórico (últimos 365 dias)
     ↓
4. calcAcumuloRolling()
     → hv_7d, hv_28d, hv_365d, pct_*
     ↓
5. calcFatorizacao()
     → fator_apresentacao, fator_duracao, fator_repouso, fator_noturno, fator_ciclo, ...
     ↓
6. calcEffectiveness(fatorizacao)
     → effectiveness_pct, nivel (verde/amarelo/atencao/vermelho)
     ↓
7. Persistir em frms_fatorizacao_jornada + frms_acumulo_rolling
     ↓
8. processarAlertas()
     → Gerar alertas se % >= 80% (aviso), 90% (atenção), 95% (crítico), > 100% (violação)
     ↓
9. Retornar para frontend: { success, effectiveness_pct, alertas }
```

---

## 📌 CONSTANTES DE LIMITES CRÍTICAS

### % Compliance (Painel B)

- **85%** = Aviso preventivo
- **90%** = Nível atenção
- **95%** = Nível crítico
- **≥ 101%** = Violação regulatória ⚠️

### % Efetividade (Painel A)

- **≥ 90%** = Verde (desempenho pleno)
- **77–89%** = Amarelo (atenção)
- **65–76%** = Atencao
- **≤ 65%** = Vermelho (fadiga severa)

### Duração Jornada

- **Curta:** < 360 min (6h) → penalidade -0.1
- **Normal:** 360–600 min → sem penalidade
- **Longa:** > 600 min (10h) → penalidade -0.1

### HV Quantidade

- **Poucas:** < 120 min (2h) → penalidade -0.1
- **Normal:** 120–300 min → sem penalidade
- **Muitas:** ≥ 300 min (5h) → penalidade -0.1

### Repouso

- **Adequado:** ≥ 720 min (12h) → sem penalidade
- **Ruim:** 480–719 min (8–11h) → penalidade -0.1
- **Crítico:** < 480 min (< 8h) → penalidade -0.2

### Apresentação (Circadiano)

- **Madrugada (00–04h):** -0.2
- **Amanhecer (05–06h):** -0.05
- **Diurno (07–11h):** 0 (ideal)
- **Tarde (12–17h):** -0.1
- **Noite (18–23h):** -0.2

### Noturno (WOCL)

- **Janela:** 22h–05h
- **Fator:** -0.1

### Ciclo Embarcado (Process S Borbély)

- **Dia início:** 1
- **Dia máximo:** 15
- **Penalidade dia 1:** 0
- **Penalidade dia 15:** -0.15 (interpolação linear)

---

## 🎯 ARQUIVOS RESUMO

### Backend (Cálculos)

- `worker-airtrust/src/lib/frms/calculos.ts` — **650+ linhas, 20+ funções puras**
- `worker-airtrust/src/lib/frms/types.ts` — **Tipos + LIMITES_DEFAULT**
- `worker-airtrust/src/lib/frms/db-service.ts` — **Persistência + orquestração**

### Frontend (Visualização)

- `src/react-app/pages/frms/frmsUtils.ts` — **Paletas de cores, thresholds config-driven**
- `src/react-app/pages/frms/frmsFilterUtils.ts` — **Filtros e resolução de nível consolidado**
- `src/react-app/pages/frms/FrmsConceitos.tsx` — **Página educativa (120–350 linhas com fórmulas)**

### Componentes

- `FrmsDashboard.tsx` — Orquestrador
- `FrmsTripulantesTable.tsx` — Tabela com sort por compliance/effectiveness
- `FrmsHeatmap.tsx` — Mapa de calor (compliance ou effectiveness)
- `FrmsMetricCards.tsx` — Cards de contagem
- `FrmsFilterChips.tsx` — Filtros ativos
- `FrmsFilters.tsx` — Sidebar de filtros

### Testes

- `worker-airtrust/src/__tests__/frms/calculos-alertas.test.ts` — **1100+ linhas, 100+ casos**
- `src/react-app/pages/frms/__tests__/frmsUtils.test.ts` — Testes cor/formatting

### API

- `worker-airtrust/src/routes/frms.ts` — **4000+ linhas, endpoints CRUD e cálculo**
- `worker-airtrust/src/cron/frms-daily-check.ts` — Job diário

---

## 🔗 RELAÇÕES ENTRE COMPONENTES

```
┌─ Backend Cálculo (TypeScript Puro)
│  ├─ calcFatorizacao()       [12 fatores]
│  ├─ calcEffectiveness()     [SAFTE-FAST]
│  ├─ calcAcumuloRolling()    [7/28/365d]
│  └─ calcAcumuloMensal()     [consolidação]
│
├─ Database Service (persistência)
│  ├─ carregarLimites()       [LimitesMap]
│  ├─ salvarJornada()         [pipeline]
│  └─ processarAlertas()      [geração]
│
├─ API Routes (camada HTTP)
│  ├─ POST /frms/jornada      [salva + calcula]
│  ├─ GET /frms/acumulo-frota [leitura]
│  └─ GET /frms/heatmap       [leitura]
│
└─ Frontend Visualização (React)
   ├─ frmsUtils.ts            [cores + thresholds]
   ├─ Components              [render + filtros]
   └─ Hooks                   [API cache]
```

---

## 📋 CHECKLIST DE COMPREENSÃO

- [x] **Cálculo Fatorização:** 9 fatores jornada + 4 HV, somados em `total_fatorizado_jornada`
- [x] **Effectiveness:** Convertido de fatorização via fórmula SAFTE-FAST (0–100%)
- [x] **Acúmulo Rolling:** Janelas deslizantes 7/28/365d + mês calendário
- [x] **Limites Dinâmicos:** **TODOS vêm de `frms_configuracao_limites`**, zero hardcode
- [x] **Compliance**: HV acumulada ÷ límite × 100% (Painel B)
- [x] **Alertas:** 4 níveis (80%=Aviso, 90%=Atenção, 95%=Crítico, ≥101%=Violação)
- [x] **Sono Offshore:** Modelo calibrado para hotel (90min pré-apresentação, 60min pós-liberação)
- [x] **Período Embarcado:** Fator progressivo degradação (Borbély Process S)
- [x] **Configurabilidade:** UI em `FrmsConfiguracoes.tsx` para ajustar todos os thresholds

---

**Gerado:** 13/03/2026  
**Versão:** FRMS v3 Dual-Panel (Painel A Efetividade + Painel B Compliance)
