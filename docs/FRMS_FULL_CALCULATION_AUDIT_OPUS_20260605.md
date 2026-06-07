# FRMS — Auditoria Completa de Cálculos (Opus)

**Data:** 2026-06-05
**Build auditado em produção:** `2026-06-05T20:38:06Z-713f36c`
**Tripulante de referência:** Dieter Johny Kühr (`tripulante_id = 7`), junho/2026
**Modo:** auditoria técnica/operacional/matemática — **somente leitura, nenhuma alteração de código ou banco**

---

## 1. Sumário executivo

A tela `FrmsFichaTripulante` mistura, na mesma linha diária, **três valores de "horas de voo" calculados em escopos diferentes**, sem que isso fique evidente ao usuário:

| Superfície | Campo usado | Escopo | Exemplo 02/06 (Dieter) |
|---|---|---|---|
| Coluna "Horas de voo" | `frms_jornada.horas_voo_minutos` | **dia calendário persistido** | 03h09 (189 min) |
| Coluna "FAT.HV% dia" | `pct_voo_diaria = horas_voo_minutos / 480` | **dia calendário persistido** | 39.38% |
| Alerta "HV diária" | `acumulo.hv_dia_min` (`calcHvRolling24h`) | **janela rolling de 24h com rateio de overlap** | 15h15 (915 min) → 190.63% |
| Card superior "Horas Voo" | `rolling.hv_dia_min` | **mesma janela rolling de 24h** | 15h15 (915 min) |

A coluna e o FAT.HV% **concordam entre si** (ambos usam o valor persistido do dia). Quem diverge é **o alerta e o card superior**, que usam uma janela rolling de 24h.

Dois problemas independentes coexistem e foram **ambos comprovados**:

- **CRÍTICO‑A (origem externa, ingestão sem validação):** o voo de **01/06 = 25h37 (1537 min)** está **persistido** em `frms_jornada`, com `origem = FIRA`. Veio da fonte SIGVOOS/FIRA (o próprio `preview_json` traz `totais_fira.voo = "25:37"`). O AirTrust **somou trechos por dia sem nenhum guard de plausibilidade** (`horasVooMin += record.horasVooMin`, `sigvoos-frms.ts:1302`) e aceitou 25h37 num único dia calendário. O mesmo valor exato aparece para **dois tripulantes** (id 7 e id 22) no mesmo dia → erro sistêmico da fonte naquela data.

- **CRÍTICO‑B (nasce 100% dentro do AirTrust):** o alerta **"HV diária 15h15min (190.63% do limite de 8h)"** de 02/06 é o **vazamento rolling‑24h do valor corrompido de 01/06**. Matematicamente: `1537 × (390/655) = 915.16 → 915 min`. A janela rolling termina na **apresentação** do dia (olha 24h para trás), portanto **inclui o voo do dia anterior e exclui o voo real do próprio dia**. Esse é um defeito estrutural de `calcHvRolling24h` (`calculos.ts:634`), independente da qualidade do dado de origem.

**Conclusão de causa raiz:** o número absurdo `25h37` vem da **fonte FIRA/SIGVOOS** + ausência de validação de ingestão; o número incoerente `15h15` é **produzido pelo AirTrust** ao apresentar uma janela rolling de 24h rotulada como "HV diária" ao lado de uma coluna que mostra o dia calendário. **FIRA/SIGVOOS é fonte de um dado ruim; o AirTrust amplifica e desalinha esse dado.**

---

## 2. Escopo auditado

Cálculo de jornada, horas de voo, percentuais diários/mensais/acumulados/rolling, fatorização, alertas, curva de efetividade, prontidão, cards superiores, ingestão FIRA/SIGVOOS, rotas/API, UI e testes. Diagnóstico antes de qualquer correção. Nenhuma correção aplicada.

---

## 3. Estado git

```
branch: main
HEAD:        713f36cee845dc61f997b1f0e3ca866c1ed8cf2e
origin/main: 713f36cee845dc61f997b1f0e3ca866c1ed8cf2e   (HEAD == origin/main ✓)
HEAD esperado: 713f36cee845dc61f997b1f0e3ca866c1ed8cf2e ✓
git diff --stat / --name-status: vazio (nenhum tracked modificado)
```

Untracked presentes: `artifacts/print-validation/*` e nove `docs/AIRTRUST_OPUS_*` / `docs/AIRTRUST_MEMORY_*` (pré-existentes a esta auditoria). Nenhum arquivo de código modificado.

---

## 4. Arquivos analisados

**Backend — lib/frms:**
- `calculos.ts` — fatorização, effectiveness, **`calcAcumuloRolling` / `calcHvRolling24h`** (origem do 915), acúmulo mensal.
- `alertas.ts` — motor de alertas; alerta "HV diária" usa `acumulo.hv_dia_min` (rolling).
- `integridade.ts` — flags `HV_MAIOR_QUE_JORNADA`, `JORNADA_ZERO_COM_HV`, etc. (apenas sinaliza, não rejeita).
- `fadiga-acumulada-legal.ts` — `calcularLinhaFadigaAcumulada`: `pct_voo_diaria = horas_voo_minutos / 480`.
- `db-service-jornadas.ts` — `buscarJornadas` (alimenta a tabela), `recalcularPipeline`, `persistirAlerta`, `persistirAcumuloRolling`.
- `db-service-acumulo.ts` — `buscarAcumuloTripulante` (cards/rolling).
- `fira-parser.ts`, `fira-service.ts`, `fira-horas-voo.ts` — ingestão FIRA.
- `fadiga-score.ts`, `frms-config.ts`, `types.ts`.

**Backend — services/cron/routes:**
- `services/sigvoos-frms.ts` — **`groupSigvoosRecordsByDay` (linha 1302) soma trechos por dia sem cap.**
- `cron/frms-daily-check.ts` — gera alertas `[CRON]` via mesmo `calcAcumuloRolling`/`processarAlertas`.
- `routes/frms.ts` (3643 linhas) — `/jornadas/:tripulante_id`, `/acumulo/:tripulante_id`, `/tripulante/:id/jornadas`, `/explicacao-dia`, `/alertas`, etc.
- `routes/frms-fira.ts`, `frms-fadiga-acumulada.ts`, `frms-fadiga-checkin.ts`, `frms-operational-snapshot.ts`.

**Frontend — pages/frms:**
- `FrmsFichaTripulante.tsx` — coluna usa `j.horas_voo_minutos`; alertas vêm de `useFrmsAlertas` (persistidos); card "Horas Voo" usa `rolling.hv_dia_min`.
- `frmsJornadasMensaisPresentation.ts`, `frmsUtils.ts`, hooks `useFrms.ts`, `useFrmsOperationalSnapshot.ts`.

---

## 5. Rotas/API analisadas

| Rota | Handler/origem dos dados | Escopo do HV | Consumidor |
|---|---|---|---|
| `GET /api/frms/jornadas/:tripulante_id` | `buscarJornadas` | **dia persistido** (`horas_voo_minutos`) + `pct_voo_diaria` | tabela da Ficha |
| `GET /api/frms/acumulo/:tripulante_id` | `buscarAcumuloTripulante` → `calcAcumuloRolling` | **rolling 24h / mês** (`hv_dia_min`, `hv_mes_calendario_min`) | cards superiores |
| `GET /api/frms/tripulante/:id/jornadas` | `frms_fatorizacao_jornada` JOIN `frms_jornada` | fatorizado/effectiveness | curva de efetividade |
| `GET /api/frms/tripulante/:id/explicacao-dia` | `frms_fatorizacao_jornada` + checkin | effectiveness + sono | painel "explicação do dia" (faz INSERT só em `auditoria_avancada_v2`) |
| `GET /api/frms/alertas` | `frms_alerta` (persistido) | **rolling** (valor gravado por `processarAlertas`) | histórico/badge de alertas da Ficha |

Os alertas exibidos na Ficha são **persistidos** em `frms_alerta` no momento do recálculo/import (não recalculados na leitura).

---

## 6. Tabelas/campos analisados

| Tabela | Campo | Unidade | Quem grava | Quem lê | Bruto/Calc |
|---|---|---|---|---|---|
| `frms_jornada` | `horas_voo_minutos` | min/dia | ingestão FIRA/SIGVOOS, recalc | coluna, `pct_voo_diaria`, acúmulos | **bruto persistido (soma de trechos do dia)** |
| `frms_jornada` | `duracao_jornada_minutos` | min/dia | ingestão (apres→término − 60) | coluna jornada, FDP, integridade | calculado/persistido |
| `frms_jornada` | `origem` | texto | ingestão | filtros/auditoria | bruto (FIRA/SIGVOOS/MANUAL) |
| `frms_fatorizacao_jornada` | `total_fatorizado_hv`, `effectiveness_pct`, etc. | pct/score | `recalcularPipeline` | curva/effectiveness | calculado/fatorizado |
| `frms_acumulo_rolling` | `hv_dia_min`, `hv_mes_calendario_min` | min | `persistirAcumuloRolling` | cards superiores | **rolling/acumulado** |
| `frms_acumulo_mensal` | `hv_realizada_min`, `jornada_realizada_min` | min | recalc | cards "no mês" | mensal |
| `frms_alerta` | `valor_atual_min`, `mensagem` | min/texto | `persistirAlerta` (pipeline + cron) | histórico de alertas | **rolling persistido** |
| `frms_importacao_fira` | `preview_json` (`horas_voo_min`, `totais_fira`) | min/HH:MM | importação SIGVOOS | rastreabilidade | **bruto da fonte** |

**Risco de confusão central:** três campos de "HV" — `frms_jornada.horas_voo_minutos` (dia), `frms_acumulo_rolling.hv_dia_min` (rolling 24h), `frms_acumulo_mensal.hv_realizada_min` (mês) — todos rotulados como "horas de voo" na UI sem distinção de escopo.

---

## 7. Consultas SELECT usadas (todas read-only)

Todas executadas em produção (`airtrust-db`, `--env production --remote`) retornando `changed_db: false`, `rows_written: 0`, `changes: 0`.

1. `frms_jornada` do Dieter (id 7) 2026‑05‑25..06‑10 — valores brutos persistidos.
2. Inventário schema (`sqlite_master`) de tabelas FRMS/FIRA/alertas.
3. `frms_alerta` do Dieter — alertas persistidos, incluindo o de 915 min.
4. `frms_importacao_fira.preview_json` do Dieter, junho/2026 — fonte FIRA.
5. Contagens agregadas de inconsistências (893 jornadas) — ver §8.
6. Registros extremos HV>720 min e duplicidade por `tripulante_id+data`.
7. Estado active/deleted do alerta 915 e duplicação por origem (`jornada_id` null vs set).
8. Breakdown de `HV > jornada` por `origem`.

---

## 8. Contagens de inconsistências (produção, 893 jornadas ativas)

| Condição | Qtd |
|---|---|
| Total de jornadas ativas | 893 |
| `horas_voo_minutos > duracao_jornada_minutos` | **23** (21 origem FIRA, 2 SIGVOOS) |
| `duracao_jornada_minutos = 0` e `horas_voo_minutos > 0` | 6 |
| `duracao_jornada_minutos IS NULL` e `horas_voo_minutos > 0` | 0 |
| horário (apres/término) incompleto e `horas_voo_minutos > 0` | 5 |
| `horas_voo_minutos > 480` (8h) | 3 |
| `horas_voo_minutos > 720` (12h) | 2 |
| `horas_voo_minutos > 1440` (24h) | **2** |
| `duracao_jornada_minutos > 840` (14h) | 3 |
| `duracao_jornada_minutos > 1440` (24h) | 0 |
| Duplicidade `tripulante_id + data` (ativas) | **0** |

Os 2 registros com HV > 24h:

| tripulante_id | data | jornada (min) | HV (min) | origem |
|---|---|---|---|---|
| 7 | 2026‑06‑01 | 595 | **1537** | FIRA |
| 22 | 2026‑06‑01 | 595 | **1537** | FIRA |

Valores idênticos em dois tripulantes no mesmo dia → erro sistêmico da fonte SIGVOOS de 2026‑06‑01.

**Duplicação de alertas:** alertas de pipeline (`jornada_id` preenchido) são corretamente soft‑deletados no recálculo (`db-service-jornadas.ts:320`) — só o 915 mais recente está ACTIVE; os anteriores estão DELETED. Já os alertas do **CRON** (`jornada_id = NULL`) **não são soft‑deletados** e acumulam: 20 `HV_MES`, 6 `HV_7D`, 1 `HV_DIARIA`, 1 `REPOUSO` ativos repetidos.

---

## 9. Rastreio dos casos Dieter (01/06, 02/06, 03/06)

Dados brutos confirmados em `frms_jornada`:

| Data | status | apres | término | jornada (min) | HV (min) | origem |
|---|---|---|---|---|---|---|
| 2026‑06‑01 | ES | 06:30 | 17:25 | 595 (09h55) | **1537 (25h37)** | FIRA |
| 2026‑06‑02 | ES | 10:55 | 17:10 | 315 (05h15) | 189 (03h09) | FIRA |
| 2026‑06‑03 | ES | 10:09 | 17:40 | 391 (06h31) | 282 (04h42) | FIRA |

### Caso A — 03/06 (coerente)
- Jornada 06h31 = 391 min ✓ (apres→término − 60).
- HV coluna 04h42 = 282 min = persistido ✓.
- FAT.HV% dia = 282/480 = 58.75% ✓.
- **Coerente.**

### Caso B — 02/06 (INCOERENTE: coluna 03h09 × alerta 15h15)
| Valor exibido | Campo | Função | Escopo | Coerente? |
|---|---|---|---|---|
| Jornada 05h15 | `duracao_jornada_minutos=315` | persistido | dia | ✓ |
| HV coluna 03h09 | `horas_voo_minutos=189` | `buscarJornadas` | **dia** | ✓ (com a fonte) |
| FAT.HV% 39.38% | `pct_voo_diaria=189/480` | `calcularLinhaFadigaAcumulada` | **dia** | ✓ |
| Alerta "HV diária 15h15 (190.63%)" | `valor_atual_min=915` | `processarAlertas` ← `calcHvRolling24h` | **rolling 24h** | ❌ |

Origem do 915 (comprovada): a janela rolling de 02/06 termina em `02/06 10:55` (apresentação) e cobre 24h para trás → captura o voo de 01/06 com rateio de overlap:
```
overlap de 01/06 dentro da janela = 10:55→17:25 = 390 min
duração do intervalo de 01/06 = 06:30→17:25 = 655 min
contribuição = 1537 × (390/655) = 915.16 → 915 min = 15h15
915 / 480 = 190.625% → round = 190.63%
```
O próprio voo de 02/06 (189) **não entra** porque seu intervalo começa exatamente no fim da janela (10:55). Alerta persistido `frms_alerta` `valor_atual_min=915`, `jornada_id` = jornada de 02/06 (`59a8e3fd…`), ACTIVE.

### Caso C — 01/06 (INCOERENTE: HV 25h37 > jornada 09h55)
| Valor exibido | Campo | Função | Escopo | Coerente? |
|---|---|---|---|---|
| Jornada 09h55 | `duracao_jornada_minutos=595` | persistido | dia | ✓ |
| HV coluna 25h37 | `horas_voo_minutos=1537` | `buscarJornadas` | dia | ❌ (impossível) |
| FAT.HV% 320.21% | `pct_voo_diaria=1537/480` | `calcularLinhaFadigaAcumulada` | dia | ❌ (propaga o 1537) |
| Alerta "HV maior que jornada" | `integridade.HV_MAIOR_QUE_JORNADA` | `avaliarIntegridadeJornadaFrms` | dia | ✓ (flag corretamente o dado ruim) |

Origem do 1537 (comprovada): `frms_importacao_fira.preview_json` de 01/06 traz `horas_voo_min: 1537` e `totais_fira.voo: "25:37"`. O valor entra pela ingestão SIGVOOS/FIRA. `groupSigvoosRecordsByDay` (`sigvoos-frms.ts:1302`) **soma `horasVooMin` de todos os trechos do dia sem limite**, enquanto a jornada usa earliest(apresentação)/latest(término); por isso HV (1537) >> jornada (595). `divergencia_totais = false` porque a checagem só compara total FIRA × total calculado (ambos 1537) — **não checa plausibilidade**.

---

## 10. Matriz de fórmulas

| Métrica | Fórmula | Arquivo/função | Campo/tabela | Unid. | Escopo | Limite | Exibição | Status | Evidência |
|---|---|---|---|---|---|---|---|---|---|
| Jornada diária | `apres→término − 60` (almoço) | `calculos.ts:128 calcDuracaoJornada` | `duracao_jornada_minutos` | min | dia | FDP 11h (660) | coluna/card | OK | 595/315/391 batem |
| HV diária (coluna) | persistido | `db-service-jornadas.ts buscarJornadas` | `horas_voo_minutos` | min | dia | 8h (480) | coluna | **Suspeito (aceita dado impossível)** | 1537 persistido |
| FAT.HV% dia | `horas_voo_minutos/480×100` | `fadiga-acumulada-legal.ts:85` | `horas_voo_minutos` | % | dia | 8h | coluna | OK (mas propaga dado ruim) | 39.38/58.75/320.21 batem |
| FAT.JORNADA% dia | `duracao/660×100`? → usa `/11h` | `fadiga-acumulada-legal.ts:84` (`/176*…`)¹ | `duracao_jornada_minutos` | % | dia | 11h | coluna | **Suspeito** | ver §17 ALTO‑3 |
| FAT.HV% mês | `Σdia/(90×60)×100` | `fadiga-acumulada-legal.ts:87` | acumulado em `buscarJornadas` | % | mês | 90h | coluna | OK | acumulação por mês |
| HV mês (card) | Σ HV do mês calendário | `calculos.ts:716` | `hv_mes_calendario_min` | min | mês | 90h | card | OK | — |
| **HV "diária" (alerta/card)** | **rolling 24h com rateio overlap, janela termina na apresentação** | **`calculos.ts:634 calcHvRolling24h`** | `hv_dia_min` | min | **rolling 24h** | 8h | alerta + card | **ERRADO** | 915 ≠ 189 |
| `pct_limite_dia` | `hv_dia_min/480×100` | `calculos.ts:743` | `hv_dia_min` | % | rolling 24h | 8h | alerta | **ERRADO** | 190.63% |
| Alerta FDP diário | `duracao/(FDP×60)×100` | `alertas.ts:57` | `duracao_jornada_minutos` | % | dia | 11h | alerta | OK | 90.15% bate |
| Integridade HV>jornada | `horas_voo_minutos > duracao_jornada_minutos` | `integridade.ts:74` | ambos persistidos | bool | dia | — | flag/alerta | OK (detecta, não corrige) | 23 casos |
| Effectiveness | proxy heurístico (Borbély/ICAO‑like) | `calculos.ts:434 calcEffectiveness` | fatorização + sono | % | dia | 90/77/65 | curva | INFO (heurístico, ver §11) | — |

¹ Verificar exatamente qual limite de jornada diária a coluna FAT.JORNADA% usa (`JORNADA_DIARIA_HORAS=11` em `FADIGA_ACUMULADA_LIMITES`) versus o FDP do alerta (também 11h). Estão alinhados em 11h, mas documentar a divergência conceitual jornada‑mensal (176h) × FDP.

---

## 11. Curva de efetividade / prontidão / fadiga

- **Modelo:** proxy heurístico local (`calcEffectiveness`, `calculos.ts:434`), declarado explicitamente como **não** sendo SAFTE‑FAST validado (comentário linhas 426‑433). Inputs: fatorização da jornada, sono estimado/informado, WOCL, repouso, dia/total do período embarcado.
- **Escopo:** **diário/fatorizado**, lido de `frms_fatorizacao_jornada` — **independente** da coluna HV e dos alertas rolling.
- **Implicação:** a curva pode estar "correta" (no seu próprio modelo) enquanto a tabela mostra HV absurda — são pipelines distintos. A curva **não** consome `horas_voo_minutos` diretamente para o número de HV; usa `fator_hv_quantidade_pct`. Logo, o 1537 distorce FAT.HV%/alertas, mas afeta a curva apenas via `fator_hv_quantidade` (saturado em "muitas HV"), não proporcionalmente.
- **Clamp:** `effectiveness = max(0, min(100, …))` (`calculos.ts:516`) — clamp legítimo do score, mas mascara entradas extremas (não expõe que o dado de HV é impossível).

---

## 12. Testes existentes e lacunas

Testes encontrados (`worker-airtrust/src/__tests__`, `src/**/*.test.*`): cobrem fatorização/effectiveness e partes de cálculo puro.

**Lacunas críticas (dão falsa sensação de segurança):**
1. **Nenhum teste afirma que coluna HV, FAT.HV% e alerta "HV diária" usam a MESMA base** — a divergência rolling×dia passa.
2. Nenhum teste de `calcHvRolling24h` validando que a janela inclui o **dia de referência** e não apenas o anterior.
3. Nenhum teste de ingestão SIGVOOS/FIRA rejeitando/sinalizando `HV > 24h` ou `HV > jornada` **antes de persistir**.
4. Nenhum teste end‑to‑end de `/jornadas/:tripulante_id` + `/alertas` na mesma data.
5. Nenhum teste do caso "dois tripulantes, mesmo dia, mesmo HV absurdo".
6. Nenhum teste de duplicação de alertas do CRON (`jornada_id = NULL`).

---

## 13. Diagnóstico causal

```
Fonte SIGVOOS/FIRA (2026-06-01)
   │  trechos de voo do dia (possivelmente duplicados/mal-datados na fonte)
   ▼
groupSigvoosRecordsByDay (sigvoos-frms.ts:1302)  ──►  horasVooMin += trecho  (sem cap)
   │  jornada = earliest(apres) … latest(término);  HV = Σ trechos
   ▼
frms_jornada.horas_voo_minutos = 1537 (25h37)   ◄── SEM validação de plausibilidade
   │
   ├──► coluna "Horas de voo" = 25h37            (CRÍTICO-A: dado impossível exibido)
   ├──► pct_voo_diaria = 1537/480 = 320.21%       (propaga)
   ├──► integridade.HV_MAIOR_QUE_JORNADA = flag    (detecta, não corrige)
   │
   └──► calcAcumuloRolling → calcHvRolling24h (02/06)
            window = [01/06 10:55 , 02/06 10:55]
            1537 × (390/655) = 915  ──► hv_dia_min(02/06)=915
               │
               ├──► alerta "HV diária 15h15 (190.63%)"  (CRÍTICO-B: nasce no AirTrust)
               └──► card superior "Horas Voo" = 15h15
```

Causa raiz dupla e comprovada:
- **`25h37`** → fonte FIRA/SIGVOOS + soma de trechos sem guard (`sigvoos-frms.ts:1302`) + ausência de validação na ingestão.
- **`15h15`** → `calcHvRolling24h` (`calculos.ts:634`): janela rolling de 24h ancorada na apresentação (cobre o dia anterior, exclui o dia atual), rotulada e exibida como "HV diária" ao lado da coluna que mostra o dia calendário.

---

## 14. Patches recomendados (NÃO aplicados — fase futura)

**A. Cálculo/API**
- A1. Em `calcHvRolling24h`/`calcAcumuloRolling`: separar claramente "HV do dia calendário" (= `horas_voo_minutos` do dia) de "HV rolling 24h". O alerta "HV diária" e o card "Horas Voo" devem usar o **HV do dia calendário**, não a janela rolling; ou renomear explicitamente o rolling para "HV 24h" e mantê‑lo como métrica separada.
- A2. Corrigir a janela rolling para **incluir o dia de referência** (atualmente termina na apresentação, excluindo o voo do próprio dia).
- A3. Garantir que `valor_atual_min` do alerta `HV_DIARIA` e a coluna FAT.HV% derivem do mesmo campo.

**B. UI/apresentação**
- B1. Card superior "Horas Voo" deve consumir o mesmo campo da coluna (dia) ou rotular explicitamente "(rolling 24h)".
- B2. Exibir badge de inconsistência quando `integridade_status = INCONSISTENTE` ao lado da coluna HV (não só no alerta).

**C. Ingestão FIRA/SIGVOOS**
- C1. Guard de plausibilidade **antes de persistir**: rejeitar/segregar `horas_voo_min > 24h`, `horas_voo_min > duracao_jornada_min`, `jornada=0 com HV>0`. Encaminhar para `frms_jornada_pendente`/revisão em vez de gravar em `frms_jornada`.
- C2. Distinguir "erro de fonte" de "erro de associação/agrupamento" (logar trechos crus que produziram o total).
- C3. Investigar por que a fonte de 2026‑06‑01 gerou 25h37 para 2 tripulantes (mesmo arquivo/lote).

**D. Testes**
- D1..D6 conforme §12 (mesma‑base coluna/alerta; janela rolling; guards de ingestão; e2e jornadas+alertas; caso multi‑tripulante; dedup CRON).

**E. Documentação**
- E1. Documentar os três escopos de "HV" e qual superfície usa qual.

**F. Saneamento retroativo (somente com autorização explícita)**
- F1. Reavaliar os 2 registros HV>24h e os 23 HV>jornada; reimportar da fonte corrigida. **Nenhum UPDATE/DELETE sem autorização.**

---

## 15. O que NÃO foi alterado

Nenhum arquivo de código, migration, configuração ou registro de banco foi alterado. Nenhum commit/push/deploy. Nenhum `git add`. Nenhuma escrita em D1.

---

## 16. Confirmação read-only

Todas as consultas D1 foram `SELECT`. Cada execução remota retornou `changed_db: false`, `rows_written: 0`, `changes: 0`, `last_row_id: 0`. Nenhum `UPDATE/INSERT/DELETE/UPSERT/ALTER/DROP/CREATE` executado.

---

## 17. Achados classificados

**CRÍTICO‑1 — Alerta "HV diária" usa janela rolling 24h, divergente da coluna.**
Evidência: `alertas.ts:83‑99` usa `acumulo.hv_dia_min`; `calculos.ts:634 calcHvRolling24h`; alerta persistido 915 min × coluna 189 min (02/06).
Impacto: alerta operacional incoerente com a tabela; risco de decisão errada de escala.
Causa: janela rolling ancorada na apresentação, rotulada como "diária".
Teste obrigatório antes da correção: asserção de que alerta e coluna HV usam a mesma base diária.

**CRÍTICO‑2 — Ingestão FIRA/SIGVOOS persiste HV impossível (25h37) sem validação.**
Evidência: `frms_jornada` id7/id22 01/06 HV=1537; `frms_importacao_fira.preview_json` `25:37`; `sigvoos-frms.ts:1302` soma sem cap; `divergencia_totais=false`.
Impacto: dado operacionalmente absurdo exibido como verdade.
Causa: soma de trechos por dia + ausência de guard de plausibilidade.
Teste: ingestão rejeita/segrega HV>24h e HV>jornada.

**CRÍTICO‑3 — Card superior "Horas Voo" usa rolling, divergente da coluna.**
Evidência: `FrmsFichaTripulante.tsx:533` usa `rolling.hv_dia_min`.
Impacto: contradição visual card×tabela.
Teste: card e coluna consomem o mesmo campo.

**ALTO‑1 — `calcHvRolling24h` exclui o voo do dia de referência.**
Evidência: janela `[apres−24h, apres]`; voo de 02/06 (189) não entra.
Impacto: "HV diária" nunca reflete o voo do próprio dia.
Teste: janela inclui o dia de referência.

**ALTO‑2 — FAT.HV% propaga dado impossível sem sinalização visual na coluna.**
Evidência: `pct_voo_diaria=320.21%`.
Impacto: percentual sem sentido exibido sem badge de inconsistência.

**ALTO‑3 — Múltiplos campos "HV" com mesmo rótulo e escopos diferentes.**
Evidência: `horas_voo_minutos` (dia) × `hv_dia_min` (rolling) × `hv_realizada_min` (mês).
Impacto: confusão estrutural; raiz dos mismatches.

**MÉDIO‑1 — Alertas do CRON (`jornada_id=NULL`) acumulam sem soft‑delete.**
Evidência: 20 `HV_MES`, 6 `HV_7D` ativos repetidos; `frms-daily-check.ts` não faz o `UPDATE … deleted_at` que o pipeline faz (`db-service-jornadas.ts:320`).
Impacto: histórico de alertas inflado/duplicado.

**MÉDIO‑2 — Integridade apenas sinaliza, não impede persistência/uso em cálculo.**
Evidência: `integridade.ts` retorna flag; `frms_jornada` mantém 1537 e alimenta percentuais/rolling.

**BAIXO‑1 — Effectiveness clamp 0..100 mascara entradas extremas.** `calculos.ts:516`.

**INFO‑1 — Effectiveness é proxy heurístico declarado, não SAFTE‑FAST.** `calculos.ts:426‑433`.

---

## 18. Plano de correção posterior (fase única, priorizada)

1. **Cálculo/API:** A1 (separar HV dia × rolling no alerta/card), A2 (janela inclui o dia), A3 (mesma base), MÉDIO‑1 (dedup CRON).
2. **UI:** B1 (card = coluna), B2 (badge de inconsistência na coluna).
3. **Ingestão FIRA/SIGVOOS:** C1 (guard pré‑persistência), C2 (rastreio de trechos crus), C3 (investigar fonte 01/06).
4. **Testes:** D1‑D6.
5. **Documentação:** E1.
6. **Saneamento retroativo:** F1 — **somente com autorização explícita**, nenhum write sem aprovação.

Ordem recomendada: **C1 (estancar entrada de dado ruim) → A1/A2/A3 (parar a amplificação rolling) → B1/B2 (alinhar UI) → D (travar com testes) → F (saneamento autorizado)**.

---

## 19. Próxima ação recomendada

Abrir uma fase de correção começando por **C1 (guard de plausibilidade na ingestão SIGVOOS/FIRA)** e **A1/A2 (alinhar "HV diária" do alerta/card ao HV do dia calendário e corrigir a janela rolling)**, ambas com os testes D1‑D4 escritos **antes** da correção. Saneamento dos 2 registros HV>24h e dos 23 HV>jornada somente após autorização explícita.
