# API SIGVOOS — Endpoints Audit (Documentação Oficial)

> Data: 2026-06-14  
> Fonte: Documentação autenticada `https://api.sigvoos.com.br/docs/api`  
> Sessão autenticada como: FILIPE PASSARONI DAUMAS  
> Status: READ-ONLY | Nenhuma alteração de código foi feita

---

## Base URL

```
https://api.sigvoos.com.br/api
```

---

## Endpoints documentados (4 total)

### 1. POST `/api/get/token` — Autenticação

**Auth:** SEM AUTENTICAÇÃO

**Request body:**
```json
{
  "username": "usuario@empresa.com.br",
  "password": "senha",
  "system": "sigtrip"
}
```

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

- `data.token` é **string JSON** — precisa de `JSON.parse()` para extrair `access_token`.
- `expires_in` = 31.622.400 s ≈ 366 dias.
- `refresh_token` presente mas não usado pelo AirTrust.

**Erros:**
| Código | Mensagem |
|---|---|
| — | `{"error":"inactive_user"}` |
| — | `{"error":"inexistent_user"}` |
| — | `{"error":"permissionless_user"}` |
| — | `{"error":"invalid_credentials"}` |

---

### 2. POST `/api/relatorios/voo/pesquisa` — NÃO USADO pelo AirTrust

**Auth:** Bearer token

**Request body:**
```json
{
  "date_start": "01/02/2021",
  "date_finish": "28/02/2021",
  "range": 1,
  "status": 1,
  "staffs": [{ "value": 73, "label": "TRIPULANTE EXEMPLO" }]
}
```

Parâmetros obrigatórios: `date_start`, `date_finish`, `range`  
Filtros opcionais: `status`, `staffs`, `aircraft_id`, `aircraft_model_id`, `base_id`, `contract_base_id`, `contract_id`, `client_id`, `flight_type_id`, `flight_report_id`, `exemption`, `payload`

`range`: `0` = consolidado, `1` = analítico por tripulante, `2` = analítico por trecho

**Response 200 (range=1, estrutura flat):**
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

**Diferencial vs. `/etapas/pesquisa`:** inclui `duty`, `refuels`, `external_load_*`, `observations`, `exemption`. Estrutura flat (não nested).

**Erros:**
```json
// 403
{ "data": { "main": "", "headers": "" }, "status": "error", "message": "Campos obrigatórios faltantes" }
// 401
{ "permission_denied": 1 }
```

---

### 3. POST `/api/relatorios/voo/quantidade` — NÃO USADO pelo AirTrust

**Auth:** Bearer token

Retorna **consolidações quantitativas** — contagens agregadas, não registros individuais.

**Request body:**
```json
{
  "date_start": "01/02/2021",
  "date_finish": "28/02/2021",
  "filter_type": 0,
  "status": 1,
  "aircraft_model_id": 4
}
```

`filter_type`: `0` = consolidação geral, `1` = agrupado por base.

**Response 200 (resumido):**
```json
{
  "data": {
    "main": {
      "aircraft_period": [
        { "date_start": "...", "date_finish": "...", "aircraft": "PR-ABC", "aircraft_model": "AW-139", "total": 14, "total_landings": 28, "total_shutoffs": 14, "pax": 76, "payload": 0 }
      ],
      "aircraft_dates": [ { "date": "15/02/2021", "aircraft": "...", "total": 1, "total_landings": 2, "total_shutoffs": 1, "pax": 10, "payload": 0 } ],
      "aircraft_model_period": [ ... ],
      "aircraft_model_dates": [ ... ],
      "total_period": [ ... ],
      "total_dates": [ ... ]
    }
  }
}
```

**Sem IDs individuais de voo neste endpoint.** Uso: relatórios de utilização de frota.

---

### 4. POST `/api/relatorios/voos/tripulantes/etapas/pesquisa` — USADO pelo AirTrust

**Auth:** Bearer token

**Request body:**
```json
{
  "date_start": "01/02/2021",
  "date_finish": "28/02/2021",
  "staff_ids": [73, 91]
}
```

| Campo | Obrigatório | Tipo | Notas |
|---|---|---|---|
| `date_start` | Sim | string | `dd/mm/aaaa` |
| `date_finish` | Sim | string | `dd/mm/aaaa` |
| `staff_ids` | Não | int[] ou string CSV | O AirTrust não usa este filtro |

**Restrição:** período máximo **90 dias**.

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
          "aircraft": { "registration": "PR-ABC" },
          "flight_type": { "name": "Petrobras" },
          "report_number": "12043",
          "flight_number": "507548166",
          "client": { "name": "Petrobras" },
          "contract": { "name": "5900.0111589.19.2" }
        },
        "flight_report_leg": {
          "number": 1,
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
      }
    ],
    "headers": []
  },
  "status": "success",
  "message": ""
}
```

**Mapeamento de campos — status de extração no AirTrust:**

| Campo SIGVOOS | Extraído? | Campo AirTrust | Ação |
|---|---|---|---|
| `staff.id` | ❌ | — | ADICIONAR — permite resolução por ID |
| `staff.name` | ✅ | `tripulanteNome` | OK |
| `staff.inscription` | ✅ | `identificadorSigvoos` | OK |
| `staff.canac` | ✅ tentado | `canac` | **NÃO CONFIRMADO** na docs — verificar |
| `date` | ✅ | `data` | OK — formato DD/MM/YYYY |
| `flight_report.id` | ❌ | — | **ADICIONAR — chave de idempotência** |
| `flight_report.report_number` | ❌ | — | ADICIONAR |
| `flight_report.flight_number` | ❌ | — | ADICIONAR — número de voo operacional |
| `flight_report.aircraft.registration` | ✅ | `matriculaAeronave` | OK |
| `flight_report.flight_type.name` | ❌ | — | ADICIONAR |
| `flight_report.client.name` | ❌ | — | ADICIONAR |
| `flight_report.contract.name` | ❌ | — | ADICIONAR |
| `flight_report_leg.number` | ❌ | — | **ADICIONAR — chave de idempotência** |
| `flight_report_leg.departure_location.icao_code` | ✅ | `localBase` | OK |
| `flight_report_leg.arrival_location.icao_code` | ❌ | — | **ADICIONAR — destino da etapa** |
| `flight_report_leg.engine_start_time_str` | ✅ | `horaApresentacao` | OK (proxy) |
| `flight_report_leg.takeoff_time_str` | ❌ | — | ADICIONAR |
| `flight_report_leg.landing_time_str` | ✅ (fallback) | `horaTermino` fallback | OK |
| `flight_report_leg.engine_shutoff_time_str` | ✅ | `horaTermino` | OK (proxy) |
| `flight_report_leg.takeoff_land_time_str` | ✅ (fallback) | `horasVooMin` fallback | OK |
| `flight_report_leg.total_time_str` | ✅ (fallback) | `horasVooMin` fallback | OK |
| `flight_report_leg.navigation_time_str` | ✅ | `horasVooMin` | OK |
| `flight_report_leg.ifr_time_str` | ✅ | `tempoIfrMin` | OK |
| `flight_report_leg.night_time_str` | ✅ | `tempoNoturnoMin` | OK — pode ser `null` |
| `flight_report_leg.day_landings` | ❌ | — | ADICIONAR |
| `flight_report_leg.night_landings` | ❌ | — | ADICIONAR |
| `flight_report_leg.starts` | ❌ | — | ADICIONAR |
| `flight_report_leg.fuel_start` / `fuel_end` | ❌ | — | ADICIONAR se RDV |
| `flight_report_leg.pax` | ❌ | — | ADICIONAR |

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

## Chave de idempotência confirmada

```
(flight_report.id INTEGER, flight_report_leg.number INTEGER)
```

Ambos confirmados na documentação oficial. Esta chave resolve o bloqueio de Fase 0.

---

## Campos NÃO existentes (confirmado pela ausência na documentação)

- `updated_at` / `data_alteracao` — sem sincronização incremental
- `status_voo` por item de etapa — apenas filtro no request
- `duty` / função do tripulante (PIC/SIC) no endpoint de etapas
- `hora_apresentacao` / `hora_termino_jornada` reais — apenas engine start/shutoff como proxy
- `repouso_plataforma` ou similar — sem dados offshore FRMS
- `aircraft.id` — apenas `registration` (string)
- `staff.canac` — **não confirmado** na documentação oficial

---

*Documento baseado na documentação oficial obtida via portal autenticado em 2026-06-14.*
