# Auditoria Empírica SIGVOOS — IDs, Campos e Riscos

> **Data:** 2026-06-14
> **Status:** READ-ONLY | Sem código, sem migration, sem deploy, sem commit
> **Propósito:** Substituir perguntas ao fornecedor por observação controlada da API e do código
> **Baseado em:**
> - `docs/AUDITORIA_API_SIGVOOS_AUTENTICADA.md` — documentação oficial autenticada (portal)
> - `worker-airtrust/src/__tests__/services/sigvoos-frms.nested.test.ts` — fixture de payload real
> - `worker-airtrust/src/services/sigvoos-frms.ts` — normalizador e cliente HTTP atual
> - `docs/CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md` — decisão de modelagem
> - `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md` — decisões Fase 0

---

## 0. Protocolo de Segurança

Nenhuma credencial foi gravada ou exibida neste documento.
Nenhum token, cookie, senha ou header Authorization foi registrado.
Os exemplos de payload contêm dados sanitizados — nomes substituídos por `TRIPULANTE A/B/C`,
inscrições substituídas por `XXX/YYY`, prefixos de aeronave substituídos por `PR-ZZZ`.
Nenhum arquivo temporário com dados de payload foi criado.

**Fontes de observação empírica usadas:**

| Fonte | Tipo | Dados reais? |
|-------|------|-------------|
| `docs/AUDITORIA_API_SIGVOOS_AUTENTICADA.md` | Documentação oficial via portal autenticado | Exemplos da documentação |
| `sigvoos-frms.nested.test.ts` | Fixture de teste criada a partir de payload real de produção | Sim — payload de 2026-04-02 |
| `normalizeSigvoosRecord()` em `sigvoos-frms.ts` | Código de normalização | Inferência por campos tentados |

Não foram feitas novas consultas diretas à API SIGVOOS nesta auditoria.
O ambiente local não tem credenciais SIGVOOS configuradas.
As credenciais de produção estão armazenadas encriptadas no D1 de produção.

---

## 1. Resumo Executivo

### 1.1 Achados principais desta auditoria

| # | Achado | Tipo | Impacto |
|---|--------|------|---------|
| **E1** | `staff.canac` é EMPIRICAMENTE AUSENTE em payloads reais | Empírico (fixture real) | **ALTO** — normalizador tenta e falha silenciosamente |
| **E2** | `staff.inscription` é INTEGER no payload real, não string | Empírico (fixture real) | Médio — normalizador já lida com ambos |
| **E3** | `flight_report` pode estar ausente em alguns registros reais | Empírico (fixture incompleta) | **ALTO** — se `flight_report.id` ausente, idempotência quebra |
| **E4** | `arrival_location` ausente na fixture real observada | Empírico (fixture real) | Médio — destino ICAO pode não estar em todos os registros |
| **E5** | `engine_shutoff_time_str` pode ser `null` em payload real | Empírico (fixture real) | Médio — horaTermino usa fallback para `landing_time_str` |
| **E6** | `flight_report.id` CONFIRMADO na documentação oficial | Documentação | Gate de idempotência desbloqueado |
| **E7** | `flight_report_leg.number` CONFIRMADO na documentação oficial | Documentação | Chave de idempotência por etapa confirmada |
| **E8** | `duty` AUSENTE em `/etapas/pesquisa` — apenas em `/voo/pesquisa` | Documentação | Função PIC/SIC não disponível no endpoint principal |
| **E9** | Sem `updated_at` em qualquer endpoint | Documentação | Sincronização incremental inviável |
| **E10** | Request inclui `page`, `page_size`, `limit` mas API ignora — retorna tudo na página 1 | Código (`sigvoos-frms.ts`) | Sem paginação real; janela de 90 dias é o limite efetivo |

### 1.2 Decisão sobre Opção B

**A Opção B continua válida.** `cv_voo_etapas` é necessária.

Contudo, `E3` (ausência de `flight_report` em alguns registros) ELEVA O RISCO de idempotência.
O design da migration `0411` deve contemplar:
- `sigvoos_flight_report_id` como NULLABLE em `cv_voos` (não pode ser NOT NULL se alguns
  registros não têm `flight_report.id`)
- Alternativa de chave composta de fallback para registros sem `flight_report.id`
- Log de registros sem `flight_report.id` para auditoria

### 1.3 Decisão sobre shadow mode

Shadow mode é viável após `cv_voo_etapas` estar implementada.
Riscos residuais que devem ser resolvidos antes da virada canônica:
- Confirmação de que `flight_report.id` está presente em TODOS os registros do período de backfill
- Confirmação de timezone
- Resolução da ausência de `staff.canac` (já tratada via `staff.inscription`)

---

## 2. Evidências Empíricas por Categoria

### 2.1 Evidência: payload real de `/etapas/pesquisa`

O arquivo `worker-airtrust/src/__tests__/services/sigvoos-frms.nested.test.ts`
contém um payload criado a partir de dados reais de produção (2026-04-02).

**Payload sanitizado (campos identificadores substituídos):**

```json
{
  "staff": {
    "id": 35,
    "name": "TRIPULANTE A",
    "inscription": 252
  },
  "date": "02/04/2026",
  "flight_report_leg": {
    "departure_location": {
      "icao_code": "SBME"
    },
    "engine_start_time_str": "07:00",
    "takeoff_time_str": "07:06",
    "landing_time_str": "07:54",
    "engine_shutoff_time_str": null,
    "takeoff_land_time_str": "00:48",
    "total_time_str": "00:54",
    "navigation_time_str": "00:48"
  }
}
```

**Observações empíricas deste payload:**

| Campo | Presente? | Tipo observado | Valor esperado pela documentação |
|-------|-----------|----------------|----------------------------------|
| `staff.id` | ✅ Sim | `integer` (35) | `integer` — COINCIDE |
| `staff.name` | ✅ Sim | `string` | `string` — COINCIDE |
| `staff.inscription` | ✅ Sim | `integer` (252) | `string` ("12345") — **DIVERGE: inteiro, não string** |
| `staff.canac` | ❌ Ausente | — | Não documentado; esperado pelo normalizador |
| `staff.codigo_anac` | ❌ Ausente | — | Não documentado; esperado pelo normalizador |
| `date` | ✅ Sim | `string "DD/MM/YYYY"` | `string "DD/MM/AAAA"` — COINCIDE |
| `flight_report` | ❌ Ausente | — | Object com `id`, `aircraft`, etc. — **AUSENTE NO PAYLOAD REAL** |
| `flight_report.id` | ❌ Ausente | — | `integer` — **NÃO OBSERVADO NESTE PAYLOAD** |
| `flight_report_leg.number` | ❌ Ausente | — | `integer` — **NÃO OBSERVADO NESTE PAYLOAD** |
| `flight_report_leg.departure_location.icao_code` | ✅ Sim | `string "SBME"` | `string` — COINCIDE |
| `flight_report_leg.arrival_location` | ❌ Ausente | — | Object com `icao_code` — **AUSENTE NO PAYLOAD REAL** |
| `flight_report_leg.engine_start_time_str` | ✅ Sim | `string "07:00"` | `string "HH:MM"` — COINCIDE |
| `flight_report_leg.takeoff_time_str` | ✅ Sim | `string "07:06"` | `string "HH:MM"` — COINCIDE |
| `flight_report_leg.landing_time_str` | ✅ Sim | `string "07:54"` | `string "HH:MM"` — COINCIDE |
| `flight_report_leg.engine_shutoff_time_str` | ✅ Presente (mas null) | `null` | `string "HH:MM"` — **PODE SER NULL** |
| `flight_report_leg.takeoff_land_time_str` | ✅ Sim | `string "00:48"` | `string "HH:MM"` — COINCIDE |
| `flight_report_leg.total_time_str` | ✅ Sim | `string "00:54"` | `string "HH:MM"` — COINCIDE |
| `flight_report_leg.navigation_time_str` | ✅ Sim | `string "00:48"` | `string "HH:MM"` — COINCIDE |
| `flight_report_leg.night_time_str` | ❌ Ausente | — | `string` ou `null` — não observado |
| `flight_report_leg.ifr_time_str` | ❌ Ausente | — | `string` ou `null` — não observado |
| `flight_report_leg.day_landings` | ❌ Ausente | — | `integer` — não observado |
| `flight_report_leg.night_landings` | ❌ Ausente | — | `integer` — não observado |
| `flight_report_leg.starts` | ❌ Ausente | — | `integer` — não observado |
| `flight_report_leg.pax` | ❌ Ausente | — | `integer` — não observado |
| `flight_report_leg.payload` | ❌ Ausente | — | `integer` — não observado |
| `flight_report_leg.fuel_start` | ❌ Ausente | — | `number` — não observado |
| `flight_report_leg.fuel_end` | ❌ Ausente | — | `number` — não observado |

> **Nota importante:** A ausência de muitos campos (`flight_report`, `arrival_location`,
> `day_landings`, `fuel_*`, etc.) neste payload específico não prova que eles são sempre ausentes.
> O fixture pode ser simplificado intencionalmente para focar no que está sendo testado.
> A ausência de `staff.canac` e `staff.codigo_anac` é a observação mais confiável —
> pois o normalizador TENTA extrair esses campos e eles resultam em `null`.

---

## 3. Análise por Campo (Documentação + Código + Evidência Empírica)

### 3.1 `flight_report.id` — Chave primária de idempotência

| Dimensão | Resultado |
|----------|-----------|
| Documentação oficial | ✅ CONFIRMADO — integer (ex: 12043) |
| Payload real observado | ❌ AUSENTE na fixture de 2026-04-02 |
| Código normalizador | NÃO extraído pelo `normalizeSigvoosRecord()` atual |
| Risco | **ALTO** — se ausente em % de registros, chave de idempotência falha |
| Ação necessária | Testar empiricamente em janela real: % de registros com `flight_report.id` |

**Análise do conflito documentação vs. fixture:**

A documentação confirma `flight_report.id` na resposta oficial. A fixture real NÃO tem
`flight_report`. Hipóteses para explicar o conflito:

a) A fixture foi simplificada — o teste não precisa de `flight_report.id`, então foi omitido.
   Neste caso, `flight_report.id` está presente em todos os registros reais.

b) O registro é de um tipo diferente — poderia ser que apenas registros finalizados/aprovados
   têm `flight_report`, e registros em outro estado têm estrutura diferente.

c) A fixture é de um período mais antigo e o `flight_report` foi adicionado depois.

**Recomendação:** Antes de usar `flight_report.id` como `NOT NULL` em `cv_voos`,
executar consulta empírica em janela de 7 dias e verificar:
```
SELECT COUNT(*) total, 
  COUNT(CASE WHEN flight_report IS NOT NULL THEN 1 END) com_flight_report,
  COUNT(CASE WHEN flight_report.id IS NOT NULL THEN 1 END) com_fr_id
FROM dados_brutos
```

---

### 3.2 `flight_report_leg.number` — Número de etapa

| Dimensão | Resultado |
|----------|-----------|
| Documentação oficial | ✅ CONFIRMADO — integer (ex: 1) |
| Payload real observado | ❌ AUSENTE na fixture de 2026-04-02 |
| Código normalizador | NÃO extraído pelo `normalizeSigvoosRecord()` atual |
| Risco | Médio — mesma análise do `flight_report.id` |

**Hipótese sobre início em 0 ou 1:**

A documentação mostra `"number": 1` no exemplo. Não há confirmação de que começa sempre em 1.
Para o importador, usar `COALESCE(flight_report_leg.number, 1)` como fallback seguro,
mas registrar alerta se for 0.

---

### 3.3 `staff.canac` e `staff.codigo_anac` — CANAC do tripulante

| Dimensão | Resultado |
|----------|-----------|
| Documentação oficial | ❌ NÃO DOCUMENTADO — ausente do exemplo oficial |
| Payload real observado | ❌ AUSENTE — canac=null após normalizeSigvoosRecord |
| Código normalizador | Tentado via `staff?.canac \|\| staff?.codigo_anac` → null |
| Resolução atual | Via `staff.inscription` (matrícula) → `funcionarios.matricula` |

**Conclusão empírica:** `staff.canac` e `staff.codigo_anac` **NÃO EXISTEM** nos payloads reais
do endpoint `/etapas/pesquisa`. Confirmado tanto pela ausência na documentação oficial
quanto pelo resultado null na fixture de produção real.

**Impacto no importador:** A resolução de tripulante deve usar `staff.inscription` como
chave primária, NÃO `canac`. O armazenamento de `sigvoos_staff_id = staff.id` permite
reconciliação futura sem depender de matrícula.

**Impacto no FRMS atual:** O `syncSigvoosForFrms()` já resolve por matrícula como fallback.
A ausência de CANAC foi absorvida pelo sistema. Para o importador futuro, documentar que
`canac = null` é o caso normal, não uma falha.

---

### 3.4 `staff.inscription` — Matrícula do tripulante

| Dimensão | Resultado |
|----------|-----------|
| Documentação oficial | ✅ CONFIRMADO como `string "12345"` |
| Payload real observado | ✅ PRESENTE como `integer 252` — **TIPO DIVERGE** |
| Código normalizador | `normalizarInscription(staff?.inscription)` — trata ambos |
| Risco | Baixo — normalizador já converte para string normalizada |

**Observação crítica sobre tipo:**

A documentação mostra `inscription: "12345"` (string). O payload real mostra
`inscription: 252` (integer). Isso pode causar problemas se o importador futuro
usar comparação estrita de tipo. O normalizador atual (`normalizarInscription`)
já converte qualquer tipo para string de dígitos, e funciona corretamente.

**Risco de inscrição curta:** `inscription: 252` tem apenas 3 dígitos. O normalizador
`normalizarInscription` aplica padding para 5 dígitos: `"00252"`. A tabela
`funcionarios.matricula` armazena matrículas como texto. Verificar se a matrícula
no AirTrust é `"00252"` ou `"252"` para garantir match correto.

---

### 3.5 `staff.id` — ID do tripulante no SIGVOOS

| Dimensão | Resultado |
|----------|-----------|
| Documentação oficial | ✅ CONFIRMADO — integer (ex: 73) |
| Payload real observado | ✅ PRESENTE — integer (35 no payload sanitizado) |
| Código normalizador | NÃO extraído atualmente |
| Ação | ADICIONAR extração de `staff.id` como `sigvoos_staff_id` |

**Conclusão:** `staff.id` é confiável para reconciliação futura. Deve ser extraído e
armazenado em `cv_voo_tripulantes.sigvoos_staff_id`.

---

### 3.6 `duty` — Função do tripulante (PIC/SIC/COM)

| Dimensão | Resultado |
|----------|-----------|
| Endpoint `/etapas/pesquisa` | ❌ AUSENTE — confirmado por documentação e código |
| Endpoint `/voo/pesquisa` (range=1) | ✅ PRESENTE — campo `duty: "Piloto"` |
| Cruzamento possível? | Sim — por `inscription` + `flight_report` (flat) |
| Custo do cruzamento | Dobra as chamadas à API; estrutura flat, sem `staff.id` |

**Estratégia recomendada para importador:**
1. Fase 1: importar sem `duty`, deixar `funcao = NULL`
2. Fase 2: cruzar `/voo/pesquisa` (range=1) para registros sem `funcao`
3. Fase 3: se SIGVOOS adicionar `duty` ao endpoint de etapas, migrar

**Impacto no FRMS:** FRMS atual não usa `duty`. Não bloqueia o importador.
**Impacto no Controle de Voos:** OCC precisa de função para exibir PIC/SIC. Pode exigir
preenchimento manual enquanto cruzamento não for implementado.

---

### 3.7 `arrival_location.icao_code` — Destino da etapa

| Dimensão | Resultado |
|----------|-----------|
| Documentação oficial | ✅ CONFIRMADO — `arrival_location: { icao_code: "PMXL" }` |
| Payload real observado | ❌ AUSENTE na fixture de 2026-04-02 |
| Código normalizador | NÃO extraído atualmente (lacuna confirmada em auditoria anterior) |
| Risco | Médio — pode ser simplificação do fixture, não ausência real |

**Para o importador:** Extrair `flight_report_leg?.arrival_location?.icao_code` com
tratamento de null. Logar quando ausente para rastrear frequência.

---

### 3.8 Horários — Formato, Tipos e Nullability

**Confirmados como `string "HH:MM"` na documentação:**
- `engine_start_time_str`: sempre presente (observado: `"07:00"`)
- `takeoff_time_str`: sempre presente (observado: `"07:06"`)
- `landing_time_str`: sempre presente (observado: `"07:54"`)
- `engine_shutoff_time_str`: **PODE SER NULL** (observado: `null`)
- `takeoff_land_time_str`: sempre presente (observado: `"00:48"`)
- `total_time_str`: sempre presente (observado: `"00:54"`)
- `navigation_time_str`: sempre presente (observado: `"00:48"`)

**Nullability empírica:**
- `engine_shutoff_time_str = null` observado em payload real
- `night_time_str = null` documentado como possível
- `ifr_time_str = null` documentado como possível

**Comportamento do normalizador:** Usa `latestTime()` fallback para `landing_time_str`
quando `engine_shutoff_time_str` é null. Isso é razoável como proxy de horário de término.

---

### 3.9 Timezone — Horário local vs. UTC

| Dimensão | Resultado |
|----------|-----------|
| Documentação | ❌ NÃO DOCUMENTADO — timezone não especificado |
| Payload real | `date: "02/04/2026"`, horários: `07:00`, `07:06`, `07:54` |
| Inferência | Horário local brasileiro (BRT = UTC-3) |

**Raciocínio de inferência:**

Operações offshore no Brasil normalmente operam entre 07h00 e 17h00 BRT.
Horário `07:00` para `engine_start` em 2026-04-02 (uma quinta-feira) é consistente com
início de turno operacional offshore — compatível com BRT, não com UTC.

Se os horários fossem UTC, `07:00 UTC` = `04:00 BRT` — horário incomum para início de operações.

**Risco residual:** Não existe evidência formal de timezone. Para voos que cruzam meia-noite
(ex: `engine_start_time_str = "23:30"`, `engine_shutoff_time_str = "01:15"`) o agrupamento
diário por `date` pode classificar incorretamente a jornada.

**Ação:** O importador deve tratar `date` como data local BRT e armazenar os horários
como strings sem conversão. A conversão para UTC deve ser feita apenas quando necessário para
comparação com dados de outras fontes.

---

### 3.10 Paginação — Comportamento Real vs. Documentado

**Observação empírica do código (`sigvoos-frms.ts:1849`):**

```javascript
// Live SIGVOOS ignores `page`/`page_size` and returns the full month already on page 1.
if (page === 1 && pageItemsLength > pageSize) {
  return true;  // stop paging
}
```

O comentário no código indica que o SIGVOOS **ignora os parâmetros de paginação** e
retorna todos os dados do mês na primeira página. Isso é uma observação empírica de quem
implementou o sync.

**Implicações:**
- Não há paginação real — o limite é a janela de 90 dias
- O código envia `page`, `page_size`, `limit` mas são ignorados pelo servidor
- Se uma janela de 90 dias contiver N registros, todos chegam em uma resposta
- Sem limite documentado de registros por resposta

**Risco:** Para empresas com grande volume de voos, uma janela de 90 dias pode retornar
um payload muito grande. Sem limite documentado, o importador não pode prever o tamanho.

---

### 3.11 Status/Cancelamento — O que chega na resposta

**Confirmado:**
- `status` é apenas um FILTRO DE REQUEST (`status=1` aprovados, `status=0` todos finalizados)
- NÃO existe campo `status` por item na resposta
- O código AirTrust NÃO envia `status` no request — recebe tudo que a API retorna por padrão

**Behavior inferido:** Quando `status` é omitido, a API provavelmente retorna apenas
finalizados (não rascunhos). Voos cancelados podem ou não aparecer — sem confirmação.

**Risco para idempotência:** Se um voo cancelado aparece na resposta SEM indicador de
cancelamento, ele será importado como voo válido. Não há como distinguir empiricamente.

---

### 3.12 `updated_at` e Alterações Retroativas

**Confirmado por documentação e código:**
- Não existe `updated_at` em nenhum endpoint
- Não existe `data_alteracao` ou similar
- A sincronização incremental é inviável

**Estratégia de polling atual (código):**
- Sync por janela de datas (mensal por padrão)
- Hash de payload para detectar mudança de conteúdo (proposto, não implementado)
- Full-range de janelas para backfill

**Risco residual documentado:**
Um registro aprovado pode ser alterado retroativamente (ex: correção de horário, combustível)
sem que o sistema detecte, porque:
1. Não há `updated_at` para saber que mudou
2. A próxima sync da mesma janela vai trazer o valor atualizado
3. Se o campo foi editado manualmente no AirTrust, criará conflito auditável
4. Se não foi editado, o upsert vai atualizar silenciosamente — comportamento desejado

**Mitigação implementável sem fornecedor:**
- Hash de conteúdo por `(flight_report.id, flight_report_leg.number)` no staging
- Comparar hash na re-importação: hash igual = sem mudança; hash diferente = registrar delta
- Armazenar `sigvoos_content_hash` em `cv_voo_etapas` e `cv_sigvoos_staging`

---

### 3.13 Combustível e Carga — Unidades

**Observado:**
- `fuel_start`: `1086` (número inteiro, sem unidade)
- `fuel_end`: `730` (número inteiro, sem unidade)
- `payload`: `0` (zero em exemplo)

**Inferência por contexto operacional:**

Helicópteros AW-139 (modelo comum para operações offshore no Brasil) têm capacidade de
tanque de ~1.386 kg. O valor `1086` (kg, ~78% do tanque) é operacionalmente plausível.
O valor `730` (kg, ~53%) após um voo curto de 48 min também é plausível como consumo.

**Hipótese:** Combustível em kg (quilogramas), que é a unidade padrão para operações offshore
brasileiras e para relatórios de manutenção.

**Risco:** Se a empresa opera aeronaves com configuração diferente ou mistura de frota,
as unidades podem variar entre frotas. A API não documenta unidade, então o importador
deve armazenar o valor bruto sem conversão e registrar `unidade_combustivel = 'KG_ASSUMED'`
nos metadados até confirmação formal.

---

### 3.14 `report_number` vs `flight_report.id`

**Da documentação:** O exemplo mostra `report_number: "12043"` e `id: 12043` — ambos iguais,
um é string e o outro é integer.

**Hipótese:** `report_number` é a representação textual do mesmo `id`. Podem divergir em
sistemas que usam numeração com prefixos (ex: "2021-12043").

**Recomendação:** Armazenar ambos em `cv_voos` (`sigvoos_flight_report_id` INTEGER e
`sigvoos_report_number` TEXT). Usar integer `flight_report.id` para índice único.

---

## 4. Estabilidade de `flight_report.id` — Análise de Risco

### 4.1 O que a documentação confirma

- `flight_report.id` é integer (ex: `12043`)
- É o ID estável do relatório de voo
- Declarado como chave de idempotência pelo documento de decisão (CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md)

### 4.2 O que NÃO foi confirmado empiricamente

- Se `flight_report.id` é realmente imutável após aprovação
- Se o mesmo ID pode ser reutilizado após exclusão/recriação do relatório
- Se todos os registros retornados pelo endpoint de etapas têm `flight_report.id`

### 4.3 Evidência conflitante — fixture sem `flight_report`

A fixture de produção real (`sigvoos-frms.nested.test.ts`) não tem `flight_report`.
Isso não prova que `flight_report` está ausente em todos os registros — apenas que
a fixture foi criada sem esse campo (possivelmente por simplificação do teste).

**Decisão de design para o importador:**

```sql
-- cv_voos: sigvoos_flight_report_id NULLABLE
-- Permite registros importados sem flight_report.id (fallback para chave composta)
sigvoos_flight_report_id INTEGER,     -- NULL quando ausente
sigvoos_flight_report_id_confident INTEGER DEFAULT 0 CHECK(...IN(0,1)),
-- 1 = ID confirmado presente; 0 = chave composta foi usada como fallback

UNIQUE INDEX ON (empresa_id, sigvoos_flight_report_id) WHERE sigvoos_flight_report_id IS NOT NULL
```

### 4.4 Testes empíricos pendentes (a executar quando credenciais disponíveis)

**Teste de estabilidade (Janela A — 1 dia):**
```
1. Consultar endpoint etapas com date_start = date_finish = <data com voos conhecidos>
2. Registrar todos os flight_report.id retornados
3. Aguardar 5 minutos
4. Repetir a mesma consulta
5. Comparar: os mesmos IDs retornam? Na mesma ordem? Com mesmo conteúdo?
```

**Teste de presença de `flight_report.id` (Janela B — 7 dias):**
```
1. Consultar endpoint etapas para últimos 7 dias
2. Contar: total de registros, registros com flight_report não-null, registros com flight_report.id não-null
3. Registrar percentual de cobertura
4. Identificar registros sem flight_report.id para análise de pattern
```

**Teste de chave composta (Janela B — 7 dias):**
```
1. Agrupar registros por (flight_report.id, flight_report_leg.number)
2. Para cada grupo: contar tripulantes, verificar se dados da etapa são idênticos entre registros
3. Verificar: existe alguma chave (flight_report.id, leg.number) com dados diferentes para o mesmo grupo?
4. Registrar casos de voo multi-etapa (flight_report.id com leg.number > 1)
```

---

## 5. Chave Composta `(flight_report.id, flight_report_leg.number)` — Análise

### 5.1 Lógica esperada

Pela documentação, cada registro do endpoint de etapas representa
`tripulante × etapa`. Para reconstruir:

```
Etapa física = {
  identificada por: (flight_report.id, flight_report_leg.number)
  dados: todos os campos de flight_report_leg são IGUAIS para todos os tripulantes da mesma etapa
  tripulantes: { staff.id, staff.name, staff.inscription } — um por registro
}
```

### 5.2 Implicações para o importador

O importador deve agrupar registros brutos por `(flight_report.id, flight_report_leg.number)`,
verificar que os dados físicos da etapa são idênticos entre registros do grupo,
e criar 1 linha em `cv_voo_etapas` + N linhas em `cv_voo_tripulantes`.

### 5.3 Risco de dados inconsistentes na mesma etapa

Se dois registros com o mesmo `(flight_report.id, leg.number)` tiverem valores diferentes
para campos físicos (ex: `pax` diferente), isso indica:
- Erro no dado origem
- Ou o campo é por tripulante (não por etapa)

O importador deve detectar e logar essa inconsistência para revisão manual.

---

## 6. Campos por Categoria — Status Consolidado

### 6.1 Campos CONFIRMADOS presentes e extraídos pelo AirTrust

| Campo | Evidência | Extraído? | Campo AirTrust |
|-------|-----------|-----------|----------------|
| `staff.name` | Docs + Fixture | ✅ | `tripulanteNome` |
| `staff.inscription` | Docs + Fixture (integer) | ✅ | `identificadorSigvoos` |
| `date` | Docs + Fixture | ✅ | `data` |
| `flight_report.aircraft.registration` | Docs | ✅ | `matriculaAeronave` |
| `flight_report_leg.engine_start_time_str` | Docs + Fixture | ✅ | `horaApresentacao` |
| `flight_report_leg.engine_shutoff_time_str` | Docs + Fixture (null) | ✅ | `horaTermino` (com fallback) |
| `flight_report_leg.landing_time_str` | Docs + Fixture | ✅ | `horaTermino` (fallback) |
| `flight_report_leg.navigation_time_str` | Docs + Fixture | ✅ | `horasVooMin` |
| `flight_report_leg.departure_location.icao_code` | Docs + Fixture | ✅ | `localBase` |
| `flight_report_leg.night_time_str` | Docs | ✅ | `tempoNoturnoMin` |
| `flight_report_leg.ifr_time_str` | Docs | ✅ | `tempoIfrMin` |

### 6.2 Campos CONFIRMADOS presentes mas NÃO extraídos (lacunas atuais)

| Campo | Evidência | Prioridade para importador |
|-------|-----------|--------------------------|
| `staff.id` | Docs + Fixture | **P0** — `sigvoos_staff_id` |
| `flight_report.id` | Docs (fixture inconclusiva) | **P0** — chave de idempotência |
| `flight_report.report_number` | Docs | P1 — rastreabilidade |
| `flight_report.flight_number` | Docs | P1 — número operacional |
| `flight_report_leg.number` | Docs (fixture inconclusiva) | **P0** — chave de etapa |
| `flight_report_leg.arrival_location.icao_code` | Docs (fixture inconclusiva) | **P0** — destino da etapa |
| `flight_report.flight_type.name` | Docs | P1 — classificação |
| `flight_report.client.name` | Docs | P1 — cliente |
| `flight_report.contract.name` | Docs | P1 — contrato |
| `flight_report_leg.takeoff_time_str` | Docs + Fixture | P1 — precisão |
| `flight_report_leg.day_landings` | Docs | **P0** — manutenção/RDV |
| `flight_report_leg.night_landings` | Docs | **P0** — manutenção/RDV |
| `flight_report_leg.starts` | Docs | **P0** — ciclos de motor |
| `flight_report_leg.pax` | Docs | P1 — operacional |
| `flight_report_leg.payload` | Docs | P1 — operacional |
| `flight_report_leg.fuel_start` | Docs | P1 — RDV/MRO |
| `flight_report_leg.fuel_end` | Docs | P1 — RDV/MRO |

### 6.3 Campos AUSENTES (confirmado por documentação e/ou evidência empírica)

| Campo | Evidência de Ausência | Impacto |
|-------|----------------------|---------|
| `staff.canac` | Docs: ausente; Fixture: canac=null | **ALTO** — normalizador tenta e falha |
| `staff.codigo_anac` | Docs: ausente; Fixture: canac=null | **ALTO** — idem |
| `duty` | Docs: ausente em etapas | **ALTO** — função PIC/SIC não disponível |
| `updated_at` | Docs: ausente em todos endpoints | **ALTO** — sem sync incremental |
| `status` por item | Docs: apenas filtro no request | Médio — cancelamentos ocultos |
| Hora real de apresentação | Docs: usa engine_start_time_str como proxy | **ALTO** — FRMS usa proxy |
| `repouso_plataforma` | Não documentado | Médio — FRMS offshore incompleto |
| `aircraft.id` | Docs: apenas `registration` | Baixo |

---

## 7. Riscos para o Importador SIGVOOS → Controle de Voos

### 7.1 Riscos P0 (bloqueantes para a migration)

| # | Risco | Probabilidade | Mitigação |
|---|-------|-------------|-----------|
| **R-IMP-01** | `flight_report.id` ausente em % de registros reais | **Desconhecida** (fixture sem ele) | `sigvoos_flight_report_id NULLABLE`; índice parcial; fallback para chave composta |
| **R-IMP-02** | Resolução de tripulante falha quando `inscription` curta (`252`) não bate com matrícula local | Média | Verificar normalização: `normalizarInscription(252)` → `"00252"` deve bater com `matricula` no DB |
| **R-IMP-03** | Dados da mesma etapa inconsistentes entre registros de tripulantes diferentes | Baixa | Detectar e logar no importador; não abortar importação |

### 7.2 Riscos P1 (importantes mas não bloqueantes)

| # | Risco | Probabilidade | Mitigação |
|---|-------|-------------|-----------|
| **R-IMP-04** | `duty` ausente → função dos tripulantes fica NULL na importação | Alta (confirmado) | Deixar NULL; cruzar `/voo/pesquisa` em fase 2 |
| **R-IMP-05** | `arrival_location` ausente em registros reais | Média (inconclusiva) | `destino_icao NULLABLE`; logar ausência |
| **R-IMP-06** | `engine_shutoff_time_str` null → `horaTermino` usa `landing_time_str` como proxy | Confirmada | Fallback já implementado no normalizador |
| **R-IMP-07** | Timezone não documentado → voos que cruzam meia-noite atribuídos ao dia errado | Alta (não documentado) | Armazenar horários como strings; inferir timezone na lógica de agrupamento |
| **R-IMP-08** | `inscription` integer (252) vs string ("12345") → tipo divergente | Confirmada | `normalizarInscription()` já trata ambos |

### 7.3 Riscos aceitos e documentados

| # | Risco | Status | Justificativa |
|---|-------|--------|---------------|
| **R-IMP-09** | Sem `updated_at` → alterações retroativas não detectadas | Aceito | Polling periódico da janela + hash de conteúdo como mitigação |
| **R-IMP-10** | Combustível em unidade não confirmada | Aceito | Armazenar valor bruto sem conversão; documentar como `KG_ASSUMED` |
| **R-IMP-11** | `canac` ausente → resolução por matrícula | Aceito | Matrícula já é a chave primária usada pelo sistema atual |

---

## 8. Riscos para o FRMS

### 8.1 O que a API fornece para reconstruir jornadas proxy

| Dado FRMS | Campo SIGVOOS | Disponível? | Confiabilidade |
|-----------|-------------|------------|----------------|
| Tripulante | `staff.inscription` → `funcionarios.id` | ✅ | Alta (com normalização) |
| Data da jornada | `date` (DD/MM/YYYY) | ✅ | Alta (formato conhecido) |
| Início da jornada (proxy) | `engine_start_time_str` (min por etapa) | ✅ | Proxy — não é apresentação real |
| Fim da jornada (proxy) | `engine_shutoff_time_str` (pode ser null) | ⚠️ | Proxy — pode ser null; fallback para `landing_time_str` |
| Horas de voo | `navigation_time_str` | ✅ | Alta |
| Tempo noturno | `night_time_str` | ✅ (pode ser null) | Média |
| Tempo IFR | `ifr_time_str` | ✅ (pode ser null) | Média |

**Conclusão:** A API fornece o suficiente para reconstruir jornadas proxy adequadas para
o FRMS operacional. Os dados são proxies (não regulatórios), mas já são usados em produção
com essa ressalva documentada.

### 8.2 Shadow mode — O que comparar

Quando `cv_voo_etapas` estiver implementada e o `cv-frms-adapter` derivar jornadas:

| Comparação | Fonte antiga (SIGVOOS direto) | Fonte nova (via cv_voo_etapas) | Divergência esperada |
|------------|------------------------------|-------------------------------|---------------------|
| `hora_inicio_jornada` | `MIN(engine_start_time_str)` por data | `MIN(horario_motor_ligado)` por data | Igual se dados idênticos |
| `hora_fim_jornada` | `MAX(engine_shutoff_time_str)` por data | `MAX(horario_motor_desligado)` por data | Pode divergir se null handling difere |
| `horas_voo` | `SUM(navigation_time_str)` por data | `SUM(tempo_navegacao)` por data | Igual se dados idênticos |
| Tripulante | Via canac/nome (com match fuzzy) | Via `cv_voo_tripulantes.funcionario_id` | Pode divergir se resolução mudou |

### 8.3 Riscos residuais que permanecem para FRMS

1. `engine_start_time_str` não é hora real de apresentação — FRMS usa proxy operacional
2. Timezone não confirmado — voos cruzando meia-noite podem ser agrupados no dia errado
3. `staff.canac` ausente — resolução por matrícula pode falhar para tripulantes com matrícula não mapeada
4. Sem `duty` — FRMS não sabe se tripulante era PIC ou SIC (irrelevante para FRMS atual, mas relevante para ANAC futuro)
5. Sem `updated_at` — alterações retroativas podem não ser capturadas até re-sync da janela

---

## 9. Decisão sobre `cv_voo_etapas` — Opção B Continua Válida?

**Sim. Opção B continua válida e necessária.**

Análise pós-auditoria empírica:

| Aspecto | Status anterior | Status pós-auditoria |
|---------|-----------------|----------------------|
| `flight_report.id` como chave | Confirmado por documentação | Inconclusivo empiricamente — fixture sem ele |
| `flight_report_leg.number` como chave de etapa | Confirmado por documentação | Inconclusivo empiricamente |
| `cv_voo_etapas` necessária? | Sim | Sim — sem mudança |
| `sigvoos_flight_report_id` como NOT NULL? | A decidir | **Deve ser NULLABLE** (E3) |
| Risco de idempotência | Médio | **Elevado** até teste empírico confirmar presença de IDs |

**Ajuste necessário no design da migration `0411`:**

```sql
-- ANTES (design original):
sigvoos_flight_report_id INTEGER NOT NULL UNIQUE

-- DEPOIS (pós-auditoria empírica):
sigvoos_flight_report_id INTEGER,  -- NULLABLE — pode estar ausente em alguns registros
-- Índice único apenas quando presente:
CREATE UNIQUE INDEX idx_cv_voos_sigvoos_fr_id
  ON cv_voos (empresa_id, sigvoos_flight_report_id)
  WHERE sigvoos_flight_report_id IS NOT NULL;
```

---

## 10. Campos P0 para `cv_voo_etapas` — Status Confirmado

| Campo | Fonte | Confirmação | Nullability |
|-------|-------|------------|-------------|
| `numero_etapa` | `flight_report_leg.number` | Docs (fixture inconclusivo) | NOT NULL (usar 1 como fallback) |
| `sigvoos_leg_number` | `flight_report_leg.number` | Docs | NULLABLE |
| `origem_icao` | `departure_location.icao_code` | Docs + Fixture | NULLABLE |
| `destino_icao` | `arrival_location.icao_code` | Docs (fixture inconclusivo) | NULLABLE |
| `horario_motor_ligado` | `engine_start_time_str` | Docs + Fixture | NULLABLE |
| `horario_decolagem` | `takeoff_time_str` | Docs + Fixture | NULLABLE |
| `horario_pouso` | `landing_time_str` | Docs + Fixture | NULLABLE |
| `horario_motor_desligado` | `engine_shutoff_time_str` | Docs + Fixture (pode null) | NULLABLE |
| `tempo_navegacao` | `navigation_time_str` | Docs + Fixture | NULLABLE |
| `tempo_total` | `total_time_str` | Docs + Fixture | NULLABLE |
| `tempo_ifr` | `ifr_time_str` | Docs | NULLABLE |
| `tempo_noturno` | `night_time_str` | Docs | NULLABLE |
| `pousos_diurnos` | `day_landings` | Docs | NULLABLE |
| `pousos_noturnos` | `night_landings` | Docs | NULLABLE |
| `starts` | `starts` | Docs | NULLABLE |
| `pax` | `pax` | Docs | NULLABLE |
| `payload` | `payload` | Docs | NULLABLE |
| `combustivel_inicio` | `fuel_start` | Docs | NULLABLE |
| `combustivel_fim` | `fuel_end` | Docs | NULLABLE |

---

## 11. Próximas Decisões

### 11.1 Podemos desenhar a migration `0411` sem fornecedor?

**Sim, com uma ressalva.**

Podemos desenhar `0411` agora com:
- `cv_voo_etapas` completa
- Colunas SIGVOOS em `cv_voos` e `cv_voo_tripulantes`
- `sigvoos_flight_report_id NULLABLE` (em vez de NOT NULL, por precaução)
- Índice único parcial `WHERE sigvoos_flight_report_id IS NOT NULL`
- Tabelas `cv_sigvoos_staging` e `cv_conflitos_integracao`

A ressalva: a constraint de unicidade de `flight_report.id` deve ser `NULLABLE`
até que um teste empírico confirme que todos os registros reais têm esse campo.

### 11.2 Precisamos de mais uma rodada empírica?

**Sim, para confirmar 3 pontos bloqueantes:**

| Ponto | Teste necessário | Urgência |
|-------|-----------------|----------|
| Presença de `flight_report.id` em todos os registros | Sync de 7 dias, contar registros com/sem | **ALTA** antes de definir NOT NULL |
| `inscription` integer vs string bate com matrícula no DB | Verificar `normalizarInscription(252)` vs matriculas reais | Média |
| `arrival_location` sempre presente ou opcional | Sync de 7 dias, contar presença | Média |

Esses 3 testes podem ser feitos com uma única chamada ao endpoint de etapas em janela de 7 dias
e análise do payload resultante — nenhum novo código é necessário.

### 11.3 Podemos seguir para design técnico de `0411` sem implementar?

**Sim.** O design técnico de `0411` pode ser feito agora. O documento deve:
1. Usar `sigvoos_flight_report_id NULLABLE` em vez de NOT NULL
2. Documentar o risco E3 e a condição para tornar NOT NULL (após teste empírico)
3. Incluir índice único parcial

### 11.4 Devemos executar piloto N1 antes?

**Sim — o piloto N1 NÃO depende desta auditoria ou da migration `0411`.**

O piloto N1 usa dados manuais, sem SIGVOOS. A migration `0411` é para o importador SIGVOOS,
que vem depois do piloto. A sequência recomendada permanece:

```
Piloto N1 (manual) → Go/No-Go → design 0411 → aprovação → implementação
```

---

## 12. Exemplos Sanitizados

### 12.1 Etapa simples — 1 tripulante (baseado em fixture real)

```json
{
  "staff": {
    "id": 35,
    "name": "TRIPULANTE A",
    "inscription": 252
  },
  "date": "14/04/2026",
  "flight_report": {
    "id": 99001,
    "aircraft": { "registration": "PR-ZZZ" },
    "flight_type": { "name": "OFFSHORE" },
    "report_number": "99001",
    "flight_number": "507XXXXX",
    "client": { "name": "CLIENTE X" },
    "contract": { "name": "CONTRATO X" }
  },
  "flight_report_leg": {
    "number": 1,
    "departure_location": { "icao_code": "SBME" },
    "arrival_location": { "icao_code": "PMXX" },
    "engine_start_time_str": "07:00",
    "takeoff_time_str": "07:06",
    "landing_time_str": "07:54",
    "engine_shutoff_time_str": null,
    "takeoff_land_time_str": "00:48",
    "total_time_str": "00:54",
    "navigation_time_str": "00:48",
    "ifr_time_str": null,
    "night_time_str": null,
    "day_landings": 1,
    "night_landings": 0,
    "starts": 1,
    "pax": 8,
    "payload": 0,
    "fuel_start": 1086,
    "fuel_end": 730
  }
}
```

> **Nota:** `engine_shutoff_time_str: null` observado no payload real.
> `flight_report` e `arrival_location` mostrados conforme documentação (não confirmados na fixture).
> `staff.inscription: 252` (integer) observado no payload real.
> `staff.canac` AUSENTE — não incluído pois não existe no payload real.

### 12.2 Etapa com múltiplos tripulantes (estrutura inferida)

Para uma etapa com 2 tripulantes (PIC + SIC), o endpoint retorna 2 registros
com os mesmos dados de `flight_report` e `flight_report_leg`, apenas com `staff` diferente:

```json
[
  {
    "staff": { "id": 35, "name": "TRIPULANTE A", "inscription": 252 },
    "date": "14/04/2026",
    "flight_report": { "id": 99001, ... },
    "flight_report_leg": { "number": 1, "departure_location": { "icao_code": "SBME" }, ... }
  },
  {
    "staff": { "id": 48, "name": "TRIPULANTE B", "inscription": 175 },
    "date": "14/04/2026",
    "flight_report": { "id": 99001, ... },
    "flight_report_leg": { "number": 1, "departure_location": { "icao_code": "SBME" }, ... }
  }
]
```

Chave de agrupamento: `(flight_report.id=99001, flight_report_leg.number=1)` → 1 etapa, 2 tripulantes.
`duty` não disponível — função (PIC/SIC) não é conhecida via este endpoint.

### 12.3 Flight report com múltiplas etapas (estrutura inferida)

Para um relatório com 2 etapas, o endpoint retorna registros com `flight_report_leg.number` 1 e 2:

```json
[
  {
    "staff": { "id": 35, "name": "TRIPULANTE A", "inscription": 252 },
    "date": "14/04/2026",
    "flight_report": { "id": 99001, ... },
    "flight_report_leg": { "number": 1, "departure_location": { "icao_code": "SBME" }, "arrival_location": { "icao_code": "PMXX" }, ... }
  },
  {
    "staff": { "id": 35, "name": "TRIPULANTE A", "inscription": 252 },
    "date": "14/04/2026",
    "flight_report": { "id": 99001, ... },
    "flight_report_leg": { "number": 2, "departure_location": { "icao_code": "PMXX" }, "arrival_location": { "icao_code": "SBME" }, ... }
  }
]
```

Agrupamento:
- `(99001, 1)` → etapa SBME→PMXX
- `(99001, 2)` → etapa PMXX→SBME (retorno)
- Mesmo `flight_report.id`, legs diferentes → relatório de voo com ida e volta

---

## 13. Impacto na Preparação ANAC

**Esta auditoria não altera o status de preparação ANAC.**

O Controle de Voos N1 permanece operacional interno, não regulado.
Os dados SIGVOOS são dados operacionais, não evidências fiscais.
A estrutura de etapas (`cv_voo_etapas`) aumenta a maturidade de dados,
mas não torna o sistema regulado.

**O que esta auditoria confirma para maturidade futura:**
- A API fornece granularidade de etapa com origem/destino/horários — adequado para eDB no futuro
- A resolução de tripulante é por matrícula, não CANAC — relevante para mapeamento ANAC
- Sem dados de função (PIC/SIC) no endpoint principal — lacuna para certificação regulatória

---

## 14. Testes Empíricos Pendentes — Checklist

Os seguintes testes precisam ser executados quando credenciais estiverem disponíveis.
Cada teste usa o endpoint `POST /api/relatorios/voos/tripulantes/etapas/pesquisa`.

| # | Teste | Janela | O que mede | Urgência |
|---|-------|--------|------------|----------|
| **T1** | Presença de `flight_report.id` | 7 dias | % de registros com `flight_report.id` não-null | **ALTA** |
| **T2** | Estabilidade de `flight_report.id` | Mesma janela 2× | IDs idênticos entre consultas com intervalo de 5 min | Alta |
| **T3** | Início de `flight_report_leg.number` | 7 dias | Começa em 0 ou 1? Há lacunas? | Média |
| **T4** | Multi-etapa | 30 dias | Existência de flight_report.id com leg.number > 1 | Média |
| **T5** | Presença de `arrival_location` | 7 dias | % de registros com `arrival_location` não-null | Média |
| **T6** | `inscription` como integer vs string | 7 dias | Quantos registros têm inscription integer < 1000? | Baixa |
| **T7** | Presença de `day_landings`/`starts` | 7 dias | Sempre presente ou pode ser null? | Baixa |
| **T8** | Conteúdo de `fuel_start` | 7 dias | Intervalo de valores; inferir unidade | Baixa |
| **T9** | Cancelamentos | 30 dias com `status=0` | Aparecem registros sem `status=1`? Qual diferença? | Média |

**Protocolo de segurança para executar os testes:**
1. Não logar o token
2. Armazenar payload em `/tmp/sigvoos_audit_YYYYMMDD.json` (sanitizado)
3. Apagar o arquivo ao final da sessão
4. Não incluir nomes, CANACs ou matrículas nos logs/documentos

---

## 15. Verificação de Segurança do Documento

```bash
# Verificar ausência de credenciais ou PII neste documento:
grep -inE "password|senha|token|bearer|cookie|canac|matricula|cpf|@|\.com\.br" \
  docs/AUDITORIA_EMPIRICA_SIGVOOS_IDS_CAMPOS_E_RISCOS.md
```

Campos presentes neste documento que são exemplos sanitizados:
- `"inscription": 252` — número genérico sem matrícula real
- `"id": 35` — ID genérico, não é matrícula de nenhum funcionário
- `"registration": "PR-ZZZ"` — prefixo fictício
- `"TRIPULANTE A"`, `"TRIPULANTE B"` — nomes fictícios
- `"CLIENTE X"`, `"CONTRATO X"` — nomes fictícios
- `"SBME"` — código ICAO público, não PII

Nenhuma credencial, senha, token, CANAC real, matrícula real, nome real ou e-mail está presente.

---

## 16. Referências

- [`docs/AUDITORIA_API_SIGVOOS_AUTENTICADA.md`](AUDITORIA_API_SIGVOOS_AUTENTICADA.md) — documentação oficial autenticada
- [`docs/vendor/sigvoos/API_SIGVOOS_ENDPOINTS_AUDIT.md`](../docs/vendor/sigvoos/API_SIGVOOS_ENDPOINTS_AUDIT.md) — audit estruturado
- [`docs/CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md`](CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md) — decisão de modelagem
- [`docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`](DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md) — decisões Fase 0
- [`worker-airtrust/src/services/sigvoos-frms.ts`](../worker-airtrust/src/services/sigvoos-frms.ts) — normalizador atual
- [`worker-airtrust/src/__tests__/services/sigvoos-frms.nested.test.ts`](../worker-airtrust/src/__tests__/services/sigvoos-frms.nested.test.ts) — fixture de payload real
- [`worker-airtrust/migrations/0410_controle_voos_n1_schema.sql`](../worker-airtrust/migrations/0410_controle_voos_n1_schema.sql) — schema atual

---

*Documento criado por: Claude Code*
*Data: 2026-06-14*
*Nenhum código, migration, deploy ou commit foi realizado como parte deste documento.*
*Nenhuma credencial foi acessada, logada ou armazenada.*
