# Controle de Voos N1 — Decisão de Reestruturação Pós-Auditoria SIGVOOS

> **Data:** 2026-06-14
> **Status:** DOCUMENTO DE DECISÃO TÉCNICA — READ-ONLY | Sem código, sem migration, sem deploy
> **Escopo:** Avaliar se o modelo `cv_*` atual deve permanecer, ser estendido ou ser reestruturado
> após a auditoria autenticada da API SIGVOOS confirmar a estrutura real de dados do fornecedor.
>
> **AVISO:** Nenhuma alteração de código, migration, frontend, backend ou deploy é autorizada
> por este documento. Não cria eDB, SDRMe, Records Core. Não transforma Controle de Voos em
> sistema regulado. Não integra SIGVOOS ao Controle de Voos. Apenas decisão e documentação técnica.

---

## 1. Sumário Executivo

### 1.1 Objetivo da revisão

A auditoria autenticada da API SIGVOOS (`docs/AUDITORIA_API_SIGVOOS_AUTENTICADA.md`, 2026-06-14)
confirmou a estrutura real dos dados do fornecedor e revelou que o modelo atual de `cv_voos` foi
concebido como **voo/programação operacional**, enquanto o SIGVOOS expõe dados em granularidade
de **flight report × etapa/perna × tripulante**. Essa diferença de granularidade precisa de uma
decisão explícita antes de qualquer importador ser desenhado.

### 1.2 Achado SIGVOOS que motiva a revisão

O endpoint `/api/relatorios/voos/tripulantes/etapas/pesquisa` retorna **um registro por
combinação (tripulante × etapa)**. Para reconstruir um voo completo:

- Agrupar por `(flight_report.id, flight_report_leg.number)` — chave composta da etapa.
- Cada registro contém dados de um tripulante naquela etapa.
- `flight_report.id` é o identificador estável do relatório de voo (integer).
- `flight_report_leg.number` é o número sequencial da etapa dentro do relatório.

O modelo atual de `cv_voos` **não tem** coluna para `sigvoos_flight_report_id` nem
`sigvoos_leg_number`. Sem essas colunas, não há idempotência confiável em futura importação.

Adicionalmente:

- `cv_voos` hoje representa um voo programado (origem → destino). Um flight report pode ter
  **múltiplas etapas**, cada uma com origens, destinos, horários e combustíveis diferentes.
- `cv_voo_tripulantes` não tem referência à etapa/perna. Com múltiplas etapas por relatório,
  a tripulação varia por etapa e não pode ser apenas associada ao "voo".
- `duty` (função PIC/SIC/COM) não está disponível no endpoint de etapas — só em
  `/relatorios/voo/pesquisa` — o que cria um problema de resolução de função.

### 1.3 Decisão recomendada

**Opção B: estender o modelo atual com `cv_voo_etapas` + colunas de rastreabilidade SIGVOOS
em `cv_voos` e `cv_voo_tripulantes`, sem apagar nem reconstruir o que já existe.**

Justificativas:

1. `cv_voos` continua representando o **flight report** (relatório de voo) — analogia direta.
2. `cv_voo_etapas` é criado como entidade nova, representando cada perna/leg.
3. `cv_voo_tripulantes` passa a referenciar opcionalmente `etapa_id`, resolvendo tripulação por etapa.
4. O piloto N1 atual pode continuar com um mapeamento 1:1 (voo = 1 etapa por padrão).
5. Nenhuma tabela existente é destruída; a extensão é aditiva.

### 1.4 Impacto no piloto N1

O piloto N1 **pode continuar** com a ressalva de que os voos criados manualmente (sem SIGVOOS)
são modelados como `cv_voos` com uma etapa implícita. Quando o importador existir, cada flight
report será mapeado para `cv_voos` e cada leg para `cv_voo_etapas`. Os dados do piloto não
serão perdidos — mas precisarão de backfill de `etapa_id` quando a nova tabela existir.

**Comunicação obrigatória para os participantes do piloto:** os dados registrados manualmente
durante o piloto representam o "relatório" como um todo e serão migrados para a estrutura
com etapas quando o importador for implementado.

### 1.5 Impacto no importador futuro

O importador SIGVOOS → Controle de Voos precisará:

- Agrupar registros por `(flight_report.id, flight_report_leg.number)` para montar cada etapa.
- Criar ou atualizar `cv_voos` com `sigvoos_flight_report_id = flight_report.id`.
- Criar ou atualizar `cv_voo_etapas` com `sigvoos_leg_number = flight_report_leg.number`.
- Criar ou atualizar `cv_voo_tripulantes` referenciando `etapa_id`.
- Usar `ON CONFLICT (sigvoos_flight_report_id)` em `cv_voos` e
  `ON CONFLICT (cv_voo_id, sigvoos_leg_number)` em `cv_voo_etapas` para idempotência.

### 1.6 Impacto no FRMS

O FRMS hoje consome jornadas via `syncSigvoosForFrms()` com `origem='SIGVOOS'`. A decisão
da Fase 0 é trocar para `origem='CONTROLE_VOOS'` após shadow mode aprovado.

Com a estrutura de etapas:

- O adaptador `cv-frms-adapter` (futuro) usará `cv_voo_etapas` como granularidade de jornada —
  uma etapa = um trecho voado = dados de tempo, pousos, combustível, pax, IFR, noturno.
- Múltiplas etapas do mesmo dia do mesmo tripulante = acumulado diário de jornada.
- `engine_start_time_str` e `engine_shutoff_time_str` continuam sendo proxy de jornada
  (não são hora real de apresentação/dispensa).
- A virada canônica para `CONTROLE_VOOS` **não deve ocorrer antes** da estrutura de etapas
  estar implementada e testada.

### 1.7 Impacto na preparação ANAC

Modelar corretamente a granularidade (flight report → etapa → tripulante) é um passo de
maturidade de dados que, sem ser regulado, prepara o terreno para:

- Rastreabilidade de etapa — necessária para eDB no futuro.
- Idempotência documentada — necessária para não gerar registros duplicados.
- Função do tripulante por etapa — PIC/SIC/COM precisam ser conhecidos por etapa para ANAC.

Isso **não transforma** o Controle de Voos em sistema regulado. Modelar bem não é certificar.

---

## 2. Modelo Atual do Controle de Voos N1

### 2.1 Tabelas `cv_*` atuais

Schema definido em `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql`:

| Tabela | Propósito | Campos-chave |
|--------|-----------|-------------|
| `cv_voos` | Voo programado / realizado | `prefixo`, `data_programacao`, `origem_id`, `destino_id`, `horario_previsto_partida`, `status` |
| `cv_rdv_operacional` | RDV operacional interno por voo | `voo_id`, `horas_voadas`, `numero_pousos`, `ciclos`, `combustivel_*`, `pob`, `carga_kg` |
| `cv_voo_tripulantes` | Tripulação atribuída a um voo | `voo_id`, `funcionario_id`, `funcao` (`PIC/SIC/COM/MEC/OUTRO`) |
| `cv_voo_eventos` | Trilha operacional do voo | `voo_id`, `tipo_evento`, `status_anterior`, `status_novo` |
| `cv_aeroportos` | Catálogo de aeroportos/helipontos/plataformas | `codigo_icao`, `tipo` |
| `cv_tipos_voo` | Tipos operacionais de voo | `codigo`, `nome` |
| `cv_naturezas_voo` | Natureza da operação | `codigo`, `nome` |
| `cv_motivos_operacionais` | Motivos de atraso/cancelamento | `codigo`, `tipo` |

**O que está ausente do schema atual:**

- Nenhuma coluna `sigvoos_flight_report_id` em `cv_voos`.
- Nenhuma coluna `sigvoos_leg_number` em nenhuma tabela.
- Nenhuma tabela de etapa/perna (`cv_voo_etapas` ou equivalente).
- `cv_voo_tripulantes` não referencia etapa — só voo.
- `cv_rdv_operacional` está no nível de voo, não de etapa.
- Nenhuma coluna para `arrival_location_icao` (destino ICAO da etapa).
- Nenhum campo de `day_landings`, `night_landings`, `starts`, `fuel_start`, `fuel_end`, `pax`
  na granularidade de etapa — só campo agregado `numero_pousos`, `ciclos`, `combustivel_*`
  e `pob` / `carga_kg` no RDV.
- `cv_voos.prefixo` não tem campo explícito para `flight_number` (SIGVOOS) nem `report_number`.
- Nenhum campo de `flight_type_name`, `client_name`, `contract_name` (todos vindos do SIGVOOS).
- Nenhum campo de rastreabilidade de importação (`sigvoos_imported_at`, `origem_importacao`,
  `possui_conflito`).

### 2.2 Endpoints atuais

24 endpoints REST em `/api/controle-voos` definidos em
`worker-airtrust/src/routes/controle-voos.ts`, cobrindo:

- CRUD de voos, tripulantes, status, RDV operacional, eventos, ocorrências.
- Dashboard, relatórios internos, catálogos, funcionários disponíveis.
- Todos com tenant isolation (`empresa_id`) e RBAC.

### 2.3 Frontend conectado

Telas conectadas à API real (dados reais):

- Dashboard OCC (`ControleVoosDashboard.tsx`)
- Lista de voos (`ControleVoosVoos.tsx`)
- Detalhe de voo (`ControleVoosVooDetalhe.tsx`)
- Lista e detalhe de RDV (`ControleVoosRdv.tsx`, `ControleVoosRdvDetalhe.tsx`)

Telas ainda demonstrativas (mock):

- Jornadas (`ControleVoosJornadas.tsx`)
- Indisponibilidades (`ControleVoosIndisponibilidades.tsx`)
- Hangaragem (`ControleVoosHangaragem.tsx`)
- Relatórios (`ControleVoosRelatorios.tsx`)
- Tabelas auxiliares (`ControleVoosTabelas.tsx`)

### 2.4 RDV operacional atual

`cv_rdv_operacional` é um registro 1:1 por voo. Campos principais:

- `horas_voadas` (REAL) — tempo de voo agregado.
- `numero_pousos` (INTEGER) — total de pousos.
- `ciclos` (INTEGER) — acionamentos de motor.
- `combustivel_decolagem`, `combustivel_pouso`, `combustivel_consumo` (REAL).
- `pob` (INTEGER) — pessoas a bordo.
- `carga_kg` (REAL) — carga em kg.
- `horario_decolagem_real`, `horario_pouso_real` — horários TEXT.
- `ocorrencias`, `divergencias` — TEXT livre.
- `status` — `rascunho | preenchimento_finalizado | cancelado`.

Sem distinção por etapa. Para voos com múltiplas pernas, os dados estão agregados.

### 2.5 Limitações conhecidas

1. **Granularidade plana** — `cv_voos` representa um voo, mas um flight report SIGVOOS pode ter
   N etapas com origens, destinos e horários diferentes.
2. **Sem idempotência SIGVOOS** — não há coluna para mapear `cv_voos.id` ↔ `flight_report.id`.
3. **Tripulação sem função por etapa** — `cv_voo_tripulantes.funcao` está no nível de voo.
4. **RDV sem granularidade de etapa** — campos de combustível, pousos e horas são por voo.
5. **Destino ICAO ausente no nível da etapa** — `cv_voos.destino_id` existe, mas não captura
   o ICAO intermediário entre etapas.
6. **Sem rastreabilidade de importação** — campos `origem_importacao`, `sigvoos_imported_at`,
   `possui_conflito` não existem.

### 2.6 O que já é aproveitável

- Toda a infra de tenant isolation, RBAC e auditoria operacional.
- `cv_voos` pode mapear para flight report com pequenas adições.
- `cv_aeroportos` com `codigo_icao` já serve para lookup de origem/destino.
- `cv_voo_tripulantes` pode ser estendido com `etapa_id` opcional.
- `cv_rdv_operacional` pode ser mantido como resumo do relatório inteiro; dados por etapa vão
  para `cv_voo_etapas`.
- `cv_voo_eventos` é reutilizável para registrar importações e conflitos.

---

## 3. Modelo Real Observado no SIGVOOS

### 3.1 Estrutura `flight_report`

```json
{
  "id": 12043,                          // ID estável do relatório
  "report_number": "12043",             // número do relatório (geralmente = id como string)
  "flight_number": "507548166",         // número de voo operacional (string numérica longa)
  "aircraft": { "registration": "PR-ABC" },
  "flight_type": { "name": "Petrobras" },
  "client": { "name": "Petrobras" },
  "contract": { "name": "5900.0111589.19.2" }
}
```

- `flight_report.id` é integer, estável, confirmado na documentação oficial.
- `report_number` provavelmente é a representação textual do mesmo id.
- `flight_number` é um identificador operacional diferente (ex: número TAF/operacional).
- Sem `aircraft.id` — identificação da aeronave é exclusivamente pelo `registration`.
- Sem `flight_type.id` tipado — apenas `name` como string.

### 3.2 Estrutura `flight_report_leg`

```json
{
  "number": 1,                          // número da etapa dentro do relatório
  "departure_location": { "icao_code": "SBJR" },
  "arrival_location": { "icao_code": "PMXL" },
  "engine_start_time_str": "08:34",
  "takeoff_time_str": "08:41",
  "landing_time_str": "09:30",
  "engine_shutoff_time_str": "09:37",
  "takeoff_land_time_str": "00:49",
  "total_time_str": "00:56",
  "navigation_time_str": "00:49",
  "ifr_time_str": "00:30",
  "night_time_str": null,
  "day_landings": 1,
  "night_landings": 0,
  "starts": 1,
  "pax": 10,
  "payload": 0,
  "fuel_start": 1086,
  "fuel_end": 730
}
```

- `number` é o número sequencial da etapa (começa em 1 — confirmar P10 com fornecedor).
- Todos os horários são strings `HH:MM`. Timezone não documentado (provavelmente BRT — confirmar P4).
- `fuel_start` e `fuel_end` provavelmente em kg (unidade não especificada — confirmar).
- `payload` em unidade não especificada.
- Sem `status` por etapa. Sem `updated_at` por etapa.

### 3.3 Estrutura `staff`

```json
{
  "id": 73,
  "name": "TRIPULANTE EXEMPLO",
  "inscription": "12345"
}
```

- `staff.id` é integer, presente no endpoint de etapas — **não extraído** pelo AirTrust hoje.
- `staff.inscription` é a matrícula funcional — usado pelo AirTrust como chave de resolução.
- `staff.canac` / `staff.codigo_anac` **não aparecem** na documentação oficial (confirmar P1).
- `duty` (Piloto/SIC/COM) **não está** no endpoint de etapas — só em `/voo/pesquisa` (flat).

### 3.4 Um registro por `tripulante × etapa`

O endpoint `/etapas/pesquisa` retorna:

```text
response.data.main = [
  { staff: {...}, date: "15/02/2021", flight_report: {...}, flight_report_leg: {...} },
  { staff: {...}, date: "15/02/2021", flight_report: {...}, flight_report_leg: {...} },
  ...
]
```

Cada item representa **um tripulante em uma etapa**. Para uma etapa com 3 tripulantes (PIC, SIC,
MEC), haverá 3 itens com o mesmo `(flight_report.id, flight_report_leg.number)` e staff diferentes.

Para reconstruir a etapa completa:
```
agrupar por (flight_report.id, flight_report_leg.number)
  → dados da etapa (horários, pousos, combustível, pax) são iguais em todos os registros
  → lista de tripulantes = todos os staff com esse mesmo (flight_report.id, leg.number)
```

### 3.5 Campos de aeronave, origem, destino, horários, pousos, combustível, pax e payload

Todos os campos de dados físicos da etapa vêm de `flight_report_leg`:

| Categoria | Campos |
|-----------|--------|
| Aeronave | `flight_report.aircraft.registration` (apenas prefixo, sem id) |
| Origem | `flight_report_leg.departure_location.icao_code` |
| Destino | `flight_report_leg.arrival_location.icao_code` (não extraído atualmente) |
| Horários | `engine_start_time_str`, `takeoff_time_str`, `landing_time_str`, `engine_shutoff_time_str` |
| Tempos calculados | `takeoff_land_time_str`, `total_time_str`, `navigation_time_str`, `ifr_time_str`, `night_time_str` |
| Pousos | `day_landings`, `night_landings` |
| Ciclos/Starts | `starts` |
| Combustível | `fuel_start`, `fuel_end` |
| Passageiros | `pax` |
| Carga | `payload` |

### 3.6 Ausência de `duty` no endpoint de etapas

`duty` (ex: `"Piloto"`, `"SIC"`, `"COM"`) só existe no endpoint `/relatorios/voo/pesquisa`
em estrutura flat. No endpoint de etapas (`/etapas/pesquisa`), **não há campo `duty`**.

Consequência: ao importar via `/etapas/pesquisa`, a função do tripulante em cada etapa
**não pode ser determinada diretamente**. Estratégias possíveis:

a) Chamar `/voo/pesquisa` (range=1) em paralelo e cruzar por `inscription` + `flight_report`.
b) Deixar `funcao = null` ou `OUTRO` na importação e exigir preenchimento manual.
c) Confirmar com SIGVOOS se `duty` virá em versão futura do endpoint de etapas (P5).

### 3.7 Ausência de CANAC confirmado

`staff.canac` e `staff.codigo_anac` **não aparecem na documentação oficial** do endpoint de
etapas. O normalizador atual do AirTrust tenta esses campos (`staff.canac`, `staff.codigo_anac`,
`canac`), mas podem não existir nos dados reais. O AirTrust usa hoje `staff.inscription`
(matrícula) como chave primária de resolução de tripulante.

Confirmar com SIGVOOS (P1 na lista de perguntas pendentes).

### 3.8 Ausência de `updated_at` / status por item

- Não existe `updated_at`, `data_alteracao` ou `data_modificacao` em nenhum endpoint.
- Não existe `status_voo` por item de etapa — apenas como **filtro do request** (`status=1` para
  aprovados, `status=0` para todos os finalizados).
- Sincronização incremental é inviável. O único mecanismo disponível é **polling por período**
  (full-range dentro dos 90 dias de janela).

---

## 4. Decisão Central: `cv_voos` Representa Voo/Relatório ou Etapa?

### Opção A — Manter `cv_voos` como etapa/perna

**Descrição:** Reinterpretar `cv_voos` para que cada linha represente uma etapa/perna
(equivalente a `flight_report_leg`). Flight reports com N etapas gerariam N linhas em `cv_voos`.

**Vantagens:**

- Granularidade máxima desde o início.
- Campos de origem, destino, horários, combustível e pousos ficam diretamente em `cv_voos`.
- Idempotência por `(sigvoos_flight_report_id, sigvoos_leg_number)` direto na tabela principal.

**Desvantagens:**

- **Quebra total de compatibilidade** com o que já existe — piloto N1, 24 endpoints, frontend
  conectado, 36 testes passando, 47 registros de teste — tudo invalidado.
- `cv_rdv_operacional` tem `voo_id` 1:1 — precisaria ser rebatizado para `etapa_id`.
- `cv_voo_tripulantes.voo_id` perderia semântica — seria "etapa_id".
- Relatório de voo completo exige agrupar múltiplas linhas.
- Usuário do OCC veria "voos" que são na verdade pernas — confusão operacional.
- O piloto N1 usaria `cv_voos` para registrar voos completos, mas no SIGVOOS o mesmo voo pode
  ter 3 pernas — sem `cv_voos` representando o relatório, não há onde agrupar.

**Impacto no frontend:** Reconstrução total dos componentes de lista de voos, detalhe e RDV.

**Impacto no backend:** Reescrita de 24 endpoints + nova semântica de entidade.

**Impacto no RDV:** RDV por etapa funciona, mas RDV resumo por relatório precisa de view/aggregation.

**Impacto no importador:** Simplifica — 1:1 entre item SIGVOOS e linha `cv_voos`.

**Impacto no FRMS:** Pode funcionar, mas perde a noção de "relatório" agregado.

**Risco de retrabalho:** MUITO ALTO. Destrói todo o trabalho do piloto N1.

**Recomendação: REJEITADA.**

---

### Opção B — `cv_voos` representa o flight report; criar `cv_voo_etapas`

**Descrição:** `cv_voos` continua representando o **relatório de voo** (flight report) como
unidade de programação. Uma nova tabela `cv_voo_etapas` representa cada perna dentro do relatório.
`cv_voo_tripulantes` passa a referenciar opcionalmente `etapa_id`.

**Vantagens:**

- Compatibilidade aditiva — nada existente é destruído.
- Semântica clara: `cv_voos` = relatório de voo, `cv_voo_etapas` = perna.
- Idempotência explícita por `(sigvoos_flight_report_id)` em `cv_voos` e
  `(cv_voo_id, sigvoos_leg_number)` em `cv_voo_etapas`.
- Piloto N1 continua funcionando: voos criados manualmente = 1 etapa implícita.
- RDV pode existir em dois níveis: resumo no `cv_rdv_operacional` (voo/relatório) e dados
  detalhados por etapa em `cv_voo_etapas`.
- `cv_voo_tripulantes` com `etapa_id` opcional preserva retro-compatibilidade (etapa NULL =
  atribuído ao voo inteiro, como hoje).
- FRMS pode usar dados de `cv_voo_etapas` como granularidade de jornada.
- Adição de campos de rastreabilidade em `cv_voos` não quebra nada.

**Desvantagens:**

- Requer migration nova (ainda não autorizada; apenas desenhada aqui).
- Dois níveis de dados (voo + etapa) aumentam complexidade de queries.
- O frontend precisará de atualização para exibir etapas quando disponíveis.
- A lógica de importador precisará de JOIN entre `cv_voos` e `cv_voo_etapas`.

**Impacto no frontend:** Additive — telas existentes continuam; novas telas/componentes exibem
etapas quando houver importação SIGVOOS. Piloto N1 não é afetado.

**Impacto no backend:** Novos endpoints para etapas; endpoints existentes não mudam.

**Impacto no RDV:** `cv_rdv_operacional` permanece como resumo por voo/relatório. Dados
granulares por etapa ficam em `cv_voo_etapas`. Para voos manuais (1 etapa), o RDV é equivalente.

**Impacto no importador SIGVOOS:** Importador cria/atualiza `cv_voos` por `flight_report.id`
e cria/atualiza `cv_voo_etapas` por `(flight_report.id, flight_report_leg.number)`.

**Impacto no FRMS:** O adaptador `cv-frms-adapter` usa `cv_voo_etapas` como unidade de
jornada — mais preciso do que usar o voo inteiro como proxy.

**Risco de retrabalho:** BAIXO. Mudanças são aditivas; piloto N1 não é interrompido.

**Recomendação: APROVADA.**

---

### Opção C — Manter `cv_voos` como está e guardar etapas em metadata JSON temporária

**Descrição:** Adicionar coluna `etapas_json TEXT` em `cv_voos` para armazenar as etapas do
SIGVOOS como JSON. Sem nova tabela, sem nova FK.

**Vantagens:**

- Menor impacto imediato.
- Zero migration estrutural no curto prazo.

**Desvantagens:**

- **JSON não é queryável eficientemente** — queries de FRMS por etapa serão lentas ou impossíveis.
- Sem integridade referencial — não há FK entre etapa e tripulante.
- Idempotência por etapa requer parsing de JSON em cada sync.
- Índice de chave composta por `(flight_report_id, leg_number)` não pode ser criado.
- Abordagem temporária vira permanente — dívida técnica garantida.
- Inviabiliza shadow mode real: o adaptador `cv-frms-adapter` precisaria parsear JSON por linha.

**Risco de retrabalho:** MÉDIO a ALTO (curto prazo é baixo, mas o custo do retrabalho futuro
é alto quando o importador real existir).

**Recomendação: REJEITADA.**

---

**Decisão: Opção B** — Estender com `cv_voo_etapas`, sem reconstruir o que existe.

---

## 5. Decisão sobre Nova Entidade de Etapa/Perna

### 5.1 Precisamos criar `cv_voo_etapas`?

**Sim.** A Opção B aprovada na Seção 4 requer `cv_voo_etapas` para:

- Representar explicitamente cada perna de um flight report SIGVOOS.
- Suportar idempotência por `(cv_voo_id, sigvoos_leg_number)`.
- Permitir que `cv_voo_tripulantes` referencie uma etapa específica.
- Fornecer dados granulares para o `cv-frms-adapter`.

### 5.2 Campos mínimos de `cv_voo_etapas`

```sql
CREATE TABLE cv_voo_etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,             -- FK → cv_voos.id
  numero_etapa INTEGER NOT NULL,       -- 1, 2, 3... (equivale a flight_report_leg.number)
  sigvoos_leg_number INTEGER,          -- número da etapa no SIGVOOS (para idempotência)
  -- Origem/Destino da etapa
  origem_icao TEXT,                    -- departure_location.icao_code
  destino_icao TEXT,                   -- arrival_location.icao_code
  -- Horários (strings HH:MM, timezone a confirmar)
  horario_motor_ligado TEXT,           -- engine_start_time_str
  horario_decolagem TEXT,              -- takeoff_time_str
  horario_pouso TEXT,                  -- landing_time_str
  horario_motor_desligado TEXT,        -- engine_shutoff_time_str
  -- Tempos calculados (strings HH:MM)
  tempo_navegacao TEXT,                -- navigation_time_str (horas de voo principal)
  tempo_total TEXT,                    -- total_time_str (block time)
  tempo_ifr TEXT,                      -- ifr_time_str
  tempo_noturno TEXT,                  -- night_time_str (nullable)
  tempo_decolagem_pouso TEXT,          -- takeoff_land_time_str
  -- Contadores físicos
  pousos_diurnos INTEGER,              -- day_landings
  pousos_noturnos INTEGER,             -- night_landings
  starts INTEGER,                      -- starts (acionamentos de motor)
  -- Passageiros e carga
  pax INTEGER,                         -- pax
  payload REAL,                        -- payload (unidade a confirmar)
  -- Combustível
  combustivel_inicio REAL,             -- fuel_start
  combustivel_fim REAL,                -- fuel_end
  -- Fonte e rastreabilidade
  origem_dados TEXT NOT NULL DEFAULT 'MANUAL',
  sigvoos_importado_em TEXT,
  -- Auditoria
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  -- Constraints
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id),
  CHECK (origem_dados IN ('MANUAL', 'SIGVOOS'))
);
```

### 5.3 Campos vindos do SIGVOOS

Todos os campos marcados com comentário `-- *_str` ou `-- *` acima. Origem: `flight_report_leg`.

### 5.4 Campos internos AirTrust

- `numero_etapa` — sequência interna (pode diferir de `sigvoos_leg_number` se criada manualmente).
- `origem_dados` — `MANUAL` ou `SIGVOOS`.
- `sigvoos_importado_em` — timestamp do recebimento.
- Campos de auditoria padrão.

### 5.5 Campos para fase futura

- `duty_tripulante` por etapa — só quando `/voo/pesquisa` for cruzado ou `duty` for adicionado
  ao endpoint de etapas pelo fornecedor.
- `aeronave_id` FK → `aeronaves.id` — hoje só `registration` (string).
- `status_etapa` — quando o fornecedor confirmar como representar cancelamentos por etapa.
- `etapa_hash` para idempotência de conteúdo (detectar alteração silenciosa).
- Campos de repouso em plataforma — não existem na API SIGVOOS atualmente.

---

## 6. Decisão sobre Tripulação por Etapa

### 6.1 `cv_voo_tripulantes` atual basta?

**Não para o importador SIGVOOS.** Basta para o piloto N1 manual (voo = 1 etapa implícita).

O problema: no SIGVOOS, o mesmo tripulante pode estar em etapa 1 mas não na etapa 2 de um
mesmo relatório. Sem referência à etapa em `cv_voo_tripulantes`, não é possível expressar
"João voou a etapa 1, Maria voou a etapa 2" no mesmo relatório.

### 6.2 Precisa referenciar etapa/perna?

**Sim.** A solução é adicionar `etapa_id INTEGER REFERENCES cv_voo_etapas(id)` como coluna
**opcional** (nullable) em `cv_voo_tripulantes`. Registros existentes do piloto N1 teriam
`etapa_id = NULL` (atribuição ao voo inteiro). Registros importados do SIGVOOS teriam `etapa_id`
preenchido.

### 6.3 Como representar função quando `duty` não vem no endpoint principal?

Estratégias em ordem de preferência:

| Estratégia | Prós | Contras | Recomendação |
|------------|------|---------|-------------|
| Cruzar com `/voo/pesquisa` (range=1) | Obtém `duty` real | Dobra chamadas à API; estrutura flat sem `staff.id` | Usar quando precisar de função; cruzar por `inscription` + `flight_report` |
| Deixar `funcao = NULL` e exigir preenchimento manual | Não esconde ausência | Requer ação humana | Aceitável para fase inicial do importador |
| Confirmar com SIGVOOS se `duty` virá no endpoint de etapas | Resolve definitivamente | Depende do fornecedor | Perguntar (P5) |
| Inferir por posição no voo (ex: primeiro tripulante = PIC) | Sem chamada extra | Inferência perigosa, sem base documental | PROIBIDO — nunca inferir função sem fonte |

**Decisão:** Na fase inicial do importador, deixar `funcao = NULL` quando não disponível e
registrar claramente que a função virá de cruzamento futuro com `/voo/pesquisa` ou de
preenchimento manual. Nunca inferir.

### 6.4 Como resolver tripulante sem CANAC?

O AirTrust usa hoje `staff.inscription` (matrícula) para resolver o funcionário. A matrícula é
a chave de mapeamento `sigvoos.staff.inscription` → `funcionarios.id` (AirTrust).

Se `staff.canac` não existe no endpoint de etapas (confirmação pendente P1), o mapeamento
continua por matrícula. Se um tripulante não tiver matrícula mapeada:

1. Criar pendência auditável no `cv_voo_eventos` (tipo `sistema`, com metadata).
2. Não criar `cv_voo_tripulantes` sem `funcionario_id` válido — campo NOT NULL no schema.
3. Exibir pendências em tela de administração de integração.

`staff.id` (integer SIGVOOS) deve ser extraído e armazenado como `sigvoos_staff_id` em
`cv_voo_tripulantes` para facilitar reconciliação futura sem depender de matrícula.

### 6.5 Como proteger divergências de tripulação?

Aplicar o modelo de estados da Fase 0 (`IMPORTADO_SIGVOOS`, `EDITADO_AIRTRUST`, `CONFLITO_SIGVOOS`)
também para `cv_voo_tripulantes`. Um tripulante editado manualmente (ex: função corrigida) não
deve ser sobrescrito por re-importação.

---

## 7. Decisão sobre RDV Operacional

### 7.1 RDV atual por voo ainda faz sentido?

**Sim, para voos manuais e como resumo.** Para voos importados do SIGVOOS com múltiplas etapas,
o RDV por voo pode agregar os dados de todas as etapas (horas totais, pousos totais, combustível
total). Não deve ser eliminado.

### 7.2 RDV deve ser por etapa?

**Para os dados SIGVOOS, sim.** Os dados físicos (`day_landings`, `night_landings`, `starts`,
`fuel_start`, `fuel_end`, `pax`, `payload`, horários) existem por etapa no SIGVOOS. A tabela
`cv_voo_etapas` serve como "RDV por etapa" — os campos de tempo, pousos e combustível ficam
nela.

Não criar uma tabela `cv_rdv_por_etapa` separada — os dados já estão em `cv_voo_etapas`.

### 7.3 RDV resumo + detalhes por etapa

Estrutura recomendada:

```
cv_rdv_operacional   → resumo por voo/relatório (campos agregados, status, responsável)
  ↳ cv_voo_etapas   → detalhe por etapa (horários, pousos, combustível, pax por perna)
```

Para voos manuais (1 etapa), os dados estão em `cv_rdv_operacional` ou na etapa 1.

Para voos SIGVOOS multi-etapa:
- `cv_rdv_operacional.horas_voadas` = soma de `navigation_time_str` de todas as etapas.
- `cv_rdv_operacional.numero_pousos` = soma de `day_landings + night_landings` de todas as etapas.
- `cv_rdv_operacional.ciclos` = soma de `starts` de todas as etapas.
- `cv_rdv_operacional.combustivel_decolagem` = `fuel_start` da primeira etapa.
- `cv_rdv_operacional.combustivel_pouso` = `fuel_end` da última etapa.

### 7.4 Quais campos do SIGVOOS alimentam RDV?

| Campo SIGVOOS | Campo RDV AirTrust |
|--------------|---------------------|
| `navigation_time_str` (por etapa) | `horas_voadas` (agregado) |
| `day_landings + night_landings` (por etapa) | `numero_pousos` (agregado) |
| `starts` (por etapa) | `ciclos` (agregado) |
| `fuel_start` (1ª etapa) | `combustivel_decolagem` |
| `fuel_end` (última etapa) | `combustivel_pouso` |
| `pax` (por etapa — usar maior ou primeiro) | `pob` |
| `payload` (por etapa) | `carga_kg` |
| `engine_start_time_str` (1ª etapa) | `horario_decolagem_real` (proxy) |
| `engine_shutoff_time_str` (última etapa) | `horario_pouso_real` (proxy) |

### 7.5 Quais campos são manuais internos?

- `ocorrencias` (TEXT livre)
- `divergencias` (TEXT livre)
- `status` (`rascunho | preenchimento_finalizado | cancelado`)
- `responsavel_preenchimento_id`
- `finalizado_operacionalmente_por`

### 7.6 O que não deve parecer eDB/DB oficial

O RDV operacional do Controle de Voos **não é**:

- eDB (Diário de Bordo Digital) regulado.
- Registro com assinatura, hash chain, modo fiscalização.
- Evidência fiscal ou regulatória.
- Resultado de RAS (Retorno ao Serviço).

Os campos de `finalizado_operacionalmente_por` e `finalizado_operacionalmente_em` **não são
assinatura**. São apenas metadados de preenchimento interno. O produto deve manter essa
linguagem sem ambiguidade.

---

## 8. Campos SIGVOOS que Impactam Schema

A tabela a seguir mapeia todos os campos do endpoint de etapas para o destino recomendado
no AirTrust:

| Campo SIGVOOS | Significado | Destino AirTrust | Tabela existe? | Nova coluna? | Nova tabela? | Prioridade | Observação |
|--------------|-------------|-------------------|----------------|-------------|-------------|-----------|------------|
| `flight_report.id` | ID estável do relatório | `cv_voos.sigvoos_flight_report_id` | `cv_voos` ✅ | ✅ Sim | — | **P0** | Chave de idempotência |
| `flight_report_leg.number` | Número da etapa | `cv_voo_etapas.sigvoos_leg_number` | — ❌ | — | ✅ `cv_voo_etapas` | **P0** | Chave de idempotência de etapa |
| `staff.id` | ID do tripulante no SIGVOOS | `cv_voo_tripulantes.sigvoos_staff_id` | `cv_voo_tripulantes` ✅ | ✅ Sim | — | **P0** | Para reconciliação sem matrícula |
| `staff.inscription` | Matrícula funcional | `cv_voo_tripulantes` (resolução → `funcionario_id`) | Usado como lookup ✅ | — | — | **P0** | Chave de resolução atual |
| `staff.name` | Nome completo | Lookup `funcionarios.nome` (não persistir duplicado) | Via `funcionarios` ✅ | — | — | P1 | Persistir em conflito/pendência |
| `flight_report.aircraft.registration` | Prefixo da aeronave | `cv_voos.prefixo` | `cv_voos` ✅ | — | — | **P0** | Já existe como `prefixo` |
| `flight_report.report_number` | Número do relatório (string) | `cv_voos.sigvoos_report_number` | — ❌ | ✅ Sim | — | P1 | Rastreabilidade; possivelmente = `flight_report.id` como string |
| `flight_report.flight_number` | Número de voo operacional | `cv_voos.sigvoos_flight_number` | — ❌ | ✅ Sim | — | P1 | String numérica longa |
| `flight_report.flight_type.name` | Tipo de voo (string) | Lookup `cv_tipos_voo.nome` ou novo campo `cv_voos.sigvoos_flight_type_name` | `cv_tipos_voo` ✅ | Opcional | — | P1 | Cruzar por nome; frágil se nome mudar |
| `flight_report.client.name` | Nome do cliente | `cv_voos.sigvoos_client_name` | — ❌ | ✅ Sim | — | P1 | TEXT livre; sem tabela de clientes no CV N1 |
| `flight_report.contract.name` | Nome do contrato | `cv_voos.sigvoos_contract_name` | — ❌ | ✅ Sim | — | P1 | TEXT livre; sem tabela de contratos no CV N1 |
| `flight_report_leg.departure_location.icao_code` | Origem da etapa (ICAO) | `cv_voo_etapas.origem_icao` | — ❌ (etapas) | — | ✅ `cv_voo_etapas` | **P0** | Em `cv_voos` existe `origem_id` (lookup aeroporto) |
| `flight_report_leg.arrival_location.icao_code` | Destino da etapa (ICAO) | `cv_voo_etapas.destino_icao` | — ❌ (etapas) | — | ✅ `cv_voo_etapas` | **P0** | Não extraído atualmente — lacuna crítica |
| `flight_report_leg.engine_start_time_str` | Motor ligado (HH:MM) | `cv_voo_etapas.horario_motor_ligado` | — ❌ | — | ✅ `cv_voo_etapas` | **P0** | Proxy de início de jornada para FRMS |
| `flight_report_leg.takeoff_time_str` | Decolagem (HH:MM) | `cv_voo_etapas.horario_decolagem` | — ❌ | — | ✅ `cv_voo_etapas` | **P0** | Precisão de horário de voo |
| `flight_report_leg.landing_time_str` | Pouso (HH:MM) | `cv_voo_etapas.horario_pouso` | — ❌ | — | ✅ `cv_voo_etapas` | **P0** | Precisão de horário de voo |
| `flight_report_leg.engine_shutoff_time_str` | Motor desligado (HH:MM) | `cv_voo_etapas.horario_motor_desligado` | — ❌ | — | ✅ `cv_voo_etapas` | **P0** | Proxy de fim de jornada para FRMS |
| `flight_report_leg.navigation_time_str` | Tempo de navegação | `cv_voo_etapas.tempo_navegacao` | — ❌ | — | ✅ `cv_voo_etapas` | **P0** | Horas de voo principais para FRMS |
| `flight_report_leg.total_time_str` | Block time (motor a motor) | `cv_voo_etapas.tempo_total` | — ❌ | — | ✅ `cv_voo_etapas` | **P0** | Block time completo |
| `flight_report_leg.ifr_time_str` | Tempo IFR | `cv_voo_etapas.tempo_ifr` | — ❌ | — | ✅ `cv_voo_etapas` | P1 | FRMS — pode ser null |
| `flight_report_leg.night_time_str` | Tempo noturno | `cv_voo_etapas.tempo_noturno` | — ❌ | — | ✅ `cv_voo_etapas` | P1 | FRMS — pode ser null |
| `flight_report_leg.day_landings` | Pousos diurnos | `cv_voo_etapas.pousos_diurnos` | — ❌ | — | ✅ `cv_voo_etapas` | **P0** | Manutenção/RDV |
| `flight_report_leg.night_landings` | Pousos noturnos | `cv_voo_etapas.pousos_noturnos` | — ❌ | — | ✅ `cv_voo_etapas` | **P0** | Manutenção/RDV |
| `flight_report_leg.starts` | Acionamentos de motor | `cv_voo_etapas.starts` | — ❌ | — | ✅ `cv_voo_etapas` | **P0** | Ciclos por etapa — MRO relevante |
| `flight_report_leg.pax` | Passageiros | `cv_voo_etapas.pax` | — ❌ | — | ✅ `cv_voo_etapas` | P1 | Operacional |
| `flight_report_leg.payload` | Carga | `cv_voo_etapas.payload` | — ❌ | — | ✅ `cv_voo_etapas` | P1 | Operacional; unidade a confirmar |
| `flight_report_leg.fuel_start` | Combustível no início | `cv_voo_etapas.combustivel_inicio` | — ❌ | — | ✅ `cv_voo_etapas` | P1 | RDV; unidade a confirmar |
| `flight_report_leg.fuel_end` | Combustível no fim | `cv_voo_etapas.combustivel_fim` | — ❌ | — | ✅ `cv_voo_etapas` | P1 | RDV; unidade a confirmar |

**Resumo de impacto no schema:**

- **Nova tabela necessária:** `cv_voo_etapas` (P0).
- **Novas colunas em `cv_voos`:** `sigvoos_flight_report_id`, `sigvoos_report_number`,
  `sigvoos_flight_number`, `sigvoos_client_name`, `sigvoos_contract_name`,
  `sigvoos_importado_em`, `origem_importacao`, `possui_conflito` (P0/P1).
- **Novas colunas em `cv_voo_tripulantes`:** `etapa_id` (nullable), `sigvoos_staff_id` (P0).
- **Nenhuma tabela existente precisa ser apagada ou recriada.**

---

## 9. Impacto no Importador SIGVOOS Futuro

Esta seção **desenha sem implementar** o fluxo do importador. Nenhum código existe.

### 9.1 Autenticação

```text
POST /api/get/token
  body: { username, password, system: "sigtrip" }
  response: { data: { token: "<JSON string com access_token>" } }
  → JSON.parse(response.data.token).access_token
  → armazenar como secret (SIGVOOS_API_TOKEN) via Wrangler
  → expiração em ~366 dias; re-autenticar antes de expirar
  → tratar erros: inactive_user, inexistent_user, permissionless_user, invalid_credentials
```

### 9.2 Janela máxima de 90 dias

O endpoint `/etapas/pesquisa` tem restrição de 90 dias por request. Para backfill histórico:

```text
janelas = quebrar período total em chunks de ≤ 90 dias
  ex: 365 dias = 4 calls (cada uma cobrindo ~90 dias)
  datas no formato dd/mm/yyyy
  throttle entre calls (taxa de limite desconhecida — perguntar P9)
```

Para sincronização contínua: polling diário (ex: últimos 7 dias por chamada), pois não há
`updated_at` que permita sincronização incremental real.

### 9.3 Agrupamento por `(flight_report.id, flight_report_leg.number)`

```text
registros_brutos = response.data.main  // 1 registro por (tripulante × etapa)

agrupar por flight_report.id:
  → grupo_relatório[id] = { flight_report_data, etapas: {} }

dentro de cada grupo_relatório, agrupar por flight_report_leg.number:
  → grupo_relatório[id].etapas[leg_number] = {
      leg_data: flight_report_leg,
      tripulantes: [ ...staff ]
    }

resultado: lista de flight_reports, cada um com lista de etapas, cada etapa com lista de tripulantes
```

### 9.4 Deduplicação

Antes de qualquer INSERT/UPDATE:

- Verificar se `cv_voos.sigvoos_flight_report_id = flight_report.id` já existe.
- Se sim: é uma re-importação do mesmo relatório → upsert.
- Para etapas: verificar `cv_voo_etapas WHERE cv_voo_id = ? AND sigvoos_leg_number = ?`.
- Para tripulantes: verificar `cv_voo_tripulantes WHERE etapa_id = ? AND sigvoos_staff_id = ?`.

### 9.5 Upsert

```sql
-- Voo/Flight Report
INSERT INTO cv_voos (empresa_id, sigvoos_flight_report_id, prefixo, ...)
ON CONFLICT (empresa_id, sigvoos_flight_report_id) DO UPDATE SET
  prefixo = excluded.prefixo,
  sigvoos_importado_em = datetime('now')
WHERE cv_voos.origem_importacao != 'EDITADO_AIRTRUST';  -- não sobrescrever edição manual

-- Etapa
INSERT INTO cv_voo_etapas (empresa_id, cv_voo_id, sigvoos_leg_number, ...)
ON CONFLICT (empresa_id, cv_voo_id, sigvoos_leg_number) DO UPDATE SET
  horario_motor_ligado = excluded.horario_motor_ligado,
  ...;

-- Tripulante por etapa
INSERT INTO cv_voo_tripulantes (empresa_id, voo_id, etapa_id, funcionario_id, sigvoos_staff_id, ...)
ON CONFLICT (empresa_id, etapa_id, sigvoos_staff_id) DO UPDATE SET ...;
```

### 9.6 Fluxo completo de importação (conceitual)

```text
1. AUTENTICAR → obter access_token
2. BUSCAR por janela de datas (≤90 dias) → response.data.main
3. AGRUPAR registros por (flight_report.id, flight_report_leg.number)
4. PARA CADA flight_report.id:
   a. BUSCAR cv_voos WHERE sigvoos_flight_report_id = ?
   b. SE NÃO EXISTE → INSERT cv_voos (status: 'importado_sigvoos')
   c. SE EXISTE → verificar campos protegidos (editados manualmente):
      - campo não editado → UPDATE
      - campo editado → registrar conflito em cv_conflitos_integracao
   d. PARA CADA etapa no relatório:
      - UPSERT cv_voo_etapas
      - PARA CADA tripulante na etapa:
        - RESOLVER funcionario_id via staff.inscription → funcionarios.id
        - SE NÃO MAPEADO → criar pendência em cv_voo_eventos (tipo='sistema')
        - SE MAPEADO → UPSERT cv_voo_tripulantes (etapa_id=?)
5. REGISTRAR em cv_voo_eventos (tipo='sistema', metadata: { source: 'SIGVOOS', janela, stats })
6. ATUALIZAR cv_rdv_operacional com dados agregados das etapas (se status != 'EDITADO_AIRTRUST')
7. GERAR relatório de pendências e conflitos para tela de administração
```

### 9.7 Conflitos auditáveis

Qualquer campo protegido com divergência deve gerar linha em `cv_conflitos_integracao`:

```text
{ empresa_id, entidade_tipo: 'voo'|'etapa'|'tripulante', entidade_id,
  campo, valor_airtrust, valor_sigvoos, status: 'aberto',
  staging_id (ref ao payload bruto) }
```

O usuário deve poder ver, resolver e registrar a decisão (manter AirTrust vs aceitar SIGVOOS).

---

## 10. Impacto no FRMS

### 10.1 Quais dados o FRMS consome hoje do SIGVOOS

O `syncSigvoosForFrms()` em `worker-airtrust/src/services/sigvoos-frms.ts` lê o endpoint
`/etapas/pesquisa` e normaliza os campos em `frms_jornada`:

- `hora_inicio_jornada` ← `engine_start_time_str` (proxy)
- `hora_fim_jornada` ← `engine_shutoff_time_str` (proxy)
- `horas_voo` ← `navigation_time_str`
- `tempo_noturno` ← `night_time_str`
- `tempo_ifr` ← `ifr_time_str`
- Identificador de tripulante via `staff.inscription` → CANAC

`frms_jornada.origem = 'SIGVOOS'` — fonte canônica atual.

### 10.2 Quais dados passariam a vir do Controle de Voos

Com a estrutura de etapas, o adaptador `cv-frms-adapter` leria `cv_voo_etapas` e derivaria
`frms_jornada`:

```text
frms_jornada:
  funcionario_id     ← cv_voo_tripulantes.funcionario_id (via etapa)
  data_jornada       ← cv_voo_etapas.data_operacional (derivada dos horários)
  hora_inicio_jornada ← MIN(engine_start_time_str) das etapas do dia do tripulante
  hora_fim_jornada   ← MAX(engine_shutoff_time_str) das etapas do dia do tripulante
  horas_voo          ← SUM(navigation_time_str) das etapas do dia
  tempo_noturno      ← SUM(night_time_str) das etapas do dia
  tempo_ifr          ← SUM(ifr_time_str) das etapas do dia
  origem             = 'CONTROLE_VOOS'
```

A granularidade de etapa melhora a precisão do agrupamento diário — especialmente para voos
multi-etapa e cruzamento de meia-noite.

### 10.3 Por que não pode haver duas fontes canônicas

`FRMS_CANONICAL_OPERATIONAL_SOURCE = 'SIGVOOS'` em `frms-source-policy.ts` (linha 7) define
a fonte única de verdade. Se SIGVOOS e CONTROLE_VOOS existissem simultaneamente como canônicas:

- `buildCanonicalOperationalSourceSql()` usaria apenas uma — a outra seria excluída.
- Alertas e violações gerariam resultados duplicados ou incompletos.
- Acumulados de 7d/28d/365d teriam contagem dobrada.
- Jornadas do mesmo tripulante no mesmo dia de duas fontes diferentes = bug crítico de FRMS.

A mudança de `SIGVOOS` → `CONTROLE_VOOS` deve ser atômica, controlada e precedida de shadow
mode com os 11 gates definidos na Fase 0.

### 10.4 Como o modelo com etapas melhora o shadow mode

Com `cv_voo_etapas` estruturado, o shadow mode pode comparar:

- **Antes (hoje):** jornada derivada de items agrupados por `(canac, data)` diretamente do SIGVOOS.
- **Depois (shadow):** jornada derivada de `cv_voo_etapas` agrupados por `(funcionario_id, data)`.
- **Comparação:** `hora_inicio`, `hora_fim`, `horas_voo`, `tempo_noturno`, `tempo_ifr` devem
  ser equivalentes entre as duas derivações.

A diferença entre agrupamentos pode revelar problemas de timezone, registros duplicados ou
etapas cruzando meia-noite — que não eram detectáveis com o agrupamento plano atual.

### 10.5 Quais dados ainda são proxy e não jornada regulatória real

| Dado FRMS | Proxy atual | O que deveria ser (regulatório) |
|-----------|------------|--------------------------------|
| `hora_inicio_jornada` | `engine_start_time_str` (motor ligado) | Hora real de apresentação do tripulante |
| `hora_fim_jornada` | `engine_shutoff_time_str` (motor desligado) | Hora real de dispensa/término de jornada |
| `horas_voo` | `navigation_time_str` | Horas de voo conforme Res. 400 / IS RBAC-91 |
| Repouso | Calculado por diferença entre jornadas | Repouso declarado + confirmado em plataforma |

Esses campos **permanecem proxy** mesmo com a estrutura de etapas. A estrutura melhora a
precisão do proxy, mas não substitui a captura real de jornada do tripulante.

### 10.6 Riscos que permanecem

1. `engine_start_time_str` ainda não é hora de apresentação real.
2. Timezone não confirmado — pode haver erros em voos que cruzam meia-noite.
3. CANAC pode não existir no endpoint de etapas — resolução por matrícula pode falhar.
4. Sem `updated_at` — alterações retroativas de voos aprovados podem não ser detectadas.
5. `duty` ausente no endpoint de etapas — função do tripulante para FRMS não é capturada.

---

## 11. Impacto no Piloto N1 Atual

### 11.1 O piloto N1 deve parar?

**Não.** O piloto N1 pode continuar com as ressalvas documentadas abaixo.

### 11.2 O piloto N1 pode continuar com ressalvas?

**Sim**, com as seguintes ressalvas:

1. **Voos registrados manualmente representam o "relatório" como um todo** — sem granularidade
   de etapa. Os participantes do piloto devem ser informados explicitamente.
2. **A estrutura de etapas será adicionada futuramente** — os dados do piloto precisarão de
   backfill de `etapa_id` quando `cv_voo_etapas` for criada.
3. **Os campos SIGVOOS não estão disponíveis no piloto** — os voos criados manualmente não têm
   `sigvoos_flight_report_id`. Isso é esperado.
4. **O RDV operacional continua válido como resumo** — quando a estrutura de etapas existir,
   o RDV resume os dados das etapas, não substitui.

### 11.3 A reestruturação deve acontecer antes ou depois do piloto?

**Depois do piloto.** O piloto N1 valida o fluxo operacional manual (OCC, RDV, status). A
reestruturação de schema com `cv_voo_etapas` e colunas SIGVOOS deve acontecer em uma migration
futura, após o piloto fornecer aprendizados operacionais e após as perguntas ao SIGVOOS serem
respondidas.

**Sequência recomendada:**

```text
1. Piloto N1 (em preview/staging) — dados manuais, sem SIGVOOS
2. Go/No-Go pós-piloto
3. Enviar perguntas ao fornecedor SIGVOOS (P1–P15)
4. Com respostas em mãos: desenhar migration com cv_voo_etapas + colunas rastreabilidade
5. Implementar importador SIGVOOS → cv_*
6. Shadow mode
7. Virada canônica FRMS
```

### 11.4 Comunicação necessária com os participantes do piloto

Antes de iniciar o piloto, comunicar explicitamente:

- "Os voos cadastrados aqui representam o relatório de voo completo, sem divisão por etapa."
- "Quando o importador SIGVOOS for implementado, os dados serão reorganizados com etapas."
- "Os dados deste piloto não serão perdidos — serão migrados para a nova estrutura."
- "Este piloto valida o fluxo operacional, não a integração com SIGVOOS."

---

## 12. Impacto na Preparação ANAC

### 12.1 Isso ainda não é uso regulado

A estrutura de etapas, idempotência e conflitos é uma decisão de qualidade interna de dados.
Não transforma o Controle de Voos em:

- Sistema regulado.
- eDB (Diário de Bordo Digital).
- SDRMe.
- Sistema com validade legal ou fiscal.

### 12.2 Por que modelar etapas/idempotência/conflitos ajuda maturidade futura

Quando — e se — o AirTrust avançar para conversa com a ANAC sobre eDB ou SDRMe, a existência
de:

- Granularidade de etapa com origem/destino/horários/pousos auditáveis.
- Rastreabilidade de importação com `sigvoos_flight_report_id` e chave composta.
- Controle de conflitos com resolução auditável.
- Tripulação por etapa com função (quando disponível).

... será evidência de maturidade arquitetural, sem ser o sistema regulado em si. Sistemas com
dados de baixa qualidade e granularidade plana têm mais dificuldade em demonstrar conformidade
futura.

### 12.3 O que não deve ser prometido

- Não prometer que a estrutura de etapas atende requisitos ANAC.
- Não prometer que o RDV operacional será aceito como DB Digital.
- Não prometer que `cv_voo_etapas` é equivalente ao `flight_report_leg` do SIGVOOS para fins
  de fiscalização.
- Não usar o modelo como argumento para "sistema aprovado" em conversas com clientes.

### 12.4 Conexão com eDB/SDRMe no futuro sem implementá-los agora

O caminho arquitetural futuro, sem implementar nada agora:

```text
cv_voos (N1 operacional) + cv_voo_etapas (granularidade)
  → fase futura N2: auditoria forte, export rastreável
  → fase futura N3: Records Core, hash, assinatura, addendum
  → fase futura N4: conversa com ANAC, operador parceiro, POI, aceite formal
  → eDB (Diário de Bordo Digital) como entidade separada com assinatura PIC
  → SDRMe (Reporte de Segurança em formato eletrônico)
```

`cv_voo_etapas` é um tijolo do N1 → N2, não um atalho para N4.

---

## 13. Backlog Macro Recomendado

Separado em marcos grandes, sem microtarefas:

### Marco 1 — Decisão de modelagem (este documento)

- Aprovar Opção B: `cv_voo_etapas` + colunas SIGVOOS em `cv_voos` e `cv_voo_tripulantes`.
- Comunicar ressalvas ao piloto N1.
- Definir: o piloto continua antes da migration de etapas.

### Marco 2 — Perguntas ao fornecedor SIGVOOS

- Enviar a lista formal de perguntas (P1–P15 da auditoria) por escrito ao fornecedor.
- Obter respostas sobre: CANAC (P1), permanência do `flight_report.id` (P2–P3), timezone (P4),
  `duty` no endpoint de etapas (P5), início de `leg.number` (P10), rate limits (P9).
- Sem essas respostas, qualquer migration SIGVOOS tem risco residual documentado.

### Marco 3 — Desenho da migration futura

- Com respostas do fornecedor em mãos, criar design técnico detalhado da migration.
- Definir: DDL de `cv_voo_etapas`, novas colunas em `cv_voos` e `cv_voo_tripulantes`,
  índices de idempotência, constraints.
- Definir: DDL de `cv_sigvoos_staging` (staging bruto) e `cv_conflitos_integracao`.
- Não implementar; apenas desenhar para aprovação.

### Marco 4 — Desenho do importador

- Com migration aprovada, criar design técnico do serviço `sigvoos-cv-importer.ts`.
- Definir: autenticação, janelas de 90 dias, agrupamento, upsert, conflitos, pendências.
- Definir: endpoints de administração de importação (status, pendências, conflitos).
- Não implementar; apenas desenhar para aprovação.

### Marco 5 — Implementação em ambiente controlado

- Aplicar migration em local e staging (não produção).
- Implementar importador e endpoints de administração.
- Executar importação teste com dados reais do período de backfill.
- Validar idempotência, conflitos, resolução de tripulante, dados de etapa.

### Marco 6 — Shadow mode

- Implementar `cv-frms-adapter` derivando `frms_jornada.origem='CONTROLE_VOOS'` a partir de
  `cv_voo_etapas`.
- Executar comparação paralela: fluxo antigo (SIGVOOS → FRMS) vs novo (CV → FRMS).
- Resolver divergências até cumprir os 11 gates da Fase 0.

### Marco 7 — Virada canônica FRMS

- Trocar `FRMS_CANONICAL_OPERATIONAL_SOURCE` para `'CONTROLE_VOOS'`.
- Aplicar migration para aceitar `'CONTROLE_VOOS'` em `frms_jornada.origem`.
- Executar virada atômica conforme protocolo da Fase 0.
- Manter rollback enquanto o fluxo antigo existir.

---

## 14. Riscos Principais

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|-------------|---------|-----------|
| R1 | Modelar `cv_voos` errado (como etapa em vez de relatório) | Baixa (decisão tomada: Opção B) | Alto — retrabalho total | Aprovação explícita da Opção B neste documento |
| R2 | Perder granularidade de etapa por adiamento indefinido de `cv_voo_etapas` | Média | Alto — importador sem base | Marco 3 após perguntas ao fornecedor |
| R3 | Tripulação sem função por etapa (`duty` ausente) | Alta (confirmado) | Médio — FRMS sem PIC/SIC | Enviar P5 ao fornecedor; deixar `funcao = NULL` na importação inicial |
| R4 | Resolver tripulante sem CANAC | Alta (CANAC não confirmado) | Alto — tripulante não vinculado | Resolver por `staff.inscription`; armazenar `sigvoos_staff_id`; criar pendências |
| R5 | Timezone indefinido nos horários SIGVOOS | Alta (não documentado) | Alto — jornadas erradas no FRMS | Enviar P4 ao fornecedor; validar com casos cruzando meia-noite |
| R6 | Status/cancelamento ausente no endpoint de etapas | Alta (confirmado) | Médio — voos cancelados não detectados | Confirmar com P2/P3; polling diário como mitigação parcial |
| R7 | Sem `updated_at` — alterações retroativas invisíveis | Alta (confirmado) | Médio — dados desatualizados | Polling de janela fixa; aceitar risco documentado; confirmar P11 |
| R8 | Duplicidade em backfill histórico | Média | Alto — dados dobrados no FRMS | Índice único `ON CONFLICT`; teste de idempotência antes de promover |
| R9 | Confusão com eDB | Baixa (se comunicação for clara) | Crítico — não conformidade ANAC | Banners, disclaimers, nenhum campo com nome regulatório |
| R10 | Virada FRMS cedo demais (sem shadow mode) | Baixa (gates protegem) | Crítico — alertas e acumulados errados | 11 gates + 7 dias consecutivos sem divergência |
| R11 | `flight_report.id` reutilizado após exclusão/recriação | Baixa | Alto — registros corrompidos | Confirmar P2 e P3 com fornecedor; implementar detecção de "fantasmas" |
| R12 | `cv_voo_etapas` nunca implementada — piloto N1 vira permanente sem etapas | Média | Médio — debt técnico acumula | Marco 3 com data definida após piloto e respostas do fornecedor |

---

## 15. Decisão Recomendada Final

### Veredito

**ESTENDER o modelo atual com `cv_voo_etapas` + colunas de rastreabilidade SIGVOOS.**

Não manter como está (perda de idempotência e granularidade). Não reestruturar radicalmente
(Opção A — destrói piloto N1). Não usar JSON temporário (Opção C — inviabiliza queries e FRMS).

**Condições para seguir com a migration:**

1. Piloto N1 executado ou em andamento (para coletar feedback operacional antes do schema change).
2. Respostas formais do fornecedor SIGVOOS sobre: CANAC (P1), permanência de `flight_report.id`
   (P2), timezone (P4), `duty` no endpoint de etapas (P5), início de `leg.number` (P10).
3. Aprovação explícita desta decisão de modelagem pelo responsável técnico do projeto.
4. Design técnico detalhado da migration revisado antes de qualquer `wrangler d1 execute`.

**O piloto N1 atual pode e deve continuar** — não está bloqueado por esta decisão. A migration
de etapas acontece após o piloto.

---

## 16. Próximo Prompt Recomendado

Com base no veredito (Opção B aprovada, piloto N1 continua), há três caminhos possíveis para
o próximo prompt, dependendo da decisão do responsável:

---

### Caminho A — Executar o piloto N1 antes de qualquer schema change

Use este prompt se o piloto N1 ainda não foi executado e a prioridade é validar o fluxo
operacional com usuários reais:

```text
Você está trabalhando no monorepo do AirTrust.

Objetivo:
Executar o piloto interno controlado de 5 dias do Controle de Voos N1, conforme planejado
em docs/CONTROLE_DE_VOOS_N1_PILOTO_INTERNO_CONTROLADO.md, em ambiente de preview/staging.

Importante:
- Não criar código, não criar migrations, não aplicar migrations, não fazer deploy.
- Não integrar com SIGVOOS.
- Não usar dados de produção como base para o piloto.
- O módulo é operacional interno, não regulado, não autorizado pela ANAC.
- Comunicar às partes do piloto que os voos registrados representam o relatório como um todo,
  sem granularidade de etapa (conforme docs/CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md).

Referências obrigatórias:
- docs/CONTROLE_DE_VOOS_N1_PILOTO_INTERNO_CONTROLADO.md
- docs/CONTROLE_DE_VOOS_N1_PILOTO_EXECUCAO_CHECKLIST.md
- docs/CONTROLE_DE_VOOS_N1_DECISAO_AMBIENTE_PILOTO_E_EVIDENCIAS.md
- docs/CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md

Tarefa:
Criar um checklist de pré-piloto com status atualizado, identificar os bloqueadores de
governança pendentes (banners, marcadores de tela demonstrativa) e propor a comunicação
inicial aos participantes do piloto sobre as ressalvas do modelo de dados atual.

Entrega:
- Status de cada item do checklist pré-piloto.
- Bloqueadores de governança a resolver antes do piloto.
- Rascunho de comunicação aos participantes.
- Próximos passos para iniciar o Dia 0 do piloto.
```

---

### Caminho B — Elaborar dossiê de perguntas ao fornecedor SIGVOOS

Use este prompt se a prioridade é desbloquear as incertezas da API antes da migration:

```text
Você está trabalhando no monorepo do AirTrust.

Objetivo:
Criar um dossiê formal de perguntas técnicas ao fornecedor SIGVOOS, com base nas lacunas
identificadas na auditoria autenticada da API e nas perguntas pendentes documentadas.

Importante:
- Não criar código, não criar migrations, não aplicar migrations, não fazer deploy.
- Apenas criar documentação técnica para envio ao fornecedor.

Referências obrigatórias:
- docs/AUDITORIA_API_SIGVOOS_AUTENTICADA.md (seção 16 — perguntas P1–P15)
- docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md (seção 3 — perguntas 1–24)
- docs/CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md (seções 5, 6, 10 — riscos)
- docs/vendor/sigvoos/API_SIGVOOS_ENDPOINTS_AUDIT.md

Tarefa:
Criar docs/DOSSIE_PERGUNTAS_FORNECEDOR_SIGVOOS.md com:
1. Lista priorizada de perguntas (urgentes / importantes / complementares).
2. Contexto de negócio para cada pergunta (por que precisa saber).
3. Impacto no projeto se a resposta for negativa (ex: CANAC não existe).
4. Formato de resposta esperada (ex: "precisamos de amostra antes/depois de cancelamento").
5. Proposta de SLA para resposta (urgente = 5 dias úteis, importante = 10 dias úteis).

Entrega:
- Documento dossiê de perguntas criado em docs/DOSSIE_PERGUNTAS_FORNECEDOR_SIGVOOS.md.
- Resumo de bloqueadores críticos vs. riscos aceitáveis.
- Sugestão de próximo marco após respostas do fornecedor.
```

---

### Caminho C — Design técnico da migration futura (sem implementar)

Use este prompt se as respostas do fornecedor já foram obtidas e a decisão de modelagem
(Opção B) foi aprovada:

```text
Você está trabalhando no monorepo do AirTrust.

Objetivo:
Criar o design técnico detalhado da migration futura que implementa a Opção B da decisão
de reestruturação: cv_voo_etapas + colunas de rastreabilidade SIGVOOS em cv_voos e
cv_voo_tripulantes. Sem implementar, sem criar migration, sem aplicar nada.

Importante:
- Não criar migration. Não aplicar migration. Não fazer deploy.
- Apenas criar documentação técnica do design.
- O módulo continua operacional interno, não regulado, não autorizado pela ANAC.
- Preservar 100% de compatibilidade com o schema 0410 existente.

Referências obrigatórias:
- docs/CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md (decisão central e campos)
- worker-airtrust/migrations/0410_controle_voos_n1_schema.sql (schema existente)
- docs/AUDITORIA_API_SIGVOOS_AUTENTICADA.md (campos confirmados)
- docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md (staging, conflitos)
- CLAUDE.md (convenções de migration)

Tarefa:
Criar docs/CONTROLE_DE_VOOS_N1_MIGRATION_DESIGN_ETAPAS.md com:
1. DDL conceitual completo de cv_voo_etapas com todos os campos, índices e constraints.
2. DDL conceitual das novas colunas em cv_voos (sigvoos_flight_report_id, etc.).
3. DDL conceitual das novas colunas em cv_voo_tripulantes (etapa_id, sigvoos_staff_id).
4. DDL conceitual de cv_sigvoos_staging.
5. DDL conceitual de cv_conflitos_integracao.
6. Análise de compatibilidade com schema 0410 (nada é apagado, tudo é aditivo).
7. Índices únicos para idempotência SIGVOOS.
8. Estratégia de backfill para registros existentes do piloto N1.
9. Número de migration recomendado (0411?).
10. Checklist de gates antes de autorizar a migration.

Entrega:
- Documento de design criado.
- DDL conceitual revisado.
- Lista de gates para autorização da migration.
- Próximo prompt recomendado (implementação).
```

---

## Referências

- [`docs/AUDITORIA_API_SIGVOOS_AUTENTICADA.md`](docs/AUDITORIA_API_SIGVOOS_AUTENTICADA.md) — auditoria autenticada da API SIGVOOS
- [`docs/vendor/sigvoos/API_SIGVOOS_ENDPOINTS_AUDIT.md`](docs/vendor/sigvoos/API_SIGVOOS_ENDPOINTS_AUDIT.md) — endpoints SIGVOOS
- [`docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`](docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md) — decisões da Fase 0
- [`docs/CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md`](docs/CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md) — design do backend N1
- [`docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md`](docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md) — especificação do MVP
- [`docs/AIRTRUST_STATUS_CONTROLE_VOOS_SIGVOOS_FRMS_ANAC.md`](docs/AIRTRUST_STATUS_CONTROLE_VOOS_SIGVOOS_FRMS_ANAC.md) — status consolidado
- [`worker-airtrust/migrations/0410_controle_voos_n1_schema.sql`](worker-airtrust/migrations/0410_controle_voos_n1_schema.sql) — schema atual
- [`worker-airtrust/src/lib/frms/frms-source-policy.ts`](worker-airtrust/src/lib/frms/frms-source-policy.ts) — política de fonte canônica FRMS

---

*Documento criado por: Claude Code*
*Data: 2026-06-14*
*Nenhum código, migration, deploy ou commit foi realizado como parte deste documento.*
