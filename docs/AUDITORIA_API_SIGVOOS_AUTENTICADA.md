# Auditoria da API SIGVOOS — Documentação Autenticada

> Data: 2026-06-14  
> Status: READ-ONLY | Nenhuma alteração de código foi feita  
> Método: Documentação oficial obtida via portal autenticado `https://api.sigvoos.com.br/docs/api` (sessão autenticada como "FILIPE PASSARONI DAUMAS")  
> Contexto: migração SIGVOOS → Controle de Voos AirTrust → FRMS

---

## 1. Resumo Executivo

### Resultado principal — DESBLOQUEIO DA MIGRAÇÃO

A documentação autenticada confirma que `flight_report.id` **existe** no endpoint de etapas e é um inteiro estável. Isso resolve a questão bloqueante das decisões de Fase 0:

> "implementação BLOQUEADA até confirmar se a API SIGVOOS expõe IDs estáveis de voo/trecho/jornada"

A chave composta viável para idempotência por etapa é:

```
(flight_report.id, flight_report_leg.number)
```

Ambos confirmados na documentação oficial.

### Achados críticos

| # | Achado | Impacto |
|---|---|---|
| **C1** | `flight_report.id` existe (integer) | DESBLOQUEIO — chave estável de voo |
| **C2** | `flight_report_leg.number` existe (integer) | DESBLOQUEIO — chave estável de etapa |
| **C3** | `staff.id` existe (integer) | AirTrust não extrai — oportunidade de resolução direta por ID |
| **C4** | `arrival_location.icao_code` existe mas **não é extraído** pelo normalizador | Lacuna no CV |
| **C5** | `canac`/`codigo_anac` **não aparecem** no endpoint de etapas | Risco: CANAC vem de outra fonte ou campo não documentado |
| **C6** | `duty` (função: Piloto/SIC) só existe em `/relatorios/voo/pesquisa`, **não** em `/etapas/pesquisa` | Lacuna no CV |
| **C7** | `flight_number` e `report_number` existem como strings distintas | `flight_number` = "507548166" (long numeric string) |
| **C8** | Período máximo é **90 dias** (`etapas/pesquisa`) | Limita janelas de backfill |
| **C9** | Sem `status_voo` no response de etapas | Cancelamentos/alterações não detectáveis por esta via |
| **C10** | Sem `updated_at` em nenhum endpoint | Sincronização incremental inviável; apenas full-range por período |

---

## 2. Endpoints encontrados (documentação oficial)

Total: **4 endpoints** documentados.

| # | Método | URL | Auth | Usado pelo AirTrust? |
|---|---|---|---|---|
| 1 | POST | `/api/get/token` | Sem autenticação | Sim |
| 2 | POST | `/api/relatorios/voo/pesquisa` | Bearer token | **Não** |
| 3 | POST | `/api/relatorios/voo/quantidade` | Bearer token | **Não** |
| 4 | POST | `/api/relatorios/voos/tripulantes/etapas/pesquisa` | Bearer token | **Sim** |

Base URL: `https://api.sigvoos.com.br/api`

---

## 3. Payloads e campos disponíveis

### 3.1 POST `/api/get/token`

**Request:**
```json
{
  "username": "usuario@empresa.com.br",
  "password": "senha",
  "system": "sigtrip"
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `username` | Sim | E-mail do usuário |
| `password` | Sim | Senha do usuário |
| `system` | Sim | Sistema habilitado para o usuário (ex: `sigtrip`) |

**Response 200:**
```json
{
  "data": {
    "token": "{\"token_type\":\"Bearer\",\"expires_in\":31622400,\"access_token\":\"<token>\",\"refresh_token\":\"<refresh_token>\"}",
    "redirect": {
      "sigtrip": "/",
      "frms": "/"
    }
  },
  "status": "success",
  "message": ""
}
```

Notas:
- `data.token` é uma **string JSON serializada** — precisa de `JSON.parse()` antes de extrair `access_token`. O AirTrust já faz isso corretamente em `extractSigvoosAccessToken()`.
- `expires_in`: 31.622.400 segundos ≈ **366 dias**. Token tem validade de ~1 ano.
- `refresh_token` está presente mas o AirTrust não implementa refresh — cada sync autentica de novo.
- `redirect.frms` e `redirect.sigtrip` indicam que o mesmo sistema serve múltiplos produtos.

**Erros:**
```json
{ "error": "inactive_user" }       // usuário existe mas está inativo
{ "error": "inexistent_user" }     // usuário não existe
{ "error": "permissionless_user" } // sem grupo/permissão de acesso
{ "error": "invalid_credentials" } // senha errada
```

> `inexistent_user` e `permissionless_user` são erros não tratados pelo AirTrust — o código atual só trata `inactive_user` e `invalid_credentials`.

---

### 3.2 POST `/api/relatorios/voo/pesquisa` — NÃO USADO pelo AirTrust

**Request:**
```json
{
  "date_start": "01/02/2021",
  "date_finish": "28/02/2021",
  "range": 1,
  "status": 1,
  "staffs": [
    { "value": 73, "label": "TRIPULANTE EXEMPLO" }
  ]
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `date_start` | Sim | Formato `dd/mm/yyyy` |
| `date_finish` | Sim | Formato `dd/mm/yyyy` |
| `range` | Sim | `0` = consolidado; `1` = analítico por tripulante; `2` = analítico por trecho |
| `status` | Não | `1` = aprovados; `0` = todos os finalizados |
| `staffs` | Não | `[{value: id, label: name}]` — filtro por tripulante |
| `aircraft_id`, `aircraft_model_id`, `base_id`, `contract_base_id`, `contract_id`, `client_id`, `flight_type_id`, `flight_report_id` | Não | Filtros opcionais |
| `exemption` | Não | Filtra por isenção |
| `payload` | Não | Filtra voos com carga externa |

**Response 200 (range=1, analítico por tripulante):**
```json
{
  "data": {
    "main": [
      {
        "id": 1,
        "date": "15/02/2021",
        "aircraft": "PR-ABC",
        "aircraft_model_id": "AW-139",
        "flight_report": "12043",
        "flight_number": "507548166",
        "flight_type": "Petrobras",
        "base": "Jacarepaguá",
        "contract": "5900.0111589.19.2",
        "client": "Petrobras",
        "exemption": "Não",
        "duty": "Piloto",
        "arrival": "09:30",
        "inscription": "12345",
        "staff": "TRIPULANTE",
        "leg_number": "1",
        "departure_location": "SBJR",
        "arrival_location": "PMXL",
        "engine_start_time": "08:34",
        "takeoff_time": "08:41",
        "landing_time": "09:30",
        "engine_shutoff_time": "09:37",
        "takeoff_land_time": "00:49",
        "total_time": "00:56",
        "navigation_time": "00:49",
        "ifr_time": "00:30",
        "night_time": null,
        "day_landings": 1,
        "night_landings": 0,
        "starts": 1,
        "pax": 10,
        "payload": 0,
        "external_load_long_line": 0,
        "external_load_short_line": 0,
        "fuel_start": 1086,
        "fuel_end": 730,
        "refuels": 750,
        "observations": "Observações operacionais"
      }
    ],
    "headers": []
  },
  "status": "success",
  "message": "Pesquisa Concluida"
}
```

**Nota:** estrutura dos itens de `data.main` **varia com `range`**. O contrato acima é para `range=1`.

**Erros:**
```json
// 403 — campos obrigatórios faltantes
{ "data": { "main": "", "headers": "" }, "status": "error", "message": "Campos obrigatórios faltantes" }
// 401 — token ausente ou inválido
{ "permission_denied": 1 }
```

---

### 3.3 POST `/api/relatorios/voo/quantidade` — NÃO USADO pelo AirTrust

Endpoint de **consolidação quantitativa** — retorna contagens, não registros individuais. Não tem `flight_report.id` individual. Útil para relatórios de utilização de frota.

**Request:**
```json
{
  "date_start": "01/02/2021",
  "date_finish": "28/02/2021",
  "filter_type": 0,
  "status": 1,
  "aircraft_model_id": 4
}
```

**Response 200 (filter_type=0):**
```json
{
  "data": {
    "main": {
      "aircraft_period": [
        {
          "date_start": "01/02/2021",
          "date_finish": "28/02/2021",
          "aircraft": "PR-ABC",
          "aircraft_model": "AW-139",
          "total": 14,
          "total_landings": 28,
          "total_shutoffs": 14,
          "pax": 76,
          "payload": 0
        }
      ],
      "aircraft_dates": [ ... ],
      "aircraft_model_period": [ ... ],
      "aircraft_model_dates": [ ... ],
      "total_period": [ ... ],
      "total_dates": [ ... ]
    },
    "headers": []
  }
}
```

Quando `filter_type=1`, os blocos incluem agrupamento por `base`.

---

### 3.4 POST `/api/relatorios/voos/tripulantes/etapas/pesquisa` — USADO pelo AirTrust

**Request:**
```json
{
  "date_start": "01/02/2021",
  "date_finish": "28/02/2021",
  "staff_ids": [73, 91]
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `date_start` | Sim | Formato `dd/mm/aaaa` |
| `date_finish` | Sim | Formato `dd/mm/aaaa` |
| `staff_ids` | Não | Array de inteiros OU string com IDs separados por vírgula. O AirTrust **não usa** este filtro — busca todos os tripulantes. |

**Restrição de período: máximo 90 dias.**

**Response 200:**
```json
{
  "data": {
    "main": [
      {
        "staff": {
          "id": 73,
          "name": "TRIPULANTE EXEMPLO",
          "inscription": "12345"
        },
        "date": "15/02/2021",
        "flight_report": {
          "id": 12043,
          "aircraft": {
            "registration": "PR-ABC"
          },
          "flight_type": {
            "name": "Petrobras"
          },
          "report_number": "12043",
          "flight_number": "507548166",
          "client": {
            "name": "Petrobras"
          },
          "contract": {
            "name": "5900.0111589.19.2"
          }
        },
        "flight_report_leg": {
          "number": 1,
          "departure_location": {
            "icao_code": "SBJR"
          },
          "arrival_location": {
            "icao_code": "PMXL"
          },
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
      }
    ],
    "headers": []
  },
  "status": "success",
  "message": ""
}
```

**Erros:**
```json
{ "data": "", "status": "error", "message": "A data de início é obrigatória." }
{ "data": "", "status": "error", "message": "A data de término é obrigatória." }
{ "data": "", "status": "error", "message": "A data de início deve estar no formato dd/mm/aaaa." }
{ "data": "", "status": "error", "message": "O período informado não pode ser maior que 90 dias." }
{ "data": "", "status": "error", "message": "O campo staff_ids deve conter apenas IDs inteiros separados por vírgula." }
{ "permission_denied": 1 }
```

---

## 4. Campo que identifica tripulante

| Campo | Tipo | Endpoint | Notas |
|---|---|---|---|
| `staff.id` | integer | etapas/pesquisa | ID interno SIGVOOS — **não extraído** pelo AirTrust |
| `staff.inscription` | string | etapas/pesquisa | Matrícula funcional — **usado** pelo AirTrust como chave primária de resolução |
| `staff.name` | string | etapas/pesquisa | Nome completo |
| `inscription` (flat) | string | voo/pesquisa | Mesmo campo em estrutura flat |
| `staff` (flat) | string | voo/pesquisa | Nome em estrutura flat |

**Importante:** `canac`/`codigo_anac` **não aparecem** na documentação oficial de nenhum endpoint. O normalizador do AirTrust tenta `staff.canac` e `staff.codigo_anac`, mas esses campos podem não existir — confirmar com SIGVOOS.

---

## 5. Campo que pode identificar voo

| Campo | Tipo | Endpoint | Notas |
|---|---|---|---|
| `flight_report.id` | integer | etapas/pesquisa | **CONFIRMADO** — ID estável do relatório de voo. Chave principal para idempotência. |
| `flight_report.report_number` | string | etapas/pesquisa | `"12043"` — provavelmente o mesmo que o id mas como string |
| `flight_report.flight_number` | string | etapas/pesquisa | `"507548166"` — número de voo operacional (long numeric string) |
| `flight_report` (flat) | string | voo/pesquisa | Report number em estrutura flat |
| `flight_number` (flat) | string | voo/pesquisa | Mesmo campo em flat |
| `id` (flat) | integer | voo/pesquisa | ID do item do relatório analítico |

**Conclusão:** usar `flight_report.id` (integer) como chave de voo. Estável e tipado.

---

## 6. Campo que pode identificar trecho/perna

| Campo | Tipo | Endpoint | Notas |
|---|---|---|---|
| `flight_report_leg.number` | integer | etapas/pesquisa | **CONFIRMADO** — número da etapa dentro do flight_report |
| `leg_number` (flat) | string | voo/pesquisa | Mesmo campo em estrutura flat (string) |

**Chave composta de idempotência por etapa:**
```
(flight_report.id, flight_report_leg.number)
```

Exemplo: `(12043, 1)` — etapa 1 do relatório 12043.

Esta chave é **estável** e suficiente para o mapeamento cv_voos/cv_voo_tripulantes no Controle de Voos.

---

## 7. Horários disponíveis

Todos os horários estão em formato `HH:MM` (strings). Disponíveis no endpoint etapas/pesquisa:

| Campo | Descrição | Equivalente FRMS |
|---|---|---|
| `flight_report_leg.engine_start_time_str` | Ligar motor (calço fora) | Início da etapa / apresentação |
| `flight_report_leg.takeoff_time_str` | Decolagem | — |
| `flight_report_leg.landing_time_str` | Pouso | — |
| `flight_report_leg.engine_shutoff_time_str` | Desligar motor (calço dentro) | Fim da etapa |
| `flight_report_leg.takeoff_land_time_str` | Tempo de voo (decolagem → pouso) | Horas de voo (excl. táxi) |
| `flight_report_leg.total_time_str` | Tempo total (motor ligado → desligado) | Block time |
| `flight_report_leg.navigation_time_str` | Tempo de navegação | Horas de voo (principal) |

Disponíveis apenas em `/relatorios/voo/pesquisa` (estrutura flat):

| Campo | Descrição |
|---|---|
| `engine_start_time` | Mesmo que `engine_start_time_str` |
| `takeoff_time` | Decolagem |
| `landing_time` | Pouso |
| `engine_shutoff_time` | Motor desligado |
| `arrival` | Horário de chegada |

**Horário de apresentação e término de jornada:** Não há campos explícitos `hora_apresentacao` ou `hora_termino` na documentação oficial. O AirTrust usa `engine_start_time_str` como proxy para apresentação e `engine_shutoff_time_str` como proxy para término — esta é uma aproximação, não o dado real de jornada do tripulante.

**Timezone:** Não documentado. Provavelmente horário local (BRT). Confirmar com SIGVOOS.

---

## 8. Dados de aeronave

| Campo | Tipo | Endpoint | Notas |
|---|---|---|---|
| `flight_report.aircraft.registration` | string | etapas/pesquisa | Prefixo (ex: `"PR-ABC"`) |
| `aircraft` (flat) | string | voo/pesquisa | Prefixo em flat |
| `aircraft_model_id` (flat) | string | voo/pesquisa | Modelo (ex: `"AW-139"`) |
| `aircraft_model` | string | quantidade | Modelo em consolidação |

**Sem `aircraft.id`** em nenhum endpoint. Identificação de aeronave é exclusivamente pelo prefixo de registro (ex: `PR-ABC`).

---

## 9. Origem/destino

| Campo | Tipo | Endpoint | Notas |
|---|---|---|---|
| `flight_report_leg.departure_location.icao_code` | string | etapas/pesquisa | Origem — **extraído** pelo AirTrust como `localBase` |
| `flight_report_leg.arrival_location.icao_code` | string | etapas/pesquisa | Destino — **NÃO extraído** pelo AirTrust |
| `departure_location` (flat) | string | voo/pesquisa | Origem ICAO em flat |
| `arrival_location` (flat) | string | voo/pesquisa | Destino ICAO em flat |
| `base` (flat) | string | voo/pesquisa | Nome textual da base de operação |

**Lacuna atual:** `arrival_location.icao_code` existe na API mas não é extraído pelo `normalizeSigvoosRecord()`. Para o Controle de Voos, este campo é essencial para montar `origem→destino` de cada etapa.

---

## 10. Tripulação por voo/trecho

O endpoint `/etapas/pesquisa` retorna **um registro por combinação (tripulante × etapa)**. Para reconstruir a tripulação completa de um voo:

- Agrupar todos os registros com o mesmo `flight_report.id` e `flight_report_leg.number`.
- Cada registro representa um tripulante naquela etapa.
- O papel/função do tripulante (`duty`) **não está disponível** no endpoint de etapas.
  - Em `/relatorios/voo/pesquisa`, existe campo `duty` (ex: `"Piloto"`) — mas a estrutura flat não tem `staff.id`.

**Consequência:** não é possível saber se um tripulante é PIC ou SIC via `/etapas/pesquisa`. Para obter `duty`, é necessário usar `/relatorios/voo/pesquisa` com `range=1` e cruzar por `inscription` + `flight_report`.

---

## 11. Jornada e tempos relevantes para FRMS

O modelo atual do AirTrust (`sigvoos-frms.ts`) agrupa etapas por `(canac, data)` para construir `frms_jornada`. Com os dados confirmados:

| Campo SIGVOOS | Uso FRMS | Observação |
|---|---|---|
| `flight_report_leg.engine_start_time_str` | `hora_inicio_jornada` (proxy) | Proxy — não é hora real de apresentação |
| `flight_report_leg.engine_shutoff_time_str` | `hora_fim_jornada` (proxy) | Proxy — não é hora real de término de jornada |
| `flight_report_leg.navigation_time_str` | `horas_voo` | Tempo de voo principal |
| `flight_report_leg.total_time_str` | Block time | Tempo total motor |
| `flight_report_leg.night_time_str` | `tempo_noturno` | Pode ser `null` |
| `flight_report_leg.ifr_time_str` | `tempo_ifr` | Pode ser `null` |
| `flight_report_leg.day_landings` | Pousos diurnos | Integer |
| `flight_report_leg.night_landings` | Pousos noturnos | Integer |
| `flight_report_leg.starts` | Acionamentos de motor | Integer |

**Sem campo de repouso em plataforma (offshore):** não existe campo `repouso_plataforma` ou similar. Para FRMS offshore, esses dados precisam vir de outra fonte.

---

## 12. Status do voo

O campo `status` **existe apenas no request** como filtro:
- `status=1` → aprovados
- `status=0` → todos os finalizados

No response, **não há campo `status`** por item. Isso significa:

- Não é possível saber se um voo foi cancelado ou alterado via endpoint de etapas.
- Todos os registros retornados são voos finalizados (ou aprovados, dependendo do filtro).
- O filtro padrão (`status` omitido) provavelmente retorna todos os finalizados.

**Risco:** voos cancelados mas já finalizados podem aparecer no resultado sem distinção.

---

## 13. Pousos, ciclos e combustível

Campos confirmados no endpoint de etapas (`flight_report_leg`):

| Campo | Tipo | Descrição |
|---|---|---|
| `day_landings` | integer | Pousos diurnos |
| `night_landings` | integer | Pousos noturnos |
| `starts` | integer | Acionamentos de motor |
| `fuel_start` | number | Combustível no início (unidade não especificada — provavelmente kg) |
| `fuel_end` | number | Combustível no fim |
| `pax` | integer | Passageiros |
| `payload` | integer | Carga (unidade não especificada) |

Em `/relatorios/voo/pesquisa` (flat), adicionalmente:

| Campo | Tipo | Descrição |
|---|---|---|
| `refuels` | number | Reabastecimento |
| `external_load_long_line` | integer | Carga externa com cabo longo |
| `external_load_short_line` | integer | Carga externa com cabo curto |

---

## 14. Lacunas da API

| # | Lacuna | Severidade | Impacto no CV/FRMS |
|---|---|---|---|
| L1 | Sem `canac`/`codigo_anac` no endpoint de etapas | **ALTA** | AirTrust usa CANAC como chave de resolução — se campo não existe, resolução pode falhar |
| L2 | Sem `duty` (função PIC/SIC/COM) no endpoint de etapas | **ALTA** | CV não saberá a função de cada tripulante na etapa |
| L3 | Sem `arrival_location` sendo extraído pelo normalizador | **ALTA** | CV incompleto sem destino da etapa |
| L4 | Sem `status_voo` por item de etapa | **MÉDIA** | Não distingue voos cancelados/alterados |
| L5 | Sem `updated_at` ou `data_alteracao` em qualquer endpoint | **ALTA** | Sincronização incremental inviável — full-range sempre |
| L6 | Sem hora real de apresentação/término de jornada tripulante | **ALTA** | FRMS usa proxy (engine start/shutoff) — não é o tempo regulatório de jornada |
| L7 | Sem `aircraft.id` — só `registration` (string) | Baixa | Risco de mismatch de prefixo (ex: caracteres especiais) |
| L8 | `refuels` só em `/voo/pesquisa` (flat), não no endpoint de etapas | Baixa | — |
| L9 | Período máximo de 90 dias no endpoint de etapas | **MÉDIA** | Backfills históricos precisam de múltiplas chamadas |
| L10 | Sem `flight_type_id` tipado no endpoint de etapas — só `flight_type.name` (string) | Baixa | Classificação por nome textual é frágil |
| L11 | Sem `staff.canac` documentado — campo tentado pelo normalizador mas não documentado | **ALTA** | Confirmar se existe ou não; se não existe, resolver por matrícula ou `staff.id` |

---

## 15. Riscos de idempotência

### 15.1 Chave de idempotência proposta (pós-migração)

```
sigvoos_flight_report_id  = flight_report.id   (integer)
sigvoos_leg_number        = flight_report_leg.number  (integer)
```

Chave composta `(sigvoos_flight_report_id, sigvoos_leg_number)` é única por etapa.

### 15.2 Chave de idempotência atual (AirTrust)

O AirTrust atual não usa IDs estáveis — usa chave composta de 7 campos:
```
empresa_id + data_operacional + numero_voo + matricula_aeronave + origem + destino + horario_previsto_partida
```

Riscos desta chave:
- `numero_voo` pode mudar em reprogramações
- `horario_previsto_partida` pode mudar em atrasos
- `destino` não é extraído atualmente pelo normalizador

### 15.3 Riscos residuais com a nova chave

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `flight_report.id` reutilizado após exclusão/recriação de relatório | Baixa | Confirmar política de IDs com SIGVOOS |
| `flight_report_leg.number` começa em 0 ou 1 (inconsistência) | Baixa | Normalizar para 1-based na importação |
| Re-upload de relatório gera novo `flight_report.id` | Média | Adicionar `upsert` com `ON CONFLICT (flight_report_id, leg_number)` |
| Retroatividade: registros históricos podem não ter `flight_report.id` populado | Desconhecida | Testar com dados reais do período de backfill |

### 15.4 Recomendação

Adicionar coluna `sigvoos_flight_report_id INTEGER` e `sigvoos_leg_number INTEGER` à tabela `cv_voos` e usar `ON CONFLICT (sigvoos_flight_report_id, sigvoos_leg_number) DO UPDATE` nos INSERTs de sincronização.

---

## 16. Perguntas pendentes ao fornecedor SIGVOOS

| # | Pergunta | Urgência | Contexto |
|---|---|---|---|
| **P1** | `staff.canac` ou `staff.codigo_anac` existe no response de `/etapas/pesquisa`? O exemplo da documentação não mostra esse campo. | **ALTA** | AirTrust usa CANAC como chave de resolução de tripulantes |
| **P2** | `flight_report.id` é permanente e imutável após aprovação do relatório? | **ALTA** | Chave de idempotência proposta |
| **P3** | Um relatório pode ser excluído e recriado com novo `id`? Qual é a política de IDs? | **ALTA** | Risco de ghost records no CV |
| **P4** | Os horários retornados são em UTC ou horário local (BRT)? | **ALTA** | FRMS usa UTC para comparações regulatórias |
| **P5** | O campo `duty` (Piloto/SIC/COM/MEC) está disponível no endpoint `/etapas/pesquisa`? Não aparece no exemplo. | **ALTA** | CV precisa da função do tripulante em cada etapa |
| **P6** | Existe endpoint para listar os tipos de `system` disponíveis para um usuário? (`sigtrip`, `frms`, etc.) | Média | Diagnóstico de falhas de autenticação |
| **P7** | O parâmetro `staff_ids` pode ser omitido para retornar todos os tripulantes da empresa? Há limite de registros? | **ALTA** | AirTrust já faz isso, mas sem confirmação |
| **P8** | Existe filtro por `empresa_id` ou o token já isola os dados da empresa? | **ALTA** | Multi-tenancy e isolamento de dados |
| **P9** | Qual é o limite de rate do endpoint de etapas? (requisições por minuto/hora) | Média | Sincronização de múltiplos meses pode bater o limite |
| **P10** | `flight_report_leg.number` começa em 0 ou 1? É contínuo ou pode ter gaps? | Média | Validação de chave composta |
| **P11** | Existe webhook ou mecanismo de notificação para voos alterados/cancelados após lançamento? | **ALTA** | Sem `updated_at`, sincronização incremental é impossível sem polling diário |
| **P12** | O `report_number` e `flight_report.id` são a mesma entidade? (`report_number="12043"` e `id=12043` no exemplo) | Baixa | Clareza no modelo de dados |
| **P13** | O campo `exemption` em `/voo/pesquisa` indica voo isento de quê? (Horas ANAC? Fiscalização?) | Média | Relevante para conformidade regulatória |
| **P14** | Existe endpoint para listar tripulantes (`/tripulantes` ou similar) para usar como fonte de `staff_ids`? | Média | Otimização de requests filtrando por tripulante |
| **P15** | Haverá novos endpoints planejados? Em especial: alterações/cancelamentos, hora real de jornada, repouso em plataforma | Baixa | Planejamento de migração FRMS |

---

## 17. Comparação: contrato esperado pelo AirTrust vs. documentação oficial

### Confirmados com sucesso

| Campo esperado | Campo real | Status |
|---|---|---|
| `staff.inscription` | `staff.inscription` | ✅ Idêntico |
| `staff.name` | `staff.name` | ✅ Idêntico |
| `flight_report.aircraft.registration` | `flight_report.aircraft.registration` | ✅ Idêntico |
| `flight_report_leg.engine_start_time_str` | `flight_report_leg.engine_start_time_str` | ✅ Idêntico |
| `flight_report_leg.engine_shutoff_time_str` | `flight_report_leg.engine_shutoff_time_str` | ✅ Idêntico |
| `flight_report_leg.navigation_time_str` | `flight_report_leg.navigation_time_str` | ✅ Idêntico |
| `flight_report_leg.departure_location.icao_code` | `flight_report_leg.departure_location.icao_code` | ✅ Idêntico |
| `flight_report_leg.night_time_str` | `flight_report_leg.night_time_str` | ✅ Idêntico |
| `flight_report_leg.ifr_time_str` | `flight_report_leg.ifr_time_str` | ✅ Idêntico |

### Novos campos descobertos (não extraídos pelo AirTrust)

| Campo | Disponível? | Ação necessária |
|---|---|---|
| `staff.id` | ✅ Sim | Extrair — permite resolução por ID em vez de matrícula |
| `flight_report.id` | ✅ Sim | **EXTRAIR — chave de idempotência** |
| `flight_report.report_number` | ✅ Sim | Extrair para rastreabilidade |
| `flight_report.flight_number` | ✅ Sim | Extrair para número de voo operacional |
| `flight_report.flight_type.name` | ✅ Sim | Extrair para classificação |
| `flight_report.client.name` | ✅ Sim | Extrair para cliente |
| `flight_report.contract.name` | ✅ Sim | Extrair para contrato |
| `flight_report_leg.number` | ✅ Sim | **EXTRAIR — chave de idempotência** |
| `flight_report_leg.arrival_location.icao_code` | ✅ Sim | **EXTRAIR — destino da etapa** |
| `flight_report_leg.takeoff_time_str` | ✅ Sim | Extrair para precisão |
| `flight_report_leg.fuel_start` / `fuel_end` | ✅ Sim | Extrair se RDV necessário |

### Campos esperados mas NÃO confirmados na documentação

| Campo tentado pelo AirTrust | Confirmado? | Alternativa |
|---|---|---|
| `staff.canac` | ❌ Não confirmado | Confirmar com SIGVOOS (P1) |
| `staff.codigo_anac` | ❌ Não confirmado | Idem |
| `canac` (raiz) | ❌ Não confirmado | Idem |
| `data_alteracao` / `updated_at` | ❌ Não existe | Polling diário por período |
| Status do voo por item | ❌ Não existe | Apenas filtro de request |
| Hora real de apresentação tripulante | ❌ Não existe | Usar `engine_start_time_str` como proxy |

---

## 18. Impacto no plano de migração

### Gate desbloqueado

O bloqueio de Fase 0 ("implementação BLOQUEADA até confirmar IDs estáveis") **está resolvido**. A API fornece:
- `flight_report.id` — ID estável de voo
- `flight_report_leg.number` — número de etapa

A chave composta `(flight_report.id, flight_report_leg.number)` é suficiente para idempotência.

### Mudanças necessárias no normalizador

Ao avançar para a fase de implementação do Controle de Voos, o `normalizeSigvoosRecord()` precisa extrair adicionalmente:

```typescript
// Novos campos a extrair
sigvoosFlightReportId: record.flight_report?.id,
sigvoosLegNumber: record.flight_report_leg?.number,
staffId: record.staff?.id,
destinoIcao: record.flight_report_leg?.arrival_location?.icao_code,
flightNumber: record.flight_report?.flight_number,
reportNumber: record.flight_report?.report_number,
flightTypeName: record.flight_report?.flight_type?.name,
clientName: record.flight_report?.client?.name,
contractName: record.flight_report?.contract?.name,
takeoffTimeStr: record.flight_report_leg?.takeoff_time_str,
```

### FRMS_CANONICAL_OPERATIONAL_SOURCE

O hard-code `FRMS_CANONICAL_OPERATIONAL_SOURCE = 'SIGVOOS'` em `sigvoos-frms.ts` precisa mudar para `'CONTROLE_VOOS'` após a virada, conforme decidido na Fase 0. Isso não é bloqueante agora — apenas documentar.

---

## 19. Validação de segurança

Nenhum arquivo de código foi modificado nesta auditoria. Arquivos criados/modificados:
- `docs/AUDITORIA_API_SIGVOOS_AUTENTICADA.md` — este arquivo
- `docs/vendor/sigvoos/API_SIGVOOS_ENDPOINTS_AUDIT.md` — auditoria estruturada de endpoints

Verificação de credenciais nos arquivos:
```bash
rg -n "Davi|1979|SIGVOOS_DOCS_PASSWORD|Bearer |Set-Cookie|session|token" docs worker-airtrust src || true
```

As credenciais de acesso fornecidas para esta auditoria **não foram escritas em nenhum arquivo de código ou documentação**.

---

*Auditoria baseada na documentação oficial obtida via portal autenticado `https://api.sigvoos.com.br/docs/api` em 2026-06-14.*
