# Controle de Voos N1 — Design Técnico da Migration 0411

> **Data:** 2026-06-14
> **Status:** DOCUMENTO DE DESIGN TÉCNICO — READ-ONLY | Sem código, sem migration, sem deploy, sem commit
> **Escopo:** Design completo da migration futura 0411, sem implementar. Apenas documentação técnica para revisão e aprovação.
>
> **AVISO CRÍTICO:** Nenhuma alteração de código, migration SQL, frontend, backend, deploy, secret ou dado é autorizada por este documento.
> Não cria eDB, SDRMe, Records Core, sistema regulado ou certificado.
> Não integra SIGVOOS ao Controle de Voos (integração vem depois, no importador).
> Não altera FRMS operacional.
> Não aplica nenhuma migration.
> Não substitui SIGVOOS, APUS, papel, eDB ou qualquer sistema oficial.

---

## 1. Sumário Executivo

### 1.1 Objetivo da 0411

A migration 0411 cria a infraestrutura de banco de dados necessária para que o Controle de Voos N1 possa, futuramente, receber dados importados do SIGVOOS com granularidade de etapa/perna (leg), rastreabilidade de origem, suporte a idempotência e detecção de conflitos entre dados SIGVOOS e dados editados manualmente no AirTrust.

A 0411 é **puramente de schema** — não implementa importador, não integra APIs, não altera FRMS, não muda nenhuma rota existente.

### 1.2 Por que ela existe

A auditoria da API SIGVOOS (2026-06-14) confirmou que o endpoint `/api/relatorios/voos/tripulantes/etapas/pesquisa` retorna dados na granularidade de **tripulante × etapa**. Um `flight_report` pode conter múltiplas etapas (`flight_report_leg`), cada uma com origem, destino, horários, pousos, combustível e passageiros específicos.

O schema atual da 0410 (`cv_voos`, `cv_rdv_operacional`, `cv_voo_tripulantes`, `cv_voo_eventos`) representa o voo como unidade plana sem granularidade de etapa e sem nenhum campo de rastreabilidade SIGVOOS. Isso inviabiliza:

- Idempotência por `flight_report.id` — chave estável do relatório de voo.
- Granularidade de etapa para o FRMS e para o RDV.
- Detecção de alterações retroativas (via content hash, pois não há `updated_at` no SIGVOOS).
- Rastreio de origem de cada campo (manual vs. importado).
- Conflito auditável quando SIGVOOS traz valor diferente de dado já editado.

### 1.3 Decisão de modelagem

**Opção B aprovada** em `docs/CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md`:

- `cv_voos` representa o **flight report** (relatório de voo) — continua sendo a entidade principal.
- `cv_voo_etapas` é criado como nova entidade representando cada perna/leg dentro do relatório.
- `cv_voo_tripulantes` é **estendido** com `etapa_id` opcional para associar tripulante a uma etapa específica.
- `cv_rdv_operacional` continua como resumo agregado por voo/relatório.
- Dados granulares por etapa ficam em `cv_voo_etapas`.

Nenhuma tabela existente é destruída. A extensão é **totalmente aditiva**.

### 1.4 Por que não implementar ainda

A implementação da 0411 está bloqueada pelos seguintes pré-requisitos:

1. **Aprovação explícita deste design** pelo responsável técnico do projeto.
2. **Piloto N1 executado ou em andamento** — o piloto valida o fluxo operacional manual antes do schema change.
3. **Confirmação de `flight_report.id` presente em 100% dos registros reais** — teste T1 pendente (ver seção 14).
4. **Design revisado pós-piloto** — o piloto pode revelar ajustes necessários nos campos do schema.

### 1.5 Riscos principais

| # | Risco | Probabilidade | Severidade |
|---|-------|-------------|-----------|
| R1 | `flight_report.id` ausente em parte dos registros reais | Desconhecida (fixture não tem) | ALTA — idempotência falha silenciosamente |
| R2 | `staff.inscription` integer (ex: 252) não bate com matrícula local | Média | ALTA — tripulante não mapeado |
| R3 | Timezone dos horários SIGVOOS não confirmado | Alta | ALTA — jornadas FRMS atribuídas ao dia errado |
| R4 | `duty` ausente → função de tripulante fica NULL | Alta (confirmado) | MÉDIA — OCC sem PIC/SIC |
| R5 | Sem `updated_at` → alterações retroativas não detectadas | Alta (confirmado) | MÉDIA — data stale até re-sync da janela |
| R6 | Migration aplicada em produção sem autorização | Baixa (protocolo protege) | CRÍTICA — ruptura de schema |
| R7 | `arrival_location` ausente em registros reais | Inconclusiva | MÉDIA — destino da etapa vazio |

---

## 2. Estado Atual da 0410

### 2.1 Tabelas criadas pela 0410

A migration `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql` cria:

#### `cv_aeroportos`
Catálogo de aeroportos, helipontos e plataformas. Campos-chave: `empresa_id`, `codigo`, `codigo_icao`, `codigo_iata`, `nome`, `tipo` (aeroporto/plataforma/heliponto). Índice único por `(empresa_id, codigo) WHERE deleted_at IS NULL`.

#### `cv_tipos_voo`, `cv_naturezas_voo`, `cv_motivos_operacionais`
Catálogos de suporte para classificação, natureza e motivos de cancelamento/atraso. Todos com `empresa_id`, `codigo`, `nome`, `ativo`, `deleted_at`.

#### `cv_voos`
Entidade principal do voo/relatório. Campos-chave:
- `prefixo TEXT NOT NULL` — matrícula da aeronave ou identificador do relatório.
- `data_programacao TEXT NOT NULL` — data do voo (YYYY-MM-DD).
- `origem_id INTEGER NOT NULL` → FK `cv_aeroportos`.
- `destino_id INTEGER NOT NULL` → FK `cv_aeroportos`.
- `tipo_voo_id`, `natureza_voo_id` → catálogos.
- `horario_previsto_partida`, `horario_previsto_chegada` (TEXT NOT NULL).
- `horario_real_partida`, `horario_real_chegada` (TEXT, nullable).
- `status TEXT` — `planejado | liberado_operacionalmente | em_andamento | pousado | concluido_operacionalmente | cancelado | alternado_divergido`.
- `observacoes`, `cancelado_motivo_id`, `alternado_destino_id`.
- CHECK: `horario_previsto_chegada >= horario_previsto_partida`.
- Índices: `(empresa_id, data_programacao, status)`, `(empresa_id, aeronave_id, data_programacao)`, `(empresa_id, prefixo, data_programacao)`.

#### `cv_rdv_operacional`
RDV operacional 1:1 com `cv_voos`. Campos-chave:
- `horas_voadas REAL`, `numero_pousos INTEGER`, `ciclos INTEGER`.
- `combustivel_decolagem`, `combustivel_pouso`, `combustivel_consumo` (REAL).
- `pob INTEGER`, `carga_kg REAL`.
- `horario_decolagem_real`, `horario_pouso_real` (TEXT).
- `ocorrencias`, `divergencias` (TEXT livre).
- `status`: `rascunho | preenchimento_finalizado | cancelado`.
- CHECK de não-negatividade em todos os campos numéricos.
- CHECK: `horario_pouso_real >= horario_decolagem_real` (quando ambos não-null).
- Índice único `(empresa_id, voo_id) WHERE deleted_at IS NULL AND status <> 'cancelado'`.
- Índice único `(empresa_id, numero) WHERE deleted_at IS NULL`.

#### `cv_voo_tripulantes`
Tripulação atribuída a um voo (sem granularidade de etapa). Campos:
- `voo_id INTEGER NOT NULL` → FK `cv_voos`.
- `funcionario_id INTEGER NOT NULL`.
- `funcao TEXT NOT NULL` — CHECK `IN ('PIC', 'SIC', 'COM', 'MEC', 'OUTRO')`.
- `horario_apresentacao`, `horario_dispensa` (TEXT, nullable).
- `observacoes`.
- CHECK: `horario_dispensa >= horario_apresentacao` (quando ambos não-null).
- Índice único `(empresa_id, voo_id, funcionario_id, funcao) WHERE deleted_at IS NULL`.

#### `cv_voo_eventos`
Audit trail completo por voo. Campos:
- `tipo_evento TEXT` — CHECK `IN ('status', 'horario', 'tripulacao', 'rdv', 'ocorrencia', 'observacao', 'sistema')`.
- `status_anterior`, `status_novo` — com CHECK de valores válidos.
- `descricao`, `motivo_id`, `metadata_json`, `usuario_id`.

### 2.2 O que a 0410 resolve

- Schema completo para operação manual N1 (criar voo, editar, avançar status, preencher RDV, registrar tripulação, audit trail).
- RBAC e tenant isolation em todas as tabelas.
- 24 endpoints REST funcionais.
- 36/36 route tests + 11/11 migration tests + 7/7 governance tests passando.
- Dashboard OCC, lista de voos, detalhe de voo, RDV: conectados à API real.

### 2.3 O que a 0410 NÃO resolve

- Nenhuma coluna de rastreabilidade SIGVOOS em `cv_voos` (`sigvoos_flight_report_id`, `sigvoos_report_number`, etc.).
- Nenhuma tabela de etapa/perna (`cv_voo_etapas`).
- `cv_voo_tripulantes` não referencia etapa — só voo; impossibilita tripulação por leg.
- Sem chave de idempotência por `(flight_report.id, leg.number)`.
- Sem staging de payload bruto SIGVOOS.
- Sem tabela de conflitos auditáveis.
- Sem content hash para detectar alterações retroativas.
- Sem `origem_importacao` ou `campos_editados_json`.

---

## 3. Escopo da 0411

### 3.1 O que entra na 0411

| Item | Inclui? |
|------|---------|
| Nova tabela `cv_voo_etapas` | ✅ |
| Novas colunas em `cv_voos` (rastreabilidade SIGVOOS) | ✅ |
| Novas colunas em `cv_voo_tripulantes` (etapa_id, sigvoos_staff_id) | ✅ |
| Tabela de staging `cv_sigvoos_staging` | ✅ (ver seção 7) |
| Tabela de conflitos `cv_conflitos_integracao` | ✅ (ver seção 8) |
| Índices e constraints de idempotência | ✅ |

### 3.2 O que NÃO entra na 0411

| Item | Motivo |
|------|--------|
| Código de importador SIGVOOS → CV | Fase posterior; importador é serviço, não schema |
| Código do adaptador CV → FRMS | Fase posterior ao importador |
| Alteração de `frms_jornada.origem` CHECK | Migration separada, futura |
| Alteração de `frms-source-policy.ts` | Fase posterior à virada canônica |
| Endpoints novos no backend | Fora do escopo de schema |
| Alterações nas telas do frontend | Fora do escopo de schema |
| Dados de seed ou backfill automático | Backfill é operação separada após aprovação |
| Alteração em qualquer migration existente (0001–0410) | Nunca editar migrations históricas |

### 3.3 O que fica para o importador

- Lógica de autenticação, polling, agrupamento e upsert SIGVOOS → `cv_*`.
- Resolução de `funcionario_id` via `staff.inscription` → `funcionarios.matricula`.
- Geração de `sigvoos_content_hash` no momento da importação.
- Criação de pendências quando tripulante não mapeado.
- Atualização de `cv_rdv_operacional` com dados agregados das etapas.

### 3.4 O que fica para o FRMS

- Adapter `cv-frms-adapter.ts` lendo `cv_voo_etapas` e derivando `frms_jornada`.
- Shadow mode comparativo SIGVOOS vs. CONTROLE_VOOS.
- Migration para aceitar `'CONTROLE_VOOS'` em `frms_jornada.origem`.
- Troca da constante `FRMS_CANONICAL_OPERATIONAL_SOURCE` de `'SIGVOOS'` para `'CONTROLE_VOOS'`.
- Atualizações em `db-service-alertas.ts`, `db-service-acumulo.ts`, `frms-daily-check.ts`.

### 3.5 O que fica para eDB/SDRMe futuro

- Records Core com hash chain e assinatura.
- Qualquer entidade com valor legal ou fiscal.
- Integração com operador parceiro ou POI para ANAC.

---

## 4. Nova Tabela `cv_voo_etapas`

### 4.1 Proposta de DDL conceitual

```sql
-- DESIGN CONCEITUAL — NÃO EXECUTAR — apenas referência para aprovação
CREATE TABLE IF NOT EXISTS cv_voo_etapas (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id                 INTEGER NOT NULL,
  voo_id                     INTEGER NOT NULL,       -- FK → cv_voos.id
  numero_etapa               INTEGER NOT NULL,       -- sequência interna (1, 2, 3...)
  sigvoos_leg_number         INTEGER,               -- flight_report_leg.number (nullable, SIGVOOS)
  -- Origem/Destino
  origem_icao                TEXT,                  -- departure_location.icao_code
  destino_icao               TEXT,                  -- arrival_location.icao_code
  -- Horários (string HH:MM, timezone BRT inferido — sem conversão)
  horario_motor_ligado       TEXT,                  -- engine_start_time_str
  horario_decolagem          TEXT,                  -- takeoff_time_str
  horario_pouso              TEXT,                  -- landing_time_str
  horario_motor_desligado    TEXT,                  -- engine_shutoff_time_str (PODE SER NULL)
  -- Tempos calculados (string HH:MM)
  tempo_decolagem_pouso      TEXT,                  -- takeoff_land_time_str
  tempo_total                TEXT,                  -- total_time_str (block time)
  tempo_navegacao            TEXT,                  -- navigation_time_str (horas de voo principal para FRMS)
  tempo_ifr                  TEXT,                  -- ifr_time_str (nullable)
  tempo_noturno              TEXT,                  -- night_time_str (nullable)
  -- Contadores físicos
  pousos_diurnos             INTEGER,               -- day_landings
  pousos_noturnos            INTEGER,               -- night_landings
  starts                     INTEGER,               -- starts (acionamentos de motor)
  -- Passageiros e carga
  pax                        INTEGER,               -- pax
  payload                    REAL,                  -- payload (unidade a confirmar; provavelmente kg)
  -- Combustível
  combustivel_inicio         REAL,                  -- fuel_start (unidade não confirmada; provável kg)
  combustivel_fim            REAL,                  -- fuel_end
  unidade_combustivel        TEXT,                  -- 'KG_ASSUMED' até confirmação formal do fornecedor
  -- Rastreabilidade SIGVOOS
  origem_dados               TEXT NOT NULL DEFAULT 'MANUAL',
  sigvoos_importado_em       TEXT,                  -- timestamp do recebimento do payload
  sigvoos_content_hash       TEXT,                  -- SHA-256 do payload da etapa para detectar alteração
  metadata_sigvoos_json      TEXT,                  -- payload original sanitizado (sem PII sensível)
  -- Auditoria interna
  created_by                 INTEGER,
  updated_by                 INTEGER,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at                 TEXT,
  -- Constraints
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id),
  CHECK (origem_dados IN ('MANUAL', 'SIGVOOS')),
  CHECK (numero_etapa >= 1),
  CHECK (pousos_diurnos IS NULL OR pousos_diurnos >= 0),
  CHECK (pousos_noturnos IS NULL OR pousos_noturnos >= 0),
  CHECK (starts IS NULL OR starts >= 0),
  CHECK (pax IS NULL OR pax >= 0),
  CHECK (payload IS NULL OR payload >= 0),
  CHECK (combustivel_inicio IS NULL OR combustivel_inicio >= 0),
  CHECK (combustivel_fim IS NULL OR combustivel_fim >= 0)
);
```

### 4.2 Especificação de cada campo

| Campo | Tipo | Nullable? | Fonte SIGVOOS | Justificativa |
|-------|------|-----------|--------------|---------------|
| `id` | INTEGER PK AUTOINCREMENT | NOT NULL | — | Chave interna AirTrust |
| `empresa_id` | INTEGER | NOT NULL | — | Multi-tenancy obrigatório |
| `voo_id` | INTEGER | NOT NULL | — | FK → `cv_voos.id`; une etapa ao relatório |
| `numero_etapa` | INTEGER | NOT NULL | `flight_report_leg.number` | Sequência interna; DEFAULT 1 para etapas manuais; CHECK >= 1 |
| `sigvoos_leg_number` | INTEGER | NULLABLE | `flight_report_leg.number` | ID da etapa no SIGVOOS; NULLABLE pois pode não existir na fixture real; usado no índice único |
| `origem_icao` | TEXT | NULLABLE | `departure_location.icao_code` | Código ICAO da origem da etapa; NULLABLE por precaução (testado como presente na documentação) |
| `destino_icao` | TEXT | NULLABLE | `arrival_location.icao_code` | NULLABLE empírico — ausente na fixture real (E4); presente na documentação |
| `horario_motor_ligado` | TEXT | NULLABLE | `engine_start_time_str` | Formato `HH:MM`; proxy de início de jornada para FRMS |
| `horario_decolagem` | TEXT | NULLABLE | `takeoff_time_str` | Formato `HH:MM`; precisão operacional |
| `horario_pouso` | TEXT | NULLABLE | `landing_time_str` | Formato `HH:MM`; confirmado no payload real |
| `horario_motor_desligado` | TEXT | NULLABLE | `engine_shutoff_time_str` | **PODE SER NULL** (E5 — confirmado em payload real); proxy de fim de jornada |
| `tempo_decolagem_pouso` | TEXT | NULLABLE | `takeoff_land_time_str` | Formato `HH:MM`; tempo de voo sem táxi |
| `tempo_total` | TEXT | NULLABLE | `total_time_str` | Formato `HH:MM`; block time completo (motor a motor) |
| `tempo_navegacao` | TEXT | NULLABLE | `navigation_time_str` | Formato `HH:MM`; **campo principal de horas de voo para FRMS** |
| `tempo_ifr` | TEXT | NULLABLE | `ifr_time_str` | NULLABLE confirmado; pode estar ausente |
| `tempo_noturno` | TEXT | NULLABLE | `night_time_str` | NULLABLE confirmado; pode estar ausente |
| `pousos_diurnos` | INTEGER | NULLABLE | `day_landings` | Não observado na fixture real; presente na documentação |
| `pousos_noturnos` | INTEGER | NULLABLE | `night_landings` | Idem |
| `starts` | INTEGER | NULLABLE | `starts` | Acionamentos de motor; relevante para MRO |
| `pax` | INTEGER | NULLABLE | `pax` | Passageiros; não observado na fixture |
| `payload` | REAL | NULLABLE | `payload` | Carga; unidade não confirmada (kg provável) |
| `combustivel_inicio` | REAL | NULLABLE | `fuel_start` | Combustível no início (valor `1086` observado na fixture) |
| `combustivel_fim` | REAL | NULLABLE | `fuel_end` | Combustível no fim (valor `730` observado na fixture) |
| `unidade_combustivel` | TEXT | NULLABLE | — | `'KG_ASSUMED'` até confirmação formal; campo reservado para rastreabilidade de unidade |
| `origem_dados` | TEXT | NOT NULL DEFAULT `'MANUAL'` | — | `'MANUAL'` ou `'SIGVOOS'`; identifica proveniência da linha |
| `sigvoos_importado_em` | TEXT | NULLABLE | — | Timestamp ISO 8601 do recebimento do payload SIGVOOS |
| `sigvoos_content_hash` | TEXT | NULLABLE | — | SHA-256 do payload da etapa; base para detecção de alteração retroativa |
| `metadata_sigvoos_json` | TEXT | NULLABLE | — | Payload original SIGVOOS da etapa, sanitizado; para auditoria e reprocessamento |
| `created_by`, `updated_by` | INTEGER | NULLABLE | — | ID do usuário ou sistema (NULL = sistema automatizado) |
| `created_at`, `updated_at` | TEXT | NOT NULL | — | ISO 8601; padrão AirTrust |
| `deleted_at` | TEXT | NULLABLE | — | Soft delete padrão AirTrust |

### 4.3 Índices propostos para `cv_voo_etapas`

```sql
-- Índice único de idempotência SIGVOOS por etapa
-- Garante que cada (voo, leg_number) do SIGVOOS seja único
CREATE UNIQUE INDEX idx_cv_voo_etapas_voo_sigvoos_leg
  ON cv_voo_etapas (empresa_id, voo_id, sigvoos_leg_number)
  WHERE sigvoos_leg_number IS NOT NULL AND deleted_at IS NULL;

-- Índice de listagem de etapas por voo
CREATE INDEX idx_cv_voo_etapas_empresa_voo_numero
  ON cv_voo_etapas (empresa_id, voo_id, numero_etapa)
  WHERE deleted_at IS NULL;

-- Índice de soft delete
CREATE INDEX idx_cv_voo_etapas_empresa_deleted
  ON cv_voo_etapas (empresa_id, deleted_at);

-- Índice para listagem por data de importação
CREATE INDEX idx_cv_voo_etapas_empresa_importado_em
  ON cv_voo_etapas (empresa_id, sigvoos_importado_em)
  WHERE deleted_at IS NULL;
```

---

## 5. Alterações em `cv_voos`

### 5.1 Novas colunas propostas

```sql
-- DESIGN CONCEITUAL — NÃO EXECUTAR
ALTER TABLE cv_voos ADD COLUMN sigvoos_flight_report_id         INTEGER;
ALTER TABLE cv_voos ADD COLUMN sigvoos_flight_report_id_confident INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cv_voos ADD COLUMN sigvoos_report_number            TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_flight_number            TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_client_name              TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_contract_name            TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_importado_em             TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_content_hash             TEXT;
ALTER TABLE cv_voos ADD COLUMN origem_importacao                TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE cv_voos ADD COLUMN campos_editados_json             TEXT;
```

### 5.2 Especificação de cada coluna

| Coluna | Tipo | Nullable? | Fonte | Justificativa |
|--------|------|-----------|-------|---------------|
| `sigvoos_flight_report_id` | INTEGER | **NULLABLE** | `flight_report.id` | **CRÍTICO: DEVE SER NULLABLE.** A fixture real de produção não tem `flight_report` (achado E3). Não pode ser NOT NULL até teste T1 confirmar presença em 100% dos registros. |
| `sigvoos_flight_report_id_confident` | INTEGER DEFAULT 0 | NOT NULL | — | Flag de confiança: `1` = ID confirmado presente no payload; `0` = chave composta usada como fallback. Permite distinguir idempotência forte vs. fraca. |
| `sigvoos_report_number` | TEXT | NULLABLE | `flight_report.report_number` | Representação textual do ID (ex: `"12043"`). Possivelmente igual ao ID como string, mas armazenar ambos por precaução (documentação sugere que podem divergir em prefixos). |
| `sigvoos_flight_number` | TEXT | NULLABLE | `flight_report.flight_number` | Número operacional do voo (ex: `"507548166"`) — identificador TAF/operacional, distinto do `id`. |
| `sigvoos_client_name` | TEXT | NULLABLE | `flight_report.client.name` | Nome do cliente (ex: `"Petrobras"`). TEXT livre, sem FK — sem tabela de clientes no CV N1. |
| `sigvoos_contract_name` | TEXT | NULLABLE | `flight_report.contract.name` | Nome do contrato. TEXT livre, sem FK. |
| `sigvoos_importado_em` | TEXT | NULLABLE | — | Timestamp ISO 8601 da última importação SIGVOOS bem-sucedida para este voo. |
| `sigvoos_content_hash` | TEXT | NULLABLE | — | SHA-256 do bloco `flight_report` do payload; permite detectar alteração retroativa quando a mesma janela for re-sincronizada. |
| `origem_importacao` | TEXT DEFAULT `'MANUAL'` | NOT NULL | — | Proveniência: `'MANUAL'` (criado pela UI), `'SIGVOOS'` (importado), `'CV_INTERNO'` (gerado por processo interno). Reservar o CHECK para a migration real, pois SQLite não suporta ALTER TABLE ADD COLUMN com CHECK em D1 de forma confiável. |
| `campos_editados_json` | TEXT | NULLABLE | — | JSON array com nomes dos campos que foram editados manualmente após importação. Ex: `["horario_real_partida", "observacoes"]`. Usado pelo importador para proteger campos contra sobrescrita. |

### 5.3 Índice único parcial para `sigvoos_flight_report_id`

```sql
-- Garante unicidade de flight_report_id por empresa, mas apenas quando não-null
-- Permite múltiplos voos com sigvoos_flight_report_id = NULL (manuais ou sem ID confirmado)
CREATE UNIQUE INDEX idx_cv_voos_empresa_sigvoos_fr_id
  ON cv_voos (empresa_id, sigvoos_flight_report_id)
  WHERE sigvoos_flight_report_id IS NOT NULL;
```

**Justificativa da parcialidade:** A auditoria empírica (E3) revelou que `flight_report.id` pode estar ausente em parte dos registros reais. Um índice único completo (sem `WHERE`) vetaria múltiplos voos manuais sem `sigvoos_flight_report_id`, pois todos teriam `NULL` e o SQLite trata múltiplos `NULL` como não-conflitantes — mas isso garante que quando o ID existe, ele é único por empresa.

---

## 6. Alterações em `cv_voo_tripulantes`

### 6.1 Novas colunas propostas

```sql
-- DESIGN CONCEITUAL — NÃO EXECUTAR
ALTER TABLE cv_voo_tripulantes ADD COLUMN etapa_id                      INTEGER;
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_staff_id              INTEGER;
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_staff_inscription      TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN funcao_origem                 TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN resolucao_funcionario_fonte   TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_content_hash          TEXT;
```

### 6.2 Especificação de cada coluna

| Coluna | Tipo | Nullable? | Fonte | Justificativa |
|--------|------|-----------|-------|---------------|
| `etapa_id` | INTEGER | **NULLABLE** | — | FK → `cv_voo_etapas.id`. **NULL = tripulante atribuído ao voo inteiro** (comportamento atual do piloto N1). **NOT NULL = tripulante específico de etapa importada do SIGVOOS**. Retrocompatibilidade total: registros existentes continuam com `etapa_id = NULL`. |
| `sigvoos_staff_id` | INTEGER | NULLABLE | `staff.id` | ID do tripulante no SIGVOOS (achado C3 — confirmado na documentação, presente na fixture). Permite reconciliação futura sem depender de matrícula. |
| `sigvoos_staff_inscription` | TEXT | NULLABLE | `staff.inscription` | Matrícula como veio do SIGVOOS, antes de normalização. Pode ser integer (`252`) ou string (`"12345"`) — armazenar como TEXT após `toString()`. Preserva o valor original para auditoria. |
| `funcao_origem` | TEXT | NULLABLE | `duty` (somente de `/voo/pesquisa`) | Função como viria do SIGVOOS: `"Piloto"`, `"SIC"`, `"COM"`, etc. NULL quando não disponível (caso normal para `/etapas/pesquisa`). Não substituir o `funcao` existente — `funcao` é o campo AirTrust normalizado; `funcao_origem` é o dado bruto SIGVOOS. |
| `resolucao_funcionario_fonte` | TEXT | NULLABLE | — | Como o `funcionario_id` foi resolvido: `'STAFF_ID'` (por `staff.id` direto), `'MATRICULA'` (por `inscription` normalizada), `'NOME_FUZZY'` (por Levenshtein), `'MANUAL'` (mapeado manualmente), `'NAO_ENCONTRADO'` (pendência). |
| `sigvoos_content_hash` | TEXT | NULLABLE | — | Hash do bloco `{ staff, date }` do payload; detecta alteração de dados de tripulante entre re-sincronizações. |

### 6.3 Retrocompatibilidade

A regra é simples e explícita:

| Cenário | `etapa_id` | Comportamento |
|---------|-----------|--------------|
| Tripulante criado manualmente na UI N1 | `NULL` | Atribuído ao voo inteiro. Sem granularidade de etapa. Comportamento atual do piloto. |
| Tripulante importado do SIGVOOS com `flight_report_leg` conhecido | `NOT NULL` (referência à etapa) | Atribuído à etapa específica. Permite reconstrução por leg para o FRMS. |
| Tripulante SIGVOOS com `flight_report` ausente (E3) | `NULL` | Sem etapa conhecida; importado ao nível do voo como fallback. |

### 6.4 Novos índices propostos para `cv_voo_tripulantes`

```sql
-- Índice único de idempotência: por etapa + staff SIGVOOS
CREATE UNIQUE INDEX idx_cv_voo_tripulantes_etapa_staff_sigvoos
  ON cv_voo_tripulantes (empresa_id, etapa_id, sigvoos_staff_id)
  WHERE etapa_id IS NOT NULL AND sigvoos_staff_id IS NOT NULL AND deleted_at IS NULL;

-- Índice para busca por etapa
CREATE INDEX idx_cv_voo_tripulantes_empresa_etapa
  ON cv_voo_tripulantes (empresa_id, etapa_id)
  WHERE deleted_at IS NULL;

-- Índice para busca por sigvoos_staff_id
CREATE INDEX idx_cv_voo_tripulantes_empresa_sigvoos_staff
  ON cv_voo_tripulantes (empresa_id, sigvoos_staff_id)
  WHERE deleted_at IS NULL;
```

---

## 7. Tabela de Staging SIGVOOS

### 7.1 Avaliação: incluir na 0411?

**Recomendação: SIM — incluir `cv_sigvoos_staging` na 0411.**

Justificativa:
- O staging é infraestrutura de schema, não de lógica de negócio.
- Sem o staging, o importador precisará de uma migration separada antes de ser implementado.
- A tabela não tem dependências de lógica — é um repositório de payloads.
- Incluir na 0411 simplifica o roadmap: quando o importador existir, o schema já está pronto.
- O design das Decisões Fase 0 (`docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`, seção 5) já prevê `cv_sigvoos_staging` como parte do schema.

### 7.2 DDL conceitual de `cv_sigvoos_staging`

```sql
-- DESIGN CONCEITUAL — NÃO EXECUTAR
CREATE TABLE IF NOT EXISTS cv_sigvoos_staging (
  id                      TEXT PRIMARY KEY,         -- UUID gerado pelo importador
  empresa_id              INTEGER NOT NULL,
  -- Identificação do registro SIGVOOS
  sigvoos_flight_report_id INTEGER,                 -- flight_report.id (nullable — E3)
  sigvoos_leg_number      INTEGER,                  -- flight_report_leg.number (nullable)
  sigvoos_staff_id        INTEGER,                  -- staff.id
  data_operacional        TEXT NOT NULL,            -- data do voo (YYYY-MM-DD normalizada)
  source_window_start     TEXT NOT NULL,            -- início da janela de sync (YYYY-MM-DD)
  source_window_end       TEXT NOT NULL,            -- fim da janela de sync (YYYY-MM-DD)
  -- Payload
  payload_hash            TEXT NOT NULL,            -- SHA-256 do payload bruto (para dedup)
  payload_sanitizado_json TEXT,                     -- payload original sanitizado (sem tokens, sem credenciais)
  -- Processamento
  import_status           TEXT NOT NULL DEFAULT 'PENDING',
  cv_voo_id               INTEGER,                  -- FK → cv_voos.id (quando processado)
  cv_etapa_id             INTEGER,                  -- FK → cv_voo_etapas.id (quando processado)
  cv_tripulante_id        INTEGER,                  -- FK → cv_voo_tripulantes.id (quando processado)
  tentativas              INTEGER NOT NULL DEFAULT 0,
  erro_msg                TEXT,                     -- mensagem de erro sanitizada (sem dados sensíveis)
  processado_em           TEXT,
  -- Auditoria
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at              TEXT,
  -- Constraints
  CHECK (import_status IN ('PENDING', 'PROCESSED', 'ERROR', 'IGNORED', 'CONFLICT'))
);

-- Índice único de dedup por hash de payload
CREATE UNIQUE INDEX idx_cv_sigvoos_staging_empresa_hash
  ON cv_sigvoos_staging (empresa_id, payload_hash)
  WHERE deleted_at IS NULL;

-- Índice para reprocessamento por status
CREATE INDEX idx_cv_sigvoos_staging_empresa_status
  ON cv_sigvoos_staging (empresa_id, import_status, data_operacional)
  WHERE deleted_at IS NULL;

-- Índice por flight_report_id para reconciliação
CREATE INDEX idx_cv_sigvoos_staging_empresa_fr_id
  ON cv_sigvoos_staging (empresa_id, sigvoos_flight_report_id)
  WHERE sigvoos_flight_report_id IS NOT NULL AND deleted_at IS NULL;

-- Índice por janela de sync
CREATE INDEX idx_cv_sigvoos_staging_empresa_window
  ON cv_sigvoos_staging (empresa_id, source_window_start, source_window_end)
  WHERE deleted_at IS NULL;

-- Índice de soft delete
CREATE INDEX idx_cv_sigvoos_staging_empresa_deleted
  ON cv_sigvoos_staging (empresa_id, deleted_at);
```

### 7.3 Notas de design do staging

- `id` é TEXT (UUID) para evitar colisão de AUTOINCREMENT entre workers paralelos.
- `payload_sanitizado_json` é o payload original com campos PII substituídos por tokens (nomes reais → `TRIPULANTE_NN`, matrículas reais → `XXX`). O payload bruto sem sanitização **nunca deve ser salvo em banco de dados** — só em memória durante o processamento.
- `payload_hash` é SHA-256 do payload **antes** da sanitização, mas calculado **sem campos sensíveis** (sem token, sem credenciais). Permite detectar payloads idênticos sem revelar conteúdo.
- `tentativas` limita re-tentativas automáticas. Importador não deve tentar indefinidamente.
- `processado_em` é o timestamp de quando o status saiu de `'PENDING'`.

---

## 8. Tabela de Conflitos de Integração

### 8.1 Avaliação: incluir na 0411?

**Recomendação: SIM — incluir `cv_conflitos_integracao` na 0411.**

Justificativa:
- É infraestrutura de schema, independente do importador.
- O modelo de conflitos foi definido nas Decisões Fase 0 (seção 5) como parte do design aprovado.
- Sem a tabela, o importador não tem onde registrar conflitos e precisa de migration adicional.
- A tabela é simples e não tem dependências complexas de lógica.

### 8.2 DDL conceitual de `cv_conflitos_integracao`

```sql
-- DESIGN CONCEITUAL — NÃO EXECUTAR
CREATE TABLE IF NOT EXISTS cv_conflitos_integracao (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id          INTEGER NOT NULL,
  -- Entidade em conflito
  entidade_tipo       TEXT NOT NULL,               -- 'voo', 'etapa', 'tripulante'
  entidade_id         INTEGER NOT NULL,            -- ID da entidade (cv_voos.id, cv_voo_etapas.id, etc.)
  campo               TEXT NOT NULL,               -- nome do campo em conflito (ex: 'horario_real_partida')
  -- Valores em conflito
  valor_airtrust      TEXT,                        -- valor atual no AirTrust (serializado como TEXT)
  valor_sigvoos       TEXT,                        -- novo valor recebido do SIGVOOS (serializado como TEXT)
  staging_id          TEXT,                        -- FK → cv_sigvoos_staging.id (rastreabilidade do payload)
  -- Resolução
  severidade          TEXT NOT NULL DEFAULT 'MEDIA',
  status              TEXT NOT NULL DEFAULT 'ABERTO',
  resolvido_por       INTEGER,                     -- funcionario_id do usuário que resolveu
  resolvido_em        TEXT,
  decisao             TEXT,                        -- 'MANTER_AIRTRUST', 'ACEITAR_SIGVOOS', 'IGNORAR'
  justificativa       TEXT,                        -- observação livre do usuário
  -- Auditoria
  created_by          INTEGER,
  updated_by          INTEGER,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at          TEXT,
  -- Constraints
  CHECK (entidade_tipo IN ('voo', 'etapa', 'tripulante')),
  CHECK (severidade IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA')),
  CHECK (status IN ('ABERTO', 'RESOLVIDO', 'IGNORADO')),
  CHECK (decisao IS NULL OR decisao IN ('MANTER_AIRTRUST', 'ACEITAR_SIGVOOS', 'IGNORAR'))
);

-- Índice único: no máximo 1 conflito aberto por campo+entidade (evitar duplicação)
CREATE UNIQUE INDEX idx_cv_conflitos_empresa_entidade_campo_aberto
  ON cv_conflitos_integracao (empresa_id, entidade_tipo, entidade_id, campo)
  WHERE status = 'ABERTO' AND deleted_at IS NULL;

-- Índice para listagem de conflitos abertos
CREATE INDEX idx_cv_conflitos_empresa_status_severidade
  ON cv_conflitos_integracao (empresa_id, status, severidade, created_at)
  WHERE deleted_at IS NULL;

-- Índice por entidade
CREATE INDEX idx_cv_conflitos_empresa_entidade
  ON cv_conflitos_integracao (empresa_id, entidade_tipo, entidade_id)
  WHERE deleted_at IS NULL;

-- Índice de soft delete
CREATE INDEX idx_cv_conflitos_empresa_deleted
  ON cv_conflitos_integracao (empresa_id, deleted_at);
```

### 8.3 Notas de design de conflitos

- `valor_airtrust` e `valor_sigvoos` são serializado como TEXT (ISO 8601 para datas, string numérica para números). Isso simplifica o schema sem precisar de colunas tipadas por domínio.
- `staging_id` é a rastreabilidade reversa: permite saber exatamente qual payload do SIGVOOS gerou o conflito, sem precisar re-consultar a API.
- `severidade` segue a convenção: `CRITICA` = campo de segurança ou FRMS (ex: `horario_motor_ligado`), `ALTA` = campo operacional chave, `MEDIA` = campo de metadata, `BAIXA` = campo de rastreabilidade.

---

## 9. Índices e Constraints — Visão Consolidada

### 9.1 Novos índices por tabela

| Tabela | Índice | Tipo | Condição |
|--------|--------|------|---------|
| `cv_voos` | `(empresa_id, sigvoos_flight_report_id)` | UNIQUE | `WHERE sigvoos_flight_report_id IS NOT NULL` |
| `cv_voo_etapas` | `(empresa_id, voo_id, sigvoos_leg_number)` | UNIQUE | `WHERE sigvoos_leg_number IS NOT NULL AND deleted_at IS NULL` |
| `cv_voo_etapas` | `(empresa_id, voo_id, numero_etapa)` | INDEX | `WHERE deleted_at IS NULL` |
| `cv_voo_etapas` | `(empresa_id, sigvoos_importado_em)` | INDEX | `WHERE deleted_at IS NULL` |
| `cv_voo_etapas` | `(empresa_id, deleted_at)` | INDEX | — |
| `cv_voo_tripulantes` | `(empresa_id, etapa_id, sigvoos_staff_id)` | UNIQUE | `WHERE etapa_id IS NOT NULL AND sigvoos_staff_id IS NOT NULL AND deleted_at IS NULL` |
| `cv_voo_tripulantes` | `(empresa_id, etapa_id)` | INDEX | `WHERE deleted_at IS NULL` |
| `cv_voo_tripulantes` | `(empresa_id, sigvoos_staff_id)` | INDEX | `WHERE deleted_at IS NULL` |
| `cv_sigvoos_staging` | `(empresa_id, payload_hash)` | UNIQUE | `WHERE deleted_at IS NULL` |
| `cv_sigvoos_staging` | `(empresa_id, import_status, data_operacional)` | INDEX | `WHERE deleted_at IS NULL` |
| `cv_sigvoos_staging` | `(empresa_id, sigvoos_flight_report_id)` | INDEX | `WHERE sigvoos_flight_report_id IS NOT NULL AND deleted_at IS NULL` |
| `cv_sigvoos_staging` | `(empresa_id, source_window_start, source_window_end)` | INDEX | `WHERE deleted_at IS NULL` |
| `cv_sigvoos_staging` | `(empresa_id, deleted_at)` | INDEX | — |
| `cv_conflitos_integracao` | `(empresa_id, entidade_tipo, entidade_id, campo)` | UNIQUE | `WHERE status = 'ABERTO' AND deleted_at IS NULL` |
| `cv_conflitos_integracao` | `(empresa_id, status, severidade, created_at)` | INDEX | `WHERE deleted_at IS NULL` |
| `cv_conflitos_integracao` | `(empresa_id, entidade_tipo, entidade_id)` | INDEX | `WHERE deleted_at IS NULL` |
| `cv_conflitos_integracao` | `(empresa_id, deleted_at)` | INDEX | — |

### 9.2 Constraints de validação (cv_voo_etapas)

```sql
CHECK (numero_etapa >= 1)
CHECK (pousos_diurnos IS NULL OR pousos_diurnos >= 0)
CHECK (pousos_noturnos IS NULL OR pousos_noturnos >= 0)
CHECK (starts IS NULL OR starts >= 0)
CHECK (pax IS NULL OR pax >= 0)
CHECK (payload IS NULL OR payload >= 0)
CHECK (combustivel_inicio IS NULL OR combustivel_inicio >= 0)
CHECK (combustivel_fim IS NULL OR combustivel_fim >= 0)
CHECK (origem_dados IN ('MANUAL', 'SIGVOOS'))
```

### 9.3 Observação sobre CHECK em `cv_voos`

O SQLite D1 (versão usada pelo Cloudflare) **não suporta `ADD COLUMN ... CHECK(...)` via `ALTER TABLE`** de forma confiável. Os CHECKs em novas colunas de `cv_voos` devem ser validados na camada de aplicação (no importador), não no banco. Se necessário, criar tabela temporária com novo schema e copiar dados — mas isso é complexidade para a migration real, não para este design.

---

## 10. Multi-Tenant e RBAC

### 10.1 Regra de ouro

**Todas as novas tabelas têm `empresa_id INTEGER NOT NULL`.** Toda query que acessa dados de tenant deve incluir `WHERE empresa_id = ?` como primeira cláusula do filtro ou como JOIN obrigatório. Nunca omitir.

### 10.2 Joins com validação de tenant

```sql
-- Correto: empresa_id em cada JOIN
SELECT e.*, t.sigvoos_staff_id
FROM cv_voo_etapas e
JOIN cv_voo_tripulantes t ON t.etapa_id = e.id AND t.empresa_id = ?
WHERE e.empresa_id = ? AND e.voo_id = ?;

-- Errado: sem empresa_id no JOIN (permite cross-tenant)
SELECT e.*, t.sigvoos_staff_id
FROM cv_voo_etapas e
JOIN cv_voo_tripulantes t ON t.etapa_id = e.id
WHERE e.empresa_id = ?;
```

### 10.3 Cross-tenant deve ser bloqueado

- `cv_voo_etapas.empresa_id` deve sempre ser igual a `cv_voos.empresa_id` do `voo_id` referenciado.
- `cv_voo_tripulantes.empresa_id` deve sempre ser igual a `cv_voo_etapas.empresa_id` do `etapa_id` referenciado.
- `cv_sigvoos_staging.empresa_id` e `cv_conflitos_integracao.empresa_id` devem ser verificados em toda operação de leitura e escrita.

### 10.4 RBAC para as novas tabelas

As novas tabelas seguem o mesmo RBAC do resto do Controle de Voos:

| Operação | Requisito mínimo |
|----------|-----------------|
| Leitura de etapas/tripulantes/staging | `auth()` (qualquer usuário autenticado) |
| Escrita/importação | `requireControleVoosWrite()` (mínimo: `editor`) |
| Resolução de conflitos | `requireControleVoosWrite()` (mínimo: `editor`) |
| Acesso a staging bruto | `admin` ou `manager` |
| Trigger de importação manual | `admin` ou `manager` |

### 10.5 Testes obrigatórios de isolamento

- Empresa A não pode ler `cv_voo_etapas` de empresa B.
- Empresa A não pode resolver conflito de empresa B.
- `cv_sigvoos_staging` de empresa A não pode ser processado como empresa B.
- Upsert de tripulante com `etapa_id` de outra empresa deve falhar com erro explícito.

---

## 11. Compatibilidade com Piloto N1 Atual

### 11.1 Garantia de compatibilidade

A migration 0411 é **totalmente aditiva**. Nenhuma das seguintes operações do piloto N1 é afetada:

| Operação N1 | Impacto da 0411 |
|------------|----------------|
| Criar voo manualmente | Zero — novas colunas têm DEFAULT ou são NULLABLE |
| Editar voo | Zero — nenhuma NOT NULL sem DEFAULT adicionada a `cv_voos` |
| Avançar status de voo | Zero — máquina de estados não muda |
| Preencher RDV | Zero — `cv_rdv_operacional` não muda |
| Adicionar tripulante ao voo | Zero — `etapa_id` é NULLABLE (DEFAULT NULL) |
| Ver dashboard OCC | Zero — nenhuma query existente muda |
| Ver relatórios | Zero — nenhuma query de relatório existente muda |
| Audit trail (`cv_voo_eventos`) | Zero — tabela não muda |

### 11.2 Voos manuais sem etapas explícitas

Voos criados manualmente no piloto N1:
- Não têm `cv_voo_etapas` associadas (zero linhas na nova tabela).
- Não têm `sigvoos_flight_report_id` (NULL por padrão).
- `cv_voo_tripulantes` com `etapa_id = NULL` = tripulação no nível do voo (comportamento atual).
- `cv_rdv_operacional` continua sendo a fonte de dados agregados do RDV.

### 11.3 Opção de etapa implícita futura

Uma etapa "implícita" pode ser criada futuramente por backfill para voos manuais — uma linha em `cv_voo_etapas` com `numero_etapa = 1` e `origem_dados = 'MANUAL'` para uniformizar a estrutura. Essa operação é opcional e deve ser executada como job separado, não como parte da migration 0411.

### 11.4 RDV continua funcionando

`cv_rdv_operacional` não muda na 0411. Para voos importados do SIGVOOS, o importador futuro poderá atualizar campos do RDV com dados agregados das etapas. Para voos manuais, o RDV continua sendo preenchido pela UI como hoje.

---

## 12. Estratégia de Backfill

### 12.1 Escopo do backfill

O backfill **não é parte da 0411**. A migration 0411 apenas cria o schema. O backfill é uma operação separada que deve ser planejada, aprovada e executada com supervisão após:

1. A 0411 estar aplicada e testada em local/staging.
2. O importador SIGVOOS estar implementado e testado.
3. Uma janela de backfill histórico ter sido definida.

### 12.2 Backfill para voos importados do SIGVOOS

O importador, quando implementado, processará janelas históricas do SIGVOOS (até 90 dias por chamada) e criará `cv_voo_etapas` para cada `flight_report_leg`. O processo é:

```text
Para cada flight_report_id no SIGVOOS:
  1. Criar/atualizar cv_voos com sigvoos_flight_report_id
  2. Para cada leg no flight_report:
     a. Criar cv_voo_etapas com sigvoos_leg_number e dados físicos
     b. Para cada staff na leg:
        → Resolver funcionario_id via inscription
        → Criar cv_voo_tripulantes com etapa_id
  3. Registrar em cv_sigvoos_staging com status = 'PROCESSED'
```

### 12.3 Voos manuais do piloto N1 — sem backfill imediato

Voos criados manualmente durante o piloto N1 **não precisam de backfill imediato**. O piloto valida o fluxo operacional e os dados existem como registros legítimos de `cv_voos` sem `cv_voo_etapas`. A ausência de etapas não é um erro — é o estado esperado para voos manuais.

### 12.4 Riscos do backfill

| Risco | Mitigação |
|-------|-----------|
| Duplicar voos existentes do piloto ao importar SIGVOOS | Importador verifica `sigvoos_flight_report_id` antes de criar; se já existe voo manual com prefixo/data igual, gerar conflito ao invés de duplicar |
| Backfill histórico incompleto (janela > 90 dias) | Dividir em chunks de 90 dias; logar janelas processadas |
| Backfill cria etapas com dados divergentes do RDV manual | Registrar como conflito em `cv_conflitos_integracao`; não sobrescrever automaticamente |
| Performance em produção com grande volume | Executar backfill em off-peak; batch size configurável |

---

## 13. Estratégia de Hash e Detecção de Alteração

### 13.1 Contexto

O SIGVOOS não fornece `updated_at` em nenhum endpoint (achado E9). A única forma de detectar que um registro foi alterado retroativamente é **re-sincronizar a mesma janela de datas** e comparar o conteúdo com o que foi armazenado anteriormente.

### 13.2 Definição de `sigvoos_content_hash`

O hash de conteúdo é um SHA-256 calculado sobre os campos estáveis e representativos do payload SIGVOOS, sem incluir metadados voláteis (timestamps de importação, campos AirTrust, etc.).

**Campos incluídos no hash de etapa (`cv_voo_etapas.sigvoos_content_hash`):**

```text
hash_input = JSON.stringify({
  flight_report_id: flight_report?.id,
  leg_number: flight_report_leg.number,
  departure_icao: flight_report_leg.departure_location?.icao_code,
  arrival_icao: flight_report_leg.arrival_location?.icao_code,
  engine_start: flight_report_leg.engine_start_time_str,
  takeoff: flight_report_leg.takeoff_time_str,
  landing: flight_report_leg.landing_time_str,
  engine_shutoff: flight_report_leg.engine_shutoff_time_str,
  navigation_time: flight_report_leg.navigation_time_str,
  total_time: flight_report_leg.total_time_str,
  night_time: flight_report_leg.night_time_str,
  ifr_time: flight_report_leg.ifr_time_str,
  day_landings: flight_report_leg.day_landings,
  night_landings: flight_report_leg.night_landings,
  starts: flight_report_leg.starts,
  pax: flight_report_leg.pax,
  payload: flight_report_leg.payload,
  fuel_start: flight_report_leg.fuel_start,
  fuel_end: flight_report_leg.fuel_end
})
sigvoos_content_hash = SHA-256(hash_input)
```

**Campos incluídos no hash de tripulante (`cv_voo_tripulantes.sigvoos_content_hash`):**

```text
hash_input = JSON.stringify({
  staff_id: staff.id,
  staff_inscription: staff.inscription,
  date: date,
  flight_report_id: flight_report?.id,
  leg_number: flight_report_leg?.number
})
sigvoos_content_hash = SHA-256(hash_input)
```

**Campos incluídos no hash de voo (`cv_voos.sigvoos_content_hash`):**

```text
hash_input = JSON.stringify({
  flight_report_id: flight_report?.id,
  report_number: flight_report?.report_number,
  flight_number: flight_report?.flight_number,
  aircraft_registration: flight_report?.aircraft?.registration,
  flight_type: flight_report?.flight_type?.name,
  client: flight_report?.client?.name,
  contract: flight_report?.contract?.name
})
sigvoos_content_hash = SHA-256(hash_input)
```

### 13.3 Comportamento quando o hash muda

```text
Na re-sincronização da mesma janela de datas:

SE hash_novo == hash_armazenado:
  → Nenhuma ação necessária; atualizar apenas sigvoos_importado_em
  
SE hash_novo != hash_armazenado:
  SE campo não foi editado manualmente (ausente de campos_editados_json):
    → Atualizar campo diretamente; registrar em cv_voo_eventos tipo='sistema'
  SE campo foi editado manualmente (presente em campos_editados_json):
    → NÃO sobrescrever; criar conflito em cv_conflitos_integracao
    → status = 'ABERTO'; severidade conforme tipo do campo
```

### 13.4 Normalização antes do hash

Os campos devem ser normalizados antes do hash para evitar falso positivo por diferença de formato:

- Strings: `trim()`, sem espaços duplos.
- Horários: formato canônico `HH:MM` (sem segundos, sem AM/PM).
- Números: `toString()` sem casas decimais desnecessárias.
- Null: normalizar para `null` (não `undefined`, não string `"null"`).
- `JSON.stringify()` com chaves ordenadas deterministicamente.

---

## 14. Estratégia para Ausência de `flight_report.id`

### 14.1 O problema

O achado E3 da auditoria empírica (`docs/AUDITORIA_EMPIRICA_SIGVOOS_IDS_CAMPOS_E_RISCOS.md`) mostra que a fixture de payload real de produção (2026-04-02) **não contém o objeto `flight_report`**, apenas `flight_report_leg`. Isso diverge da documentação oficial que mostra `flight_report.id` como integer estável.

As hipóteses são:
- A fixture foi simplificada intencionalmente (o dado existe na API mas foi omitido no teste).
- O `flight_report` só aparece em registros com certo status ou tipo.
- A fixture é de um período em que o campo não existia.

Até o teste T1 ser executado (sync real de 7 dias contando presença de `flight_report.id`), o design deve ser **conservador**: tratar `flight_report.id` como possivelmente ausente.

### 14.2 Campos nullable consequentes

| Campo | Decisão |
|-------|---------|
| `cv_voos.sigvoos_flight_report_id` | **NULLABLE** — sem exceção |
| `cv_voo_etapas.sigvoos_leg_number` | **NULLABLE** — sem exceção |
| `cv_sigvoos_staging.sigvoos_flight_report_id` | **NULLABLE** — sem exceção |
| `cv_sigvoos_staging.sigvoos_leg_number` | **NULLABLE** — sem exceção |

### 14.3 Chave composta de fallback

Quando `flight_report.id` estiver ausente, o importador deve usar uma chave composta de fallback para identificar o voo:

```text
fallback_key = SHA-256(JSON.stringify({
  empresa_id,
  data_operacional,
  aircraft_registration: flight_report?.aircraft?.registration,
  engine_start: flight_report_leg.engine_start_time_str,
  departure_icao: flight_report_leg.departure_location?.icao_code
}))
```

Esta chave composta é armazenada em `cv_sigvoos_staging.payload_hash` e usada para dedup dentro da janela. O campo `sigvoos_flight_report_id_confident = 0` sinaliza que a chave composta foi usada.

### 14.4 Logging e auditoria de ausências

O importador deve registrar em `cv_voo_eventos` (tipo `'sistema'`) sempre que processar um registro sem `flight_report.id`:

```json
{
  "tipo_evento": "sistema",
  "metadata_json": {
    "evento": "SIGVOOS_SEM_FLIGHT_REPORT_ID",
    "data_operacional": "YYYY-MM-DD",
    "staff_inscription": "XXX",
    "fallback_key_usada": true
  }
}
```

### 14.5 Quando considerar erro

O importador não deve **abortar** um registro por ausência de `flight_report.id`. Deve:
1. Registrar na coluna de log.
2. Usar o fallback.
3. Marcar `sigvoos_flight_report_id_confident = 0`.
4. Continuar processando.

O único caso em que deve registrar `import_status = 'ERROR'` é quando **nem a chave composta consegue ser calculada** (ex: `departure_icao` e `engine_start` ambos ausentes, tornando a chave inútil).

### 14.6 Condição para tornar NOT NULL no futuro

Após executar o teste T1 e confirmar que `flight_report.id` está presente em 100% dos registros de uma janela de 7 dias, pode-se:
1. Criar uma migration adicional que adiciona `CHECK (sigvoos_flight_report_id IS NOT NULL)` quando `sigvoos_flight_report_id_confident = 1`.
2. Ou simplesmente confiar na presença do campo no importador com log de exceção quando ausente.

Não criar migration NOT NULL retroativa para registros já inseridos sem o campo.

---

## 15. Estratégia para `duty` (Função do Tripulante)

### 15.1 Situação atual

O campo `duty` (ex: `"Piloto"`, `"SIC"`, `"COM"`) está disponível **apenas** no endpoint `/api/relatorios/voo/pesquisa` com `range=1`, na estrutura flat. No endpoint principal utilizado pelo AirTrust (`/etapas/pesquisa`), `duty` **não existe** (achado E8, confirmado por documentação e código).

### 15.2 `duty` não bloqueia a 0411

O schema da 0411 **não depende de `duty`**. A coluna `funcao` existente em `cv_voo_tripulantes` aceita `NULL` implicitamente para registros importados sem função conhecida. A coluna `funcao_origem` adicionada pela 0411 armazena o valor bruto do SIGVOOS quando disponível, sem força-lo.

### 15.3 Estratégia para o importador (fase futura)

| Fase | Ação |
|------|------|
| Fase 1 (importador inicial) | Importar sem `duty`; `funcao = NULL` ou `'OUTRO'` para tripulantes SIGVOOS sem função conhecida |
| Fase 2 (enriquecimento) | Chamar `/voo/pesquisa` (range=1) para registros sem `funcao`; cruzar por `inscription` + `flight_report`; preencher `funcao_origem` |
| Fase 3 (se SIGVOOS adicionar `duty` ao endpoint de etapas) | Usar diretamente; sem cruzamento necessário |

### 15.4 Campos reservados no schema

A coluna `funcao_origem TEXT` em `cv_voo_tripulantes` é o campo reservado para a função SIGVOOS futura. Ela não conflita com `funcao TEXT NOT NULL` existente — são campos distintos:

- `funcao` = função no AirTrust (normalizada: `PIC/SIC/COM/MEC/OUTRO`), preenchida manualmente ou mapeada.
- `funcao_origem` = texto livre do SIGVOOS quando disponível via cruzamento futuro.

---

## 16. Estratégia para CANAC/Staff

### 16.1 Conclusão da auditoria empírica

`staff.canac` e `staff.codigo_anac` **NÃO EXISTEM** nos payloads reais do endpoint `/etapas/pesquisa` (achado E1, confirmado empiricamente — o normalizador tenta e obtém null). A documentação oficial também não mostra esses campos.

**Decisão: não depender de CANAC. O CANAC não é chave de resolução de tripulante.**

### 16.2 Chave primária de resolução

A resolução de tripulante segue esta cascata de prioridade:

1. `sigvoos_staff_id` → se já existe mapeamento em `sigvoos_mapeamento_manual` por `staff.id`, usar diretamente.
2. `staff.inscription` (normalizado) → `funcionarios.matricula`. `normalizarInscription(252)` → `"00252"` deve bater com matrícula no banco.
3. Fuzzy match por nome (Levenshtein ≥ 0.86) — apenas como fallback de última instância.
4. Mapeamento manual na UI de integração.

### 16.3 Armazenar `sigvoos_staff_id`

A coluna `cv_voo_tripulantes.sigvoos_staff_id` armazena `staff.id` do SIGVOOS. Isso permite que futuras consultas à API de tripulantes (se existir) resolvam diretamente por ID, sem depender de matrícula. É um investimento de rastreabilidade sem custo operacional imediato.

### 16.4 Tratar `inscription` integer

A auditoria empírica (E2) confirma que `staff.inscription` pode ser integer no payload real (`252`, não `"12345"`). O importador deve normalizar:

```typescript
// Normalizar inscription para string com padding de 5 dígitos
const inscricaoNormalizada = String(staff.inscription ?? '').replace(/\D/g, '').padStart(5, '0');
// "252" → "00252"
// "12345" → "12345"
```

E armazenar em `sigvoos_staff_inscription` o valor original bruto (antes da normalização), para auditoria.

### 16.5 Registrar pendência quando não mapear

Se a cascata de resolução falhar (nenhum `funcionario_id` encontrado):

1. **Não criar** `cv_voo_tripulantes` sem `funcionario_id` válido (campo NOT NULL existente).
2. Criar linha em `cv_sigvoos_staging` com `import_status = 'CONFLICT'`.
3. Registrar em `cv_voo_eventos` tipo `'sistema'` com metadata indicando tripulante não mapeado.
4. Tornar disponível na tela de pendências de integração (admin/manager).

---

## 17. Impacto no FRMS

### 17.1 A 0411 não muda o FRMS

A migration 0411 **não altera nenhuma tabela FRMS**. Especificamente:

- `frms_jornada` — sem alteração.
- `frms-source-policy.ts` — sem alteração; `FRMS_CANONICAL_OPERATIONAL_SOURCE = 'SIGVOOS'` permanece.
- `syncSigvoosForFrms()` — sem alteração; continua operando normalmente.
- Cron `*/10 * * * *` — sem alteração.
- Alertas, acumulados, rolling — sem alteração.

### 17.2 A 0411 prepara dados para adapter futuro

A nova estrutura de `cv_voo_etapas` é exatamente o que o futuro `cv-frms-adapter.ts` precisará para derivar `frms_jornada`:

```text
cv-frms-adapter (futuro):
  Para cada tripulante com etapas no dia:
    MIN(horario_motor_ligado)  → hora_inicio_jornada (proxy)
    MAX(horario_motor_desligado) → hora_fim_jornada (proxy)
    SUM(tempo_navegacao)       → horas_voo
    SUM(tempo_noturno)         → tempo_noturno (nullable)
    SUM(tempo_ifr)             → tempo_ifr (nullable)
    funcionario_id             → tripulante_id FRMS
    data operacional           → data_jornada
```

Mas isso é lógica de serviço, não schema. A 0411 apenas garante que os dados estarão disponíveis.

### 17.3 `frms-source-policy.ts` não deve mudar

O arquivo [`worker-airtrust/src/lib/frms/frms-source-policy.ts`](../worker-airtrust/src/lib/frms/frms-source-policy.ts) (linha 7) define:

```typescript
export const FRMS_CANONICAL_OPERATIONAL_SOURCE = 'SIGVOOS' as const;
```

Esta constante **não muda** durante a 0411 nem durante a fase de importador. Ela só muda na virada canônica FRMS (Marco 7), após shadow mode aprovado com 11 gates cumpridos. Qualquer alteração prematura geraria alertas/acumulados incorretos.

### 17.4 Shadow mode só depois do importador

A sequência correta permanece:

```
0411 (schema) → importador SIGVOOS→CV → dados em cv_voo_etapas
→ cv-frms-adapter (shadow mode, origem='CONTROLE_VOOS', fora do operacional)
→ comparação 7+ dias → gates cumpridos → virada canônica
```

A 0411 é o pré-requisito do importador. O importador é o pré-requisito do shadow mode. O shadow mode é o pré-requisito da virada.

---

## 18. Impacto na Preparação ANAC

### 18.1 A 0411 não cria sistema regulado

A migration 0411 é infraestrutura de dados operacional interna. Não transforma o Controle de Voos em:

- eDB (Diário de Bordo Digital) regulado.
- SDRMe.
- Sistema com validade legal, fiscal ou regulatória.
- Sistema aprovado ou homologado pela ANAC.
- Sistema equivalente ao SIGVOOS oficial ou ao APUS.

### 18.2 Não usar como alegação de conformidade

O schema da 0411 **não deve ser apresentado** como evidência de conformidade, preparação para auditoria, substituição de sistema oficial ou capacidade regulatória. O Controle de Voos N1 permanece explicitamente marcado como sistema de gestão operacional interna, sem status regulatório.

### 18.3 A 0411 melhora maturidade de dados

Modelar corretamente a granularidade (flight report → etapa → tripulante) é um passo de maturidade arquitetural que, sem ter valor regulatório agora, prepara o terreno para:

- Rastreabilidade de etapa com origem/destino/horários/pousos auditáveis.
- Idempotência documentada por chave estável.
- Controle de conflitos com resolução auditável.
- Função do tripulante por etapa quando disponível.

Quando — e se — o AirTrust avançar para conversa formal com a ANAC sobre eDB ou SDRMe, a existência desta estrutura será evidência de maturidade arquitetural, não de autorização.

### 18.4 Roadmap futuro (sem implementar agora)

```text
cv_voos N1 + cv_voo_etapas (0411) → maturidade N1 operacional
  → fase N2: auditoria forte, export rastreável
  → fase N3: Records Core, hash chain, assinatura
  → fase N4: conversa com ANAC, operador parceiro, POI, aceite formal
  → eDB (assinatura PIC) — entidade separada
  → SDRMe — entidade separada
```

A 0411 é um tijolo do N1 → N2. Não é atalho para N4.

---

## 19. Testes Obrigatórios para Futura Implementação

Os seguintes testes devem existir antes da 0411 ser aplicada em qualquer ambiente não-local.

### 19.1 Testes de migration

| # | Teste | O que verifica |
|---|-------|---------------|
| T-M-01 | Migration aplica limpa em banco vazio | Zero erros SQL |
| T-M-02 | Migration é idempotente (`IF NOT EXISTS`) | Re-aplicação não gera erro |
| T-M-03 | `cv_voo_etapas` existe com todos os campos esperados | Schema correto |
| T-M-04 | `cv_sigvoos_staging` existe com todos os campos esperados | Schema correto |
| T-M-05 | `cv_conflitos_integracao` existe com todos os campos esperados | Schema correto |
| T-M-06 | Novas colunas em `cv_voos` existem | `sigvoos_flight_report_id`, etc. |
| T-M-07 | Novas colunas em `cv_voo_tripulantes` existem | `etapa_id`, `sigvoos_staff_id`, etc. |
| T-M-08 | Todos os índices novos existem | Verificar `sqlite_master` |
| T-M-09 | Índice único parcial `sigvoos_flight_report_id` funciona | Dois registros com NULL: OK; dois com mesmo ID não-null: ERRO |
| T-M-10 | Índice único parcial `sigvoos_leg_number` funciona | Mesmo `voo_id` + mesmo `leg_number` não-null: ERRO |
| T-M-11 | Voos e RDVs existentes do piloto não são afetados | SELECT count pré/pós migration: mesmo resultado |

### 19.2 Testes de isolamento tenant

| # | Teste | O que verifica |
|---|-------|---------------|
| T-T-01 | Empresa A não lê etapas de empresa B | Query com empresa_id de A retorna zero de B |
| T-T-02 | Empresa A não resolve conflito de empresa B | UPDATE com WHERE empresa_id=A não toca B |
| T-T-03 | Tripulante em etapa de empresa A não visível para empresa B | JOIN com empresa_id correto |
| T-T-04 | Staging de empresa A não processado como empresa B | Verificar WHERE em toda query de processamento |

### 19.3 Testes de idempotência

| # | Teste | O que verifica |
|---|-------|---------------|
| T-I-01 | Inserir mesmo `sigvoos_flight_report_id` duas vezes: conflito | Segundo INSERT deve gerar violação de índice único |
| T-I-02 | Inserir `sigvoos_flight_report_id = NULL` duas vezes: OK | SQLite trata múltiplos NULL como não-conflitantes no índice parcial |
| T-I-03 | Mesmo `(voo_id, sigvoos_leg_number)` duas vezes: conflito | Violação de índice único |
| T-I-04 | Inserir etapa sem `sigvoos_leg_number` (NULL) duas vezes: OK | Índice parcial com `WHERE sigvoos_leg_number IS NOT NULL` |
| T-I-05 | Upsert via `ON CONFLICT DO UPDATE`: atualiza em vez de duplicar | Verificar campo atualizado |

### 19.4 Testes de fallback sem `flight_report.id`

| # | Teste | O que verifica |
|---|-------|---------------|
| T-F-01 | Voo sem `sigvoos_flight_report_id` pode ser inserido | NOT NULL constraint ausente |
| T-F-02 | `sigvoos_flight_report_id_confident = 0` quando fallback usado | Flag correta |
| T-F-03 | Log de ausência registrado em `cv_voo_eventos` | Evento tipo `'sistema'` criado |
| T-F-04 | Fallback key é calculada corretamente | Hash determinístico |

### 19.5 Testes de hash

| # | Teste | O que verifica |
|---|-------|---------------|
| T-H-01 | Hash muda quando `engine_start_time_str` muda | SHA-256 diferente |
| T-H-02 | Hash não muda quando campo AirTrust (ex: `observacoes`) muda | Apenas campos SIGVOOS no hash |
| T-H-03 | Hash é idêntico para payload normalizado equivalente (trim, lowercase) | Normalização correta |
| T-H-04 | Alteração de `pax` gera hash diferente | Campo incluído no hash |

### 19.6 Testes de retrocompatibilidade

| # | Teste | O que verifica |
|---|-------|---------------|
| T-R-01 | Criar voo manualmente sem campos SIGVOOS: OK | Novas colunas aceitam NULL/DEFAULT |
| T-R-02 | `cv_voo_tripulantes` com `etapa_id = NULL`: OK | Comportamento do piloto N1 preservado |
| T-R-03 | RDV existente após migration: não afetado | Dados do piloto não alterados |
| T-R-04 | 36 route tests existentes continuam passando | Zero regressão |
| T-R-05 | 11 migration tests existentes continuam passando | Zero regressão |

---

## 20. Critérios de Aprovação Antes de Implementar

Checklist que deve ser completado antes de qualquer `wrangler d1 execute` da 0411:

### 20.1 Aprovações

- [ ] Este design aprovado explicitamente pelo responsável técnico do projeto.
- [ ] Auditoria empírica (`docs/AUDITORIA_EMPIRICA_SIGVOOS_IDS_CAMPOS_E_RISCOS.md`) lida e entendida.
- [ ] Decisão de modelagem Opção B (`docs/CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md`) confirmada.
- [ ] Decisões Fase 0 (`docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`) revisadas.

### 20.2 Piloto N1

- [ ] Piloto N1 executado ou em andamento (para coletar feedback antes do schema change).
- [ ] Nenhum bloqueador operacional identificado no piloto que afete o design da 0411.

### 20.3 Riscos aceitos

- [ ] Risco de `flight_report.id` nullable aceito formalmente (E3).
- [ ] Risco de `staff.canac` ausente aceito; resolução por `inscription` confirmada.
- [ ] Risco de timezone não confirmado documentado; horários armazenados como strings sem conversão.
- [ ] Risco de `duty` ausente aceito; `funcao = NULL` para fase inicial do importador.

### 20.4 Testes

- [ ] Todos os testes da seção 19 definidos e implementados.
- [ ] Migration testada localmente (`wrangler d1 execute --local`) sem erros.
- [ ] 36 route tests + 11 migration tests existentes passando após 0411.
- [ ] Novo teste de governance da 0411 passando.

### 20.5 Plano de rollback

- [ ] Rollback da 0411 documentado.
- [ ] Rollback testado localmente: DROP TABLE `cv_voo_etapas`, `cv_sigvoos_staging`, `cv_conflitos_integracao`; DROP INDEX novos; (novas colunas em SQLite não podem ser removidas via ALTER TABLE — mitigação: aceitar residual ou recriar tabela).
- [ ] Acordo sobre: se rollback for necessário em produção, dados inseridos nas novas tabelas serão perdidos.

### 20.6 Sequenciamento

- [ ] 0411 será aplicada em local primeiro, depois em staging aprovado, depois em produção com autorização explícita separada.
- [ ] Nunca aplicar 0411 em produção sem confirmação explícita separada desta checklist para o ambiente de produção.

---

## 21. Próxima Etapa Recomendada

Há três caminhos possíveis a partir deste documento, dependendo do estado do projeto:

### Caminho A — Executar piloto N1 antes de qualquer schema change

**Quando usar:** O piloto N1 ainda não foi executado ou está em andamento.

**Ação:** Executar o piloto N1 conforme `docs/AIRTRUST_STATUS_CONTROLE_VOOS_SIGVOOS_FRMS_ANAC.md`. Coletar feedback operacional. Identificar ajustes necessários no schema da 0411 antes de implementá-la.

**Benefício:** O piloto pode revelar campos operacionais importantes que não foram considerados no design da 0411 (ex: campo de "número de voo" diferente do `sigvoos_flight_number`, ou campo de "cliente" já existente na UI de criação manual).

**Bloqueante:** Nenhum. O piloto não depende da 0411.

### Caminho B — Executar testes empíricos T1–T9 com credenciais SIGVOOS

**Quando usar:** Credenciais SIGVOOS estão disponíveis em ambiente controlado e é necessário confirmar a presença de `flight_report.id` antes de implementar.

**Testes prioritários:**

| Teste | Ação | Resultado esperado |
|-------|------|-------------------|
| T1 | Sync de 7 dias; contar registros com/sem `flight_report.id` | Definir se NULLABLE é precaução ou necessidade |
| T2 | Mesma janela 2×; verificar estabilidade dos IDs | Confirmar que IDs são imutáveis |
| T3 | Contar registros com `flight_report_leg.number` | Confirmar início em 1 |
| T5 | Contar presença de `arrival_location` | Confirmar NULLABLE necessário |

**Benefício:** Reduz riscos R1 e R7 antes de implementar.

**Bloqueante:** Requer credenciais SIGVOOS em ambiente controlado.

### Caminho C — Implementar 0411 com alto esforço (após aprovação do design)

**Quando usar:** Piloto N1 executado, design aprovado, riscos aceitos, testes definidos.

**Ação:** Implementar a migration 0411 real em SQL, com todos os testes da seção 19, e aplicar em local/staging.

**Esforço recomendado:** Alto — usar Codex 5.5 com alta inteligência para garantir:
- DDL completo e correto para D1 (SQLite).
- Testes de migration com suite completa.
- Verificação de retrocompatibilidade com 36 route tests existentes.
- Zero SQL que possa alterar tabelas existentes de forma destrutiva.

**Sequência da implementação:**

```text
1. Criar worker-airtrust/migrations/0411_controle_voos_n1_etapas_sigvoos.sql
2. Criar worker-airtrust/src/__tests__/migrations/controle-voos-0411.test.ts
3. npm run test:worker (verificar zero regressão)
4. wrangler d1 execute --local (verificar aplicação limpa)
5. npm run test:all (verificar zero regressão end-to-end)
6. Documentar resultado e propor próximo passo
```

**NÃO fazer:** aplicar em produção, integrar SIGVOOS, alterar FRMS, fazer deploy.

---

## Entrega — Resumo Final

### Documento criado

`docs/CONTROLE_DE_VOOS_N1_SCHEMA_0411_DESIGN.md` — este arquivo.

### Tabelas/colunas propostas

| Entidade | Tipo | Campos principais |
|----------|------|------------------|
| `cv_voo_etapas` | Nova tabela | 30 campos: granularidade de leg, horários, tempos, pousos, combustível, hash, metadata |
| `cv_voos` | Novas colunas | 10 colunas: `sigvoos_flight_report_id` (NULLABLE), `sigvoos_*`, `origem_importacao`, `campos_editados_json` |
| `cv_voo_tripulantes` | Novas colunas | 6 colunas: `etapa_id` (NULLABLE), `sigvoos_staff_id`, `sigvoos_staff_inscription`, `funcao_origem`, `resolucao_funcionario_fonte`, `sigvoos_content_hash` |
| `cv_sigvoos_staging` | Nova tabela | 18 campos: payload, hash, status, referências, janela de sync |
| `cv_conflitos_integracao` | Nova tabela | 15 campos: entidade, campo, valores, severidade, resolução, auditoria |

### Decisão crítica: `sigvoos_flight_report_id NULLABLE`

**`cv_voos.sigvoos_flight_report_id` é NULLABLE.**

Justificativa: a fixture de payload real de produção (2026-04-02) não contém o objeto `flight_report` (achado E3 da auditoria empírica). Até o teste T1 confirmar presença de `flight_report.id` em 100% dos registros reais de uma janela de 7 dias, tornar o campo NOT NULL seria um risco de falha de importação para um percentual desconhecido de registros.

O índice único é **parcial**: `WHERE sigvoos_flight_report_id IS NOT NULL` — garante unicidade quando o ID existe, sem vetar registros sem ID.

### Decisão sobre staging/conflitos

Ambas as tabelas (`cv_sigvoos_staging` e `cv_conflitos_integracao`) devem ser incluídas na 0411. São infraestrutura de schema, não de lógica. Incluí-las agora simplifica o roadmap do importador.

### Riscos principais

1. **R1** — `flight_report.id` ausente em parte dos registros: mitigado por NULLABLE + índice parcial + fallback key.
2. **R3** — Timezone não confirmado: mitigado por armazenar horários como strings sem conversão.
3. **R4** — `duty` ausente: aceito; `funcao = NULL` na importação inicial; cruzamento via `/voo/pesquisa` em fase 2.
4. **R5** — Sem `updated_at`: aceito; polling periódico + content hash como mitigação.

### Testes obrigatórios

39 testes definidos na seção 19: migration (11), tenant isolation (4), idempotência (5), fallback sem ID (4), hash (4), retrocompatibilidade (5) + 6 de governance (implícitos).

### Próxima recomendação

**Caminho A** se o piloto N1 ainda não foi executado — executar o piloto antes de qualquer schema change.

**Caminho B** se credenciais SIGVOOS estiverem disponíveis — executar testes T1–T5 para confirmar presença de `flight_report.id`.

**Caminho C** se design aprovado e riscos aceitos — implementar 0411 com Codex 5.5 alto, zero deploy, zero produção.

### Sugestão de commit (quando aprovado para implementar)

```
feat(controle-voos): add 0411 schema for cv_voo_etapas and SIGVOOS traceability

- new table cv_voo_etapas (leg-level granularity for SIGVOOS import)
- new table cv_sigvoos_staging (raw payload staging)
- new table cv_conflitos_integracao (auditable conflict resolution)
- new columns in cv_voos (sigvoos_flight_report_id NULLABLE, traceability fields)
- new columns in cv_voo_tripulantes (etapa_id nullable, sigvoos_staff_id)
- partial unique indexes for idempotency (WHERE sigvoos_flight_report_id IS NOT NULL)
- 39 tests covering migration, tenant isolation, idempotency, and retrocompat

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## Referências

- [`docs/AUDITORIA_EMPIRICA_SIGVOOS_IDS_CAMPOS_E_RISCOS.md`](AUDITORIA_EMPIRICA_SIGVOOS_IDS_CAMPOS_E_RISCOS.md) — auditoria empírica com fixture real de produção
- [`docs/AUDITORIA_API_SIGVOOS_AUTENTICADA.md`](AUDITORIA_API_SIGVOOS_AUTENTICADA.md) — documentação oficial autenticada da API
- [`docs/CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md`](CONTROLE_DE_VOOS_N1_REESTRUTURACAO_POS_SIGVOOS.md) — decisão de modelagem Opção B
- [`docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`](DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md) — decisões da Fase 0
- [`docs/AIRTRUST_STATUS_CONTROLE_VOOS_SIGVOOS_FRMS_ANAC.md`](AIRTRUST_STATUS_CONTROLE_VOOS_SIGVOOS_FRMS_ANAC.md) — status consolidado das frentes
- [`docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md`](AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md) — auditoria técnica do fluxo atual SIGVOOS→FRMS
- [`worker-airtrust/migrations/0410_controle_voos_n1_schema.sql`](../worker-airtrust/migrations/0410_controle_voos_n1_schema.sql) — schema atual (base da 0411)
- [`worker-airtrust/src/lib/frms/frms-source-policy.ts`](../worker-airtrust/src/lib/frms/frms-source-policy.ts) — política de fonte canônica FRMS (não muda na 0411)

---

*Documento criado por: Claude Code*
*Data: 2026-06-14*
*Nenhum código, migration, deploy ou commit foi realizado como parte deste documento.*
*Nenhuma credencial foi acessada, logada ou armazenada.*
*Status: DESIGN TÉCNICO PARA REVISÃO E APROVAÇÃO — não implementar sem aprovação explícita.*
