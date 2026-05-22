# CHEAT SHEET — Cálculos FRMS (Exemplos Práticos)

## 🎓 Entender os Cálculos em 5 Minutos

### 1. COMPLIANCE (Painel B — % HV)

**Simples:** `% = (horas acumuladas ÷ limite) × 100`

#### Exemplo: 7 Dias

```
Tripulante: João
Últimos 7 dias: 42 horas de voo
Limite ANAC: 45 horas
Compliance 7d = (42 ÷ 45) × 100 = 93.3%

Status:
- 93.3% >= 90%? SIM → ATENÇÃO
- 93.3% > 95%? NÃO → não é crítico
```

**Arquivo:** `calcAcumuloRolling()` linhas 553–619 em `calculos.ts`

#### Limites Padrão

```
7 dias:   45h  (máximo semanal)
28 dias:  90h  (máximo mensal)
365 dias: 960h (máximo anual)
Diário:   8h   (máximo por dia)
```

---

### 2. EFFECTIVENESS (Painel A — Score Cognitivo)

**Complexo:** Fórmula SAFTE-FAST com calibração para sono offshore

#### Entender o Conceito

```
100% de efetividade = Tripulante descansado, no horário ideal
0% de efetividade   = Tripulante com fadiga severa, incapacitado

Penalidades de fadiga REDUZEM o score:
- Apresentação noturna (22–05h) → -0.2 (muito ruim)
- Repouso inadequado (< 8h) → -0.2 (crítico)
- Jornada longa (> 10h) → -0.1
- Noturno (WOCL) → -0.1
```

#### Exemplo: Jornada Típica

```
Tripulante: Maria
Data: 12 Mar 2026
Horário: 06:00–16:00 (10h, com 1h almoço = 9h efetivos)
HV: 5h
Repouso anterior: 10h
Apresentação: Amanhecer (06:00)
Decolagem: 06:30 (DIURNO)
Pouso: 16:00 (DIURNO)

FATORIZAÇÃO:
- fator_apresentacao:    -0.05 (amanhecer)
- fator_duracao:         -0.1  (9h > 10h? não, então normal? ... 600min = 10h, abaixo)
- fator_repouso:         0     (10h >= 12h? não, < 12h mas >= 8h = normal)
- fator_noturno_dep:     0     (06:30 não é noturno)
- fator_noturno_arr:     0     (16:00 não é noturno)
- fator_ciclo:           0     (dia 3 de 15: interpolação)
- total_fatorizado:      -0.15

SONO OFFSHORE (calibrado):
- Despertar: 06:00 - 90min = 04:30 do dia anterior
- Início sono: liberação anterior (15:00) + 60min = 16:00 do dia anterior
- Duração bruta: 04:30 – 16:00 = 12.5h
- Duração efetiva: 12.5h × 0.92 (hotel 92%) = 11.5h
- Fator repouso calibrado: max(-0.5, min(0, ((480 - 690) / 480) × -0.3)) ≈ -0.13

EFFECTIVENESS FINAL:
total = -0.15 + (-0.13) + 0 = -0.28
effectiveness = max(0, min(100, 100 + (-0.28) × 100))
effectiveness = max(0, min(100, 100 - 28))
effectiveness = 72%

CLASSIFICAÇÃO:
72% <= 77%? SIM → AMARELO (início degradação)
```

**Código:** `calcEffectiveness()` linhas 388–540 em `calculos.ts`

---

### 3. FATOR CICLO (Process S Borbély)

**Modelo:** Acúmulo homeostático durante período embarcado

#### Visualizar Progressão

```
Período embarcado: 15 dias
Penalidade dia 1:  0% (descansado)
Penalidade dia 7:  -0.075% (metade do período)
Penalidade dia 15: -0.15% (fim do período)

Formula: penalidade = -0.15 × (dia - 1) / (15 - 1)

Dia 1:  -0.15 × (1-1) / 14 = 0
Dia 5:  -0.15 × 4 / 14 = -0.0429
Dia 10: -0.15 × 9 / 14 = -0.0964
Dia 15: -0.15 × 14 / 14 = -0.15
```

**Código:** `calcFatorCicloEmbarcado()` linhas 294–316

---

### 4. ACÚMULO MENSAL

**Resumo:** Consolidação de métricas do mês inteiro

#### Exemplo: Relatório Janeiro

```
Tripulante: Carlos
Mês: Janeiro 2026

Jornadas realizadas:
- 15 ES (Escala de Serviço) = 15 dias embarcado
- 10 FR (Folga Regulamentar) = 10 dias folga
- 5 FE (Férias) = 5 dias férias
- 1 DM (Dispensa Médica) = 1 dia médico

Horas:
- Jornada total: 150h
- HV total: 75h

Fatorização agregada:
- Jornada média penalidade: -0.08
- HV média penalidade: -0.05

CONSOLIDADO:
{
  jornada_realizada_min: 9000 (150h)
  hv_realizada_min: 4500 (75h)
  jornada_fatorizada_pct: -8.0
  hv_fatorizada_pct: -5.0
  dias_embarcado: 15
  dias_folga: 10
  dias_ferias: 5
}
```

**Código:** `calcAcumuloMensal()` linhas 691–735

---

## 🎨 PALETA DE CORES

### Compliance (Use o `getComplianceColor(pct, config)`)

```typescript
if (pct < 85)   → bg-emerald-600  (Verde: Normal)
if (pct < 90)   → bg-amber-500    (Amarelo: Aviso)
if (pct < 95)   → bg-orange-500   (Laranja: Atenção)
if (pct >= 95)  → bg-orange-700   (Laranja escuro: Crítico)
if (pct >= 101) → bg-red-700      (Vermelho: Violação)
```

**Arquivo:** `frmsUtils.ts` linhas 1–102

### Effectiveness (Use o `getEffectivenessColor(pct, config)`)

```typescript
if (pct >= 90)  → text-teal-700   (Verde: Desempenho Pleno)
if (pct <= 77)  → text-amber-700  (Amarelo: Atenção)
if (pct <= 65)  → text-rose-700   (Vermelho: Fadiga Severa)
```

**Arquivo:** `frmsUtils.ts` linhas 107–186

---

## 📊 ANTES vs DEPOIS de USAR LIMITES DO BANCO

### ANTES (Hardcoded — ERRADO ❌)

```typescript
// calculos.ts (old)
const ALERTA_CRITICO = 95; // Hardcoded
const DURACAO_LONGA = 600; // Hardcoded
const REPOUSO_MINIMO = 720; // Hardcoded
```

**Problema:** Mudar limite = recompilar + redeploy

### DEPOIS (Config-driven — CERTO ✅)

```typescript
// calculos.ts (new)
export interface LimitesMap {
  ALERTA_CRITICO_PCT: number; // Vem do banco
  DURACAO_LONGA_MINUTOS: number; // Vem do banco
  REPOUSO_MINIMO_HORAS: number; // Vem do banco
  // ... 50+ outros parâmetros
}

// db-service.ts
async function carregarLimites(db: D1Database): Promise<LimitesMap> {
  const rows = await db
    .prepare('SELECT nome, valor_numerico FROM frms_configuracao_limites WHERE ativo = 1')
    .all();
  // Montar LimitesMap dinamicamente
  return buildLimitesMap(rows);
}
```

**Benefício:** Ajustar limite em produção em 2 cliques (UI `FrmsConfiguracoes.tsx`)

---

## 🔗 FLUXO DE UMA JORNADA: Dia a Dia

### Dia 1 (Lançamento)

```
10:00  Usuario lança em escala: ES (serviço), 08:00–17:00, 5h HV
       ↓
10:02  Sistema processa:
       1. calcAcumuloRolling()  → hv_7d=5, pct_7d=11%
       2. calcFatorizacao()     → fator_apresentacao=-0.05, total=-0.05
       3. calcEffectiveness()   → effectiveness_pct=95%
       4. Persistir em DB
       5. processarAlertas()    → sem alertas (11% < 85%)
       ↓
10:03  API retorna: { success: true, effectiveness_pct: 95, alertas: [] }
       ↓
10:04  Frontend atualiza:
       - Card "Normal": +1 tripulante
       - Heatmap  Mar-10: cor verde (95%-effectiveness)
       - Tabela   Carlos: 11% compliance (5h / 45h)
```

### Dia 5 (Acúmulo)

```
08:00  5 jornadas lançadas (35h HV acumulado)
       ↓
calcAcumuloRolling() → hv_7d=35, pct_7d=78% (verde, dentro limite)
       ↓
Mas... effectiveness de ontem foi 65% (fadiga severa)
       ↓
Dashboard mostra:
- Compliance OK  (78% < 85%)
- Efetividade: ALERTA (65% <= 77%)
- Status consolidado: ATENCAO (pior dos dois)
```

---

## ⚠️ ARMADILHAS COMUNS

### 1. Confundir Compliance com Effectiveness

```
❌ ERRADO:
"Se compliance é 78%, effectiveness deve ser 78%"

✅ CERTO:
- Compliance = quanto do limite regulatório foi consumido (HV ÷ limite)
- Effectiveness = degradação cognitiva do tripulante (ciência SAFTE-FAST)

São INDEPENDENTES:
- Compliance 78% + Effectiveness 95% = tripulante cansado mas dentro do limite
- Compliance 40% + Effectiveness 50% = tripulante leve mas muito fatigado
```

### 2. esquecer que Limites Vêm do Banco

```
❌ ERRADO:
const limite = 45; // Hardcoded

✅ CERTO:
const limite = limites.HV_7_DIAS_HORAS; // Do banco
```

### 3. Não Calibrar Sono Offshore

```
❌ ERRADO:
effectiveness = max(0, min(100, 100 + total_fatorizado * 100))

✅ CERTO:
duracao_sono = (despertar - inicio_sono) * qualidade_hotel
fatorRepouso = modelo_sono(duracao_sono)
effectiveness = max(0, min(100, 100 + (total_fatorizado + fatorRepouso) * 100))
```

### 4. Ignorar fator_basica_pct

```
⚠️ IMPORTANTE:
function calcFatorizacao() {
  const fator_basica_pct = duracaoMin / jornadaMaxMesMin;

  const total = fator_apresentacao + fator_duracao + ... ;
  // ⚠️ fator_basica_pct NÃO entra no total
  // Por quê? Ele é proporção positiva (0–1), não penalidade
  // Incluir tornaria total sempre positivo = effectiveness sempre 100%
}
```

---

## 🧪 TESTAR MANUALMENTE

### No Terminal (worker)

```bash
# 1. Carregar limites
curl -s https://airtrust-api.workers.dev/api/frms/configuracoes | jq .

# 2. Buscar acúmulo de um tripulante
curl -s "https://airtrust-api.workers.dev/api/frms/acumulo-tripulante/123" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Recalcular histórico
curl -X POST https://airtrust-api.workers.dev/api/frms/reprocessar \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### No Frontend (Browser Dev Tools)

```javascript
// Pegar effectiveness atual na página
const col = document.querySelector('[data-testid="frms-heatmap-cell-123-2026-03-12"]');
console.log(col.style.backgroundColor); // cor efetividade

// Inspecionar FrmsFilterContext
const filters = JSON.parse(sessionStorage.getItem('frms-filters-v3'));
console.log(filters); // { periodo: '7', status: ['OK', 'ATENCAO'] }

// Calcular compliance manualmente
const hv = 42; // horas
const limite = 45; // horas
console.log(((hv / limite) * 100).toFixed(1) + '%'); // 93.3%
```

---

## 📈 CASOS DE TESTE CRÍTICOS

| Cenário | Entrada | Saída Esperada | Arquivo |
|---------|---------| |----------|
| Jornada comuns | ES, 08:00–17:00, 6h HV | effectiveness ~80–90% | `calculos-alertas.test.ts` |
| Jornada noturna | ES, 22:00–08:00, 8h HV | effectiveness ~70% | |
| Dia 1 do embarque | Dia=1, Max=15 | ciclo_fator=0 | |
| Dia 15 do embarque | Dia=15, Max=15 | ciclo_fator=-0.15 | |
| Horas limite d7 | 45h acumulado, limite 45 | pct=100% | |
| Repouso critico | 4h anterior | repouso_fator=-0.2 | |
| Sem horário ES | status=ES, sem apres/termo | fator=-0.2 (pior caso) | |

---

## 🔄 Ciclo de Vida de um Limite

```
1. CRIAR
   - DBA insere em frms_configuracao_limites
   - nome=ALERTA_CRITICO_PCT, valor=95, ativo=1

2. CARREGAR
   - Sistema inicia: carregarLimites() → LimitesMap
   - Próxima jornada usa novo valor

3. USAR
   - calcAcumuloRolling(limites) → pct
   - if (pct >= limites.ALERTA_CRITICO_PCT) → CRÍTICO

4. AJUSTAR (via UI)
   - FrmsConfiguracoes.tsx → Formulário
   - PUT /api/frms/configuracoes/limites/ALERTA_CRITICO_PCT
   - UPDATE frms_configuracao_limites SET valor=96 WHERE nome=...

5. APLICAR
   - Novo cálculo já usa valor 96
   - Sem redeploy!
```

---

## 📚 Referências Rápidas

**Arquivo Principal:** `/worker-airtrust/src/lib/frms/calculos.ts`

- Funções puras (determinísticas)
- Sem acesso a DB
- Todos inputs fornecidos

**DB Service:** `/worker-airtrust/src/lib/frms/db-service.ts`

- Carrega limites
- Orquestra pipeline
- Auditoria

**Frontend Cores:** `/src/react-app/pages/frms/frmsUtils.ts`

- Config-driven (config prop)
- 80+ linhas de mapeamento pct → cor

**Testes:** `/worker-airtrust/src/__tests__/frms/calculos-alertas.test.ts`

- 100+ casos de teste
- Cobre todos os cenários

---

**Gerado:** 13/03/2026
