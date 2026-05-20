# Redesenho do Módulo de Escalas — AirTrust

**Data:** 06/03/2026  
**Autoria:** GitHub Copilot (arquiteto + product + full-stack)  
**Escopo:** Diagnóstico completo + Nova arquitetura + Plano faseado + Prompt executável

---

## Índice

1. [Diagnóstico do problema atual](#1-diagnóstico-do-problema-atual)
2. [Decisão de produto: fluxo ideal](#2-decisão-de-produto-fluxo-ideal)
3. [Decisão de arquitetura: modelo ideal](#3-decisão-de-arquitetura-modelo-ideal)
4. [Novo schema sugerido](#4-novo-schema-sugerido)
5. [Novos endpoints](#5-novos-endpoints)
6. [Regras de validação](#6-regras-de-validação)
7. [Redesenho da grade e do wizard](#7-redesenho-da-grade-e-do-wizard)
8. [Plano de migração por fases](#8-plano-de-migração-por-fases)
9. [Riscos e mitigação](#9-riscos-e-mitigação)
10. [Prompt final de execução](#10-prompt-final-de-execução)

---

## 1. Diagnóstico do problema atual

### 1.1 Tabelas que sustentam o módulo hoje

| Tabela                         | Papel                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `escalas_mensais`              | Container de uma escala (mês + ano + empresa + status)                                                         |
| `escala_tripulacoes`           | **Epicentro do problema** — grava `pic_id + sic_id + data_inicio + data_fim + aeronave` em **uma única linha** |
| `escala_eventos`               | Eventos diários por funcionário (voo, folga, treinamento…)                                                     |
| `padroes_escala`               | Padrões de rodízio (15x15, 7x7, etc.)                                                                          |
| `restricoes_tripulacao`        | Pares que não podem voar juntos                                                                                |
| `escala_auditoria`             | Log de alterações                                                                                              |
| `escalas_quinzenas`            | Intervalos configuráveis de quinzena por mês/ano                                                               |
| `escalas_tipos_evento_config`  | Tipos de evento customizáveis por empresa                                                                      |
| `escalas_templates_tripulacao` | Templates de alocação — também com `pic_id + sic_id` acoplados                                                 |
| `escala_alertas`               | Alertas CMA/FRMS persistidos                                                                                   |
| `funcionarios.quinzena`        | Preferência de quinzena do funcionário ('primeira'/'segunda')                                                  |
| `escalas_mensais.periodo`      | Qualificador de período da escala                                                                              |

### 1.2 Endpoints existentes

```
GET    /api/escalas                          → lista escalas mensais
POST   /api/escalas                          → cria escala mensal
POST   /api/escalas/gerar-ano                → gera 12 escalas de uma vez
GET    /api/escalas/:id                      → detalhe da escala
PUT    /api/escalas/:id                      → edita escala
DELETE /api/escalas/:id                      → soft delete
PATCH  /api/escalas/:id/status               → muda status (rascunho→publicada)
GET    /api/escalas/:id/calendario           → grade completa (tripulações + eventos)
GET    /api/escalas/:id/conflitos            → verificação de conflitos
GET    /api/escalas/:id/alertas              → alertas CMA/FRMS
GET    /api/escalas/:id/export               → exportação PDF/CSV
POST   /api/escalas/:id/tripulacoes          → adicionar tripulação (PIC+SIC+periodo)
GET    /api/escalas/:id/tripulacoes          → listar tripulações
PUT    /api/escalas/:id/tripulacoes/:tid     → editar tripulação
DELETE /api/escalas/:id/tripulacoes/:tid     → remover tripulação
POST   /api/escalas/:id/eventos              → criar evento manual
GET    /api/escalas/:id/eventos              → listar eventos
PUT    /api/escalas/:id/eventos/:eid         → editar evento
DELETE /api/escalas/:id/eventos/:eid         → remover evento
GET    /api/escalas/tripulantes-operacionais → lista quem pode ser alocado numa aeronave
GET    /api/escalas/quinzenas                → lista quinzenas
PUT    /api/escalas/quinzenas/:id            → editar quinzena
GET    /api/escalas/tipos-evento-config      → tipos de evento
POST/PUT/DELETE /api/escalas/tipos-evento-config → CRUD tipos de evento
GET/PUT /api/escalas/preferencias            → prefs de visualização
GET    /api/escalas/padroes                  → padrões de escala
GET    /api/escalas/restricoes               → restrições de tripulação
GET    /api/escalas/templates                → templates de tripulação
GET    /api/escalas/disponibilidade          → disponibilidade de funcionários
GET    /api/escalas/funcionarios/cma-status  → status CMA de pilotos
GET    /api/escalas/funcionarios/pilotos     → lista de pilotos disponíveis
```

### 1.3 Como a grade mensal é montada hoje

1. O frontend chama `GET /api/escalas/:id/calendario` que retorna `{ tripulacoes[], eventos[], quinzenas[] }`.
2. O `GradeGantt.tsx` recebe esse payload e executa `linhasPorFuncionario` — um `useMemo` que itera sobre `tripulacoes[]` e para cada tripulação cria **duas linhas** no Map: uma para `pic_id` (papel=PIC) e outra para `sic_id` (papel=SIC).
3. Para cada linha, percorre os dias do mês e procura em `eventos[]` o evento daquele funcionário naquele dia.
4. A cor da linha é derivada do `aeronave` da tripulação.
5. O filtro de aeronave filtra `tripulacoes[]` e portanto oculta/exibe linhas.

### 1.4 Como a quinzena é tratada hoje

- Existe a tabela `escalas_quinzenas` com datas configuráveis (✓ correto).
- O `ModalAdicionarTripulacao` usa a quinzena para pré-popular `data_inicio` e `data_fim` do **par PIC+SIC**.
- O campo `funcionarios.quinzena` ('primeira'/'segunda') está disponível, mas o modal apenas o usa como sugestão de seleção.
- O `ConfiguracaoEscalaPage` já tem aba de quinzenas com edição.

### 1.5 Como eventos são cadastrados/renderizados

- `POST /:id/eventos` → evento manual por funcionário.
- `gerarEventosBase` em `escalas-shared.ts` é chamado ao adicionar uma tripulação e **auto-preenche VOO para o período alocado e FOL para o restante do mês** — um para PIC e um para SIC.
- Os eventos são renderizados em `GradeGantt` via `CelulaEvento.tsx` por dia.
- Drag & drop está implementado para mover eventos manualmente.

### 1.6 Como aeronaves entram no fluxo

- O campo `aeronave` em `escala_tripulacoes` é um **texto livre** (ex: "PR-BGE SK76").
- Existe também `aeronave_id` opcional para lookup — mas o campo salvo é string.
- `findTripulacaoDuplicadaPorAeronave` impede **mais de uma tripulação por aeronave por escala** — UNIQUE lógico por nome normalizado.
- O filtro de aeronave na grade filtra linhas pelo valor do campo texto.

### 1.7 Onde PIC e SIC estão acoplados (raiz do problema)

```sql
-- Tabela central do problema:
CREATE TABLE escala_tripulacoes (
  pic_id TEXT NOT NULL,   -- PIC obrigatório
  sic_id TEXT,            -- SIC opcional
  data_inicio TEXT,       -- início do CASAL
  data_fim TEXT,          -- fim do CASAL
  aeronave TEXT,          -- aeronave do CASAL
  ...
);
```

**Resultado operacional:**

1. PIC e SIC sempre começam e terminam no mesmo dia na mesma aeronave.
2. Só existe **uma** tripulação por aeronave por escala mensal inteira (constraint implementada em código).
3. Para trocar apenas o SIC no meio do mês, o planejador precisa deletar a tripulação inteira e recriar.
4. Não há como registrar que o PIC1 vai de 01–15 na PR-BGE e o PIC2 assume 16–31 na mesma aeronave.
5. `gerarEventosBase` é chamado com os mesmos `data_inicio`/`data_fim` para PIC e SIC — eventos idênticos, sem flexibilidade individual.

**Na tabela de templates (`escalas_templates_tripulacao`), o mesmo erro se repete:**

```sql
pic_id TEXT REFERENCES funcionarios(id),  -- acoplado
sic_id TEXT REFERENCES funcionarios(id),  -- acoplado
```

### 1.8 Validações de qualificação/disponibilidade existentes

✓ **CMA**: verificado em `escalas-cma-status.ts` e em `escalas-tripulantes-operacionais.ts` — bloqueia alocação se CMA vencida.  
✓ **FRMS**: integrado via `escalas-tripulantes-operacionais.ts`, badge visual no modal.  
✓ **Modelo de aeronave**: verificado em `escalas-tripulacoes.ts` ao criar tripulação.  
✓ **Restrição de par**: `restricoes_tripulacao` verificado antes de salvar.  
✓ **Conflito de período**: `verificarConflitosEscala` em `escala-engine.ts`.  
⚠️ **Cobertura por dia**: não existe — não há visão agregada de "PR-BGE sem PIC em 11/05".  
⚠️ **Sobreposição individual**: verificação parcial, não robusta para múltiplas alocações.

### 1.9 O erro conceitual central — resumido

**O problema é de modelagem, não de implementação.** A tabela `escala_tripulacoes` modela uma "dupla" quando deveria modelar uma "alocação individual por função". Isso causa:

| Sintoma                                                            | Causa                                |
| ------------------------------------------------------------------ | ------------------------------------ |
| Não posso ter PIC1 de 1–15 e PIC2 de 16–31 na mesma aeronave       | UNIQUE aeronave por escala           |
| PIC e SIC sempre com o mesmo período                               | Um registro para dois                |
| Não existe visão de cobertura por dia                              | Modelo não suporta slots individuais |
| Templates acoplam PIC+SIC                                          | Mesma falha de modelagem             |
| Para ajustar SIC, tenho que descer a tripulação toda               | Registro único indecomponível        |
| Filtro de aeronave funciona na grade mas não no wizard de alocação | Lógica cosmética                     |
| "Quem cobre PT-BGE em 11/05?" não tem resposta no banco            | Não existe tabela de cobertura       |

---

## 2. Decisão de produto: fluxo ideal

### 2.1 Questionar a premissa: "escala mensal obrigatória primeiro"

**Premissa atual:** o usuário deve primeiro criar uma `escalas_mensais`, só então pode alocar.  
**Avaliação:** isso é burocrático e não agrega valor se a empresa opera continuamente. A escala mensal deve existir como **contêiner implícito** — criada automaticamente se não existir — não como gate que bloqueia o planejador.

**Decisão de produto:** manter `escalas_mensais` como contêiner, mas criá-lo automaticamente ao primeiro acesso ao mês. O planejador escolhe mês → o sistema garante o contêiner. Pronto.

### 2.2 Fluxo orientado ao planejador

```
ENTRADA: escolher o mês (padrão = mês atual)
         ↓
VISÃO PANORÂMICA: lista de aeronaves com status de cobertura
         ↓
SELECIONAR aeronave para planejar
         ↓
WIZARD DE ALOCAÇÃO (por aeronave):
  Passo 1 → Escolher quinzena (1ª / 2ª / personalizada)
  Passo 2 → Escolher slot (PIC ou SIC) e período exato
  Passo 3 → Escolher tripulante (apenas elegíveis, com badges)
  Passo 4 → Revisar e confirmar (alerta pendências)
         ↓
RETORNO à visão panorâmica → aeronave agora aparece coberta
         ↓
REPETIR para próxima aeronave
```

**Por que não acoplamos PIC e SIC no mesmo passo?**  
Porque na operação real, PIC e SIC podem ter datas diferentes, vindos de revezamentos distintos, de bases diferentes. O wizard pergunta slot por slot, permitindo que a aeronave tenha PIC1 de 1–15, PIC2 de 16–31, SIC1 de 1–10, SIC2 de 11–31. São quatro alocações, quatro registros.

### 2.3 O objeto central muda

| Antes                              | Depois                                       |
| ---------------------------------- | -------------------------------------------- |
| "Tripulação" (par PIC+SIC)         | "Alocação operacional individual"            |
| 1 registro por aeronave por escala | N registros por aeronave por escala          |
| Período fixo para PIC e SIC        | Período individual por função                |
| Cobertura implícita/assumida       | Cobertura calculada e exibida explicitamente |

---

## 3. Decisão de arquitetura: modelo ideal

### 3.1 O que preservar do legado

| Componente                     | Decisão        | Motivo                                                                               |
| ------------------------------ | -------------- | ------------------------------------------------------------------------------------ |
| `escalas_mensais`              | **Preservar**  | Contêiner válido, bem modelado                                                       |
| `escala_eventos`               | **Preservar**  | Eventos individuais por funcionário já estão corretos                                |
| `escalas_quinzenas`            | **Preservar**  | Já está correto e configurável                                                       |
| `escalas_tipos_evento_config`  | **Preservar**  | Já correto com CRUD                                                                  |
| `padroes_escala`               | **Preservar**  | Referência para padrões de rodízio                                                   |
| `restricoes_tripulacao`        | **Preservar**  | Regra de negócio válida                                                              |
| `escala_auditoria`             | **Preservar**  | Auditoria importante                                                                 |
| `escala_alertas`               | **Preservar**  | Alertas persistidos úteis                                                            |
| `escalas_templates_tripulacao` | **Substituir** | Modelo com pic_id+sic_id acoplados → migrar para templates com alocações individuais |
| `escala_tripulacoes`           | **Substituir** | Este é o problema central                                                            |

### 3.2 Nova entidade central: `escala_alocacoes`

Substitui `escala_tripulacoes`. Cada registro representa **uma pessoa, uma função, uma aeronave, um período**.

```
escala_alocacoes
├── funcionario_id    — quem
├── funcao            — PIC | SIC | PIC_CHK | SIC_CHK | INSTRUTOR | FLEX
├── escala_id         — qual escala mensal
├── aeronave_id       — qual aeronave (FK real)
├── quinzena_id       — a qual quinzena pertence (FK)
├── data_inicio       — quando começa
├── data_fim          — quando termina
├── padrao_escala_id  — padrão de rodízio opcional
├── base              — base de operação
├── status            — planejado | confirmado | cancelado
└── auditoria padrão
```

Isso resolve todos os problemas identificados:

- PIC e SIC têm registros independentes
- Múltiplos PICs na mesma aeronave no mesmo mês são naturais (períodos diferentes)
- A "cobertura" é derivada como view/query sobre alocações

### 3.3 Cobertura operacional (derivada)

Não é uma tabela persistida — é calculada no endpoint e cacheada no frontend:

```
Para cada aeronave, para cada dia do mês:
  - Quantos PICs cobrem esse dia? (alocações com funcao='PIC' e data_inicio <= dia <= data_fim)
  - Quantos SICs cobrem esse dia?
  → Se 0 PICs: gap de cobertura PIC
  → Se 0 SICs: gap de cobertura SIC
```

### 3.4 Templates (nova modelagem)

Em vez de um template com pic_id+sic_id, o template é uma **lista de alocações padrão**:

```
escala_template_base
├── nome, empresa_id, quinzena, aeronave_id...

escala_template_alocacoes  (linhas do template)
├── template_id
├── funcao           — PIC | SIC
├── funcionario_id   — quem normalmente ocupa este slot
├── padrao_escala_id
```

Isso permite templates com 1 PIC + 1 SIC + 1 SIC_reserva, todos independentes.

---

## 4. Novo schema sugerido

### Migration 0249: escala_alocacoes (nova tabela central)

```sql
-- Migration 0249: escala_alocacoes
-- Substitui o modelo de pares PIC+SIC por alocações individuais por função.
-- IMPORTANTE: esta tabela COEXISTE com escala_tripulacoes durante a migração.

CREATE TABLE IF NOT EXISTS escala_alocacoes (
  id              TEXT    PRIMARY KEY,
  escala_id       TEXT    NOT NULL REFERENCES escalas_mensais(id) ON DELETE CASCADE,
  funcionario_id  TEXT    NOT NULL REFERENCES funcionarios(id),
  aeronave_id     INTEGER NOT NULL REFERENCES aeronaves(id),
  funcao          TEXT    NOT NULL CHECK (funcao IN ('PIC','SIC','PIC_CHK','SIC_CHK','INSTRUTOR','FLEX')),
  quinzena_id     INTEGER REFERENCES escalas_quinzenas(id),
  data_inicio     TEXT    NOT NULL,   -- YYYY-MM-DD
  data_fim        TEXT    NOT NULL,   -- YYYY-MM-DD
  padrao_escala_id TEXT   REFERENCES padroes_escala(id),
  base            TEXT,
  observacoes     TEXT,
  status          TEXT    NOT NULL DEFAULT 'planejado'
                  CHECK (status IN ('planejado','confirmado','cancelado')),
  -- Migração: referência opcional ao registro antigo (nullável, será dropado na Fase 5)
  tripulacao_legado_id TEXT,
  created_by      TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT,
  -- Garante: mesmo funcionário não pode ter duas alocações sobrepostas na mesma aeronave+função
  -- (a constraint real de sobreposição é feita por query, não por índice único — SQLite não
  -- suporta exclusion constraints, usaremos check via trigger ou validação na API)
  CONSTRAINT chk_datas CHECK (data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_alocacoes_escala     ON escala_alocacoes(escala_id)         WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alocacoes_funcionario ON escala_alocacoes(funcionario_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alocacoes_aeronave   ON escala_alocacoes(aeronave_id)       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alocacoes_datas      ON escala_alocacoes(data_inicio, data_fim) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alocacoes_escala_aeronave ON escala_alocacoes(escala_id, aeronave_id) WHERE deleted_at IS NULL;
```

### Migration 0250: escala_cobertura_diaria (cache materializado opcional)

```sql
-- Migration 0250: escala_cobertura_diaria
-- Cache materializado de cobertura (recalculado por trigger/endpoint após cada mutação)
-- Permite que a grade carregue alertas de gap sem recalcular sempre.

CREATE TABLE IF NOT EXISTS escala_cobertura_diaria (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  escala_id       TEXT    NOT NULL REFERENCES escalas_mensais(id) ON DELETE CASCADE,
  aeronave_id     INTEGER NOT NULL REFERENCES aeronaves(id),
  data            TEXT    NOT NULL,   -- YYYY-MM-DD
  qtd_pic         INTEGER NOT NULL DEFAULT 0,
  qtd_sic         INTEGER NOT NULL DEFAULT 0,
  status_cobertura TEXT NOT NULL DEFAULT 'ok'
                  CHECK (status_cobertura IN ('ok','gap_pic','gap_sic','gap_total','excesso')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (escala_id, aeronave_id, data)
);

CREATE INDEX IF NOT EXISTS idx_cobertura_escala_data
  ON escala_cobertura_diaria(escala_id, data);
CREATE INDEX IF NOT EXISTS idx_cobertura_aeronave
  ON escala_cobertura_diaria(aeronave_id, data);
```

### Migration 0251: atualizar templates para novo modelo

```sql
-- Migration 0251: escala_template_alocacoes
-- Linhas individuais de template (substitui pic_id/sic_id acoplados no template pai)

CREATE TABLE IF NOT EXISTS escala_template_alocacoes (
  id              TEXT    PRIMARY KEY,
  template_id     TEXT    NOT NULL REFERENCES escalas_templates_tripulacao(id) ON DELETE CASCADE,
  funcao          TEXT    NOT NULL CHECK (funcao IN ('PIC','SIC','PIC_CHK','SIC_CHK','INSTRUTOR','FLEX')),
  funcionario_id  TEXT    REFERENCES funcionarios(id),  -- null = slot vazio (a preencher)
  padrao_escala_id TEXT   REFERENCES padroes_escala(id),
  ordem           INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_template_alocacoes_template
  ON escala_template_alocacoes(template_id)
  WHERE deleted_at IS NULL;

-- Deprecação controlada: adicionar coluna de migração no template pai
ALTER TABLE escalas_templates_tripulacao
  ADD COLUMN migrado_para_v2 INTEGER NOT NULL DEFAULT 0;
```

### Migration 0252: índice de sobreposição no escala_eventos

```sql
-- Migration 0252: índice composto para verificação de sobreposição de eventos
-- Necessário para a query de conflito individual
CREATE INDEX IF NOT EXISTS idx_eventos_funcionario_datas
  ON escala_eventos(funcionario_id, data_inicio, data_fim)
  WHERE deleted_at IS NULL AND status != 'cancelado';
```

### Campos adicionais opcionais (podem ser adicionados juntos com 0249)

```sql
-- Adicionar aeronave_id à tabela de eventos para queries de cobertura
ALTER TABLE escala_eventos ADD COLUMN aeronave_id INTEGER REFERENCES aeronaves(id);
ALTER TABLE escala_eventos ADD COLUMN alocacao_id TEXT REFERENCES escala_alocacoes(id);
```

---

## 5. Novos endpoints

### 5.1 Endpoints para `escala_alocacoes`

```
POST   /api/escalas/:id/alocacoes
  Body: { funcionario_id, aeronave_id, funcao, data_inicio, data_fim, quinzena_id?, padrao_escala_id?, base?, observacoes? }
  Validações: sobreposição funcionário, sobreposição slot aeronave+funcao, modelo habilitado, CMA, FRMS
  Retorno: { success, data: { alocacao, alertas[], eventos_gerados } }

GET    /api/escalas/:id/alocacoes
  Query: aeronave_id?, funcao?, data?
  Retorno: { success, data: { alocacoes[], total } }

PUT    /api/escalas/:id/alocacoes/:aid
  Body: { funcao?, data_inicio?, data_fim?, status?, observacoes? }
  Validações: mesmas do POST

DELETE /api/escalas/:id/alocacoes/:aid
  Soft delete + remove eventos auto-gerados vinculados

GET    /api/escalas/:id/cobertura
  Query: aeronave_id? (se omitido: todas as aeronaves)
  Retorno: { success, data: { aeronaves: [{ aeronave_id, prefixo, dias: [{ data, qtd_pic, qtd_sic, status }] }] } }
  Nota: calcula em tempo real SE não houver cache, usa cache se disponível

POST   /api/escalas/:id/cobertura/recalcular
  Recalcula e persiste escala_cobertura_diaria para a escala inteira
```

### 5.2 Endpoints de tripulantes disponíveis (atualizado)

```
GET /api/escalas/tripulantes-operacionais
  Query: aeronave_id (obrigatório), funcao?, data_inicio?, data_fim?, escala_id?
  Retorno: { success, data: { tripulantes: [{ funcionario_id, nome, funcao, pode_ser_alocado, motivo_bloqueio, status_operacional, cma_status, frms, quinzena, ja_alocado_em? }], aeronave: {...} } }
```

**Nota:** o endpoint já existe — apenas adicionar `funcao`, `data_inicio`, `data_fim` como query params para filtrar conflitos mais precisos.

### 5.3 Endpoints de wizard (novos — simplificam o frontend)

```
GET /api/escalas/wizard/aeronaves-status?escala_id=:id
  Retorno: lista de aeronaves ativas com resumo de cobertura para o mês
  { aeronave_id, prefixo, modelo, total_dias, dias_cobertos_pic, dias_cobertos_sic, status_geral }

GET /api/escalas/wizard/slots-disponiveis?aeronave_id=:id&escala_id=:id&funcao=PIC
  Retorno: lista de períodos disponíveis para o slot (gaps de cobertura)
```

### 5.4 Endpoints de templates (atualizados)

```
GET    /api/escalas/templates/:id/alocacoes           → lista alocações do template
POST   /api/escalas/templates/:id/alocacoes           → adicionar alocação ao template
PUT    /api/escalas/templates/:id/alocacoes/:aid      → editar alocação do template
DELETE /api/escalas/templates/:id/alocacoes/:aid      → remover alocação do template
POST   /api/escalas/templates/:id/aplicar             → aplica template na escala
  Body: { escala_id, aeronave_id, quinzena_id, data_inicio, data_fim }
  Cria alocações individuais para cada linha do template
```

### 5.5 Compatibilidade com legado

O endpoint `POST /:id/tripulacoes` **continua funcionando** durante a transição, mas internamente passa a:

1. Criar dois registros em `escala_alocacoes` (um para PIC, outro para SIC).
2. Salvar os IDs nos campos de auditoria.
3. **Não mais** usar `escala_tripulacoes` diretamente.

O endpoint `GET /:id/calendario` continua retornando o shape atual adicionando `alocacoes[]` ao payload.

---

## 6. Regras de validação

### 6.1 Zod schemas (backend — worker)

```typescript
// Schema de alocação individual
const AlocacaoSchema = z
  .object({
    funcionario_id: z.string().min(1),
    aeronave_id: z.coerce.number().int().positive(),
    funcao: z.enum(['PIC', 'SIC', 'PIC_CHK', 'SIC_CHK', 'INSTRUTOR', 'FLEX']),
    quinzena_id: z.coerce.number().int().positive().optional(),
    data_inicio: IsoDateSchema,
    data_fim: IsoDateSchema,
    padrao_escala_id: z.string().optional(),
    base: z.string().optional(),
    observacoes: z.string().max(500).optional(),
  })
  .refine((d) => d.data_fim >= d.data_inicio, {
    message: 'data_fim deve ser >= data_inicio',
    path: ['data_fim'],
  });
```

### 6.2 Validações de negócio (ordem de execução)

```
1. MODELO HABILITADO
   → SELECT FROM funcionario_habilitacoes WHERE funcionario_id=? AND modelo=?
   → Se não habilitado: erro 400 com code MODELO_NAO_HABILITADO

2. CMA
   → Buscar status CMA do funcionário
   → Se BLOQUEADO_CMA: erro 409 com code CMA_BLOQUEADA (impeditivo)
   → Se VENCENDO_CMA (< 30 dias): alerta no retorno, mas permite (alertas[])

3. FRMS
   → Buscar score FRMS
   → Se BLOQUEADO_FRMS: erro 409 com code FRMS_BLOQUEADO (impeditivo)
   → Se ATENCAO_FRMS: alerta no retorno, permite

4. SOBREPOSIÇÃO FUNCIONÁRIO
   → SELECT FROM escala_alocacoes
     WHERE funcionario_id=? AND deleted_at IS NULL
     AND NOT (data_fim < $data_inicio OR data_inicio > $data_fim)
     AND id != $ignorar_id
   → Se encontrar: erro 409 com code SOBREPOSICAO_FUNCIONARIO
     body: { funcionario_nome, aeronave_conflito, data_inicio, data_fim }

5. SOBREPOSIÇÃO SLOT (aeronave+funcao)
   → SELECT FROM escala_alocacoes
     WHERE escala_id=? AND aeronave_id=? AND funcao=? AND deleted_at IS NULL
     AND NOT (data_fim < $data_inicio OR data_inicio > $data_fim)
     AND id != $ignorar_id
   → Se encontrar com status != 'cancelado': erro 409 com code SLOT_OCUPADO
     body: { funcionario_existente, data_inicio, data_fim }

6. RESTRIÇÃO DE PAR (se PIC e SIC na mesma aeronave no mesmo dia)
   → Verificar restricoes_tripulacao para pares em conflito temporal
   → Se encontrar: erro 409 com code RESTRICAO_PAR

7. QUINZENA BASE
   → Se funcionario.quinzena != quinzena solicitada: ALERTA (não bloqueio)
     body alertas[]: { tipo: 'FORA_DA_QUINZENA_BASE', detalhe: '...' }
```

### 6.3 Validações de cobertura (lado servidor, assíncrono)

Após cada mutação em `escala_alocacoes`, enfileirar recálculo de `escala_cobertura_diaria` para a aeronave afetada. Se a aeronave ficar sem cobertura em algum dia, criar registro em `escala_alertas` automaticamente:

```typescript
// Pseudo-código do recálculo
function calcularCoberturaAeronave(db, escalaId, aeronaveId) {
  const diasDoMes = getDiasDoMes(escala.mes, escala.ano);
  for (const dia of diasDoMes) {
    const alocacoes = buscarAlocacaoesNoDia(db, escalaId, aeronaveId, dia);
    const qtdPic = alocacoes.filter((a) => a.funcao.startsWith('PIC')).length;
    const qtdSic = alocacoes.filter((a) => a.funcao.startsWith('SIC')).length;
    const status =
      qtdPic === 0 && qtdSic === 0
        ? 'gap_total'
        : qtdPic === 0
          ? 'gap_pic'
          : qtdSic === 0
            ? 'gap_sic'
            : qtdPic > 1 || qtdSic > 1
              ? 'excesso'
              : 'ok';
    upsertCobertura(db, escalaId, aeronaveId, dia, qtdPic, qtdSic, status);
    if (status.startsWith('gap')) criarAlerta(db, escalaId, aeronaveId, dia, status);
  }
}
```

---

## 7. Redesenho da grade e do wizard

### 7.1 Entrada principal do módulo

**Tela: `/escalas`**

```
┌─────────────────────────────────────────────────────────────────┐
│  Escalas Operacionais          [Configurações]  [Histórico]     │
│  ← Abril 2026 →                                                 │
│                                                                 │
│  AERONAVES ATIVAS                              STATUS COBERTURA │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ PR-BGE  SK76   ████████████░░░░░░░░░░░░░░░░  14/30 dias  │   │  ← barra de progresso de cobertura
│  │                [Planejar →]                  ⚠ gap PIC   │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ PR-AWT  AW139  ████████████████████████████  30/30 dias  │   │
│  │                [Ver grade →]                 ✓ OK        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ Nova alocação]                                              │
└─────────────────────────────────────────────────────────────────┘
```

**Regra de UX:**

- A escala mensal é criada automaticamente ao navegar para o mês.
- A entrada não pergunta "criar escala?" — ela simplesmente existe.
- Cada cartão de aeronave exibe status de cobertura imediatamente.
- Clicar em "Planejar" abre o wizard no slot com maior gap.
- Clicar em "Ver grade" abre a grade filtrada dessa aeronave.

### 7.2 Wizard de alocação (modal ou página)

**Passo 1 — Contexto**

```
Aeronave: PR-BGE (SK76)
Mês: Abril 2026

Qual período?
○ 1ª Quinzena  01/04 – 14/04
○ 2ª Quinzena  15/04 – 30/04
○ Personalizado [data_inicio] [data_fim]

Qual função?
○ PIC  ○ SIC  ○ PIC (Cheque)  ○ SIC (Cheque)  ○ Flex
```

**Passo 2 — Escolher tripulante**

```
Pilotos disponíveis para PR-BGE (SK76) — 1ª Quinzena PIC:

🟢 João Silva        ·· CMA ok · FRMS ok · Q1 ✓ · [Selecionar]
🟢 Carlos Matos      ·· CMA ok · FRMS ok · Q2 ⚠ fora da quinzena base · [Selecionar]
🔴 Ana Ferreira      ·· CMA VENCIDA · [Bloqueado]
🔴 Pedro Castro      ·· Já alocado em PR-AWT 01/04–30/04 · [Bloqueado]
🟡 Marcos Lima       ·· CMA vence em 8 dias · [Selecionar com alerta]

Legenda: 🔴 Bloqueado · 🟡 Atenção · 🟢 Disponível  [Mostrar todos]
```

**Passo 3 — Revisão**

```
Resumo da alocação:
  Aeronave: PR-BGE (SK76)
  Tripulante: João Silva (PIC)
  Período: 01/04/2026 – 14/04/2026

Alertas:
  ⚠️ Nenhum — João Silva está disponível e habilitado.

Após confirmar:
  O sistema irá gerar eventos automáticos de VOO para o período
  e FOLGA para os dias restantes do mês.

[← Voltar]  [Confirmar alocação]
```

### 7.3 Grade mensal redesenhada

**Estrutura do `GradeGantt` redesenhado:**

```
Grupo: PR-BGE (SK76)  [+ Alocar PIC]  [+ Alocar SIC]  [▼]
─────────────────────────────────────────────────────────────
PIC  João Silva   │██ VOO ██│██ VOO ██│   │   │   │  [editar]
PIC  Carlos Matos │         │         │███ VOO ████│  [editar]  ← 2ª quinzena
SIC  Ana Ferreira │██ VOO ██│         │   │   │   │  [editar]
─────────────────────────────────────────────────────────────
     ⚠ Gap SIC: 16/04–30/04  [+ Alocar SIC]
─────────────────────────────────────────────────────────────

Grupo: PR-AWT (AW139)  [+ Alocar PIC]  [+ Alocar SIC]  [▼]
...
```

**Mudanças chave em relação ao atual:**

1. Agrupamento por **aeronave** (não por funcionário) — cada bloco é a frota da aeronave.
2. Dentro do bloco, linhas por **função + funcionário** — PIC primeiro, depois SIC.
3. Banner de gap de cobertura visível dentro do bloco.
4. Botões `[+ Alocar PIC]` / `[+ Alocar SIC]` dentro do bloco abrem o wizard pré-preenchido para essa aeronave+função.
5. Clicar no nome do tripulante → edição inline ou modal de edição de alocação.
6. Clicar em célula de evento → modal de edição/troca de evento.
7. Filtro de aeronave funciona de verdade: colapsa/oculta os outros blocos.

### 7.4 Legenda simplificada

```
Eventos:          Funções:          Status:
■ Voo             PIC               🟢 Coberto
■ Folga           SIC               🟡 Atenção
■ Férias          PIC CHK           🔴 Gap
■ Licença         Flex
■ Treinamento
■ Médico
■ Cheque
■ Standby
```

**Regra:** a legenda lista apenas os tipos de evento ativos (`ativo=1`) na `escalas_tipos_evento_config`. Se o usuário desativar "Cheque", ele some da legenda e da grade.

### 7.5 ConfiguracaoEscalaPage — novas abas

A página já existe — adicionar:

```
Tabs:
  ✓ Quinzenas do Ano    (já existe)
  ✓ Tipos de Evento     (já existe)
  ✓ Preferências        (já existe)
  ✓ Templates           (já existe)
  + Regras Operacionais (nova — espaço para futuras configurações: limites de horas, CMA crítico, FRMS threshold)
  + Aeronaves Ativas    (nova — qual aeronave deve aparecer no módulo de escalas)
```

---

## 8. Plano de migração por fases

### FASE 1 — Modelo de dados (sem quebrar operação)

**Objetivo:** criar `escala_alocacoes` e `escala_cobertura_diaria` sem tocar em `escala_tripulacoes`.

**Migrations:**

- `0249_escala_alocacoes.sql`
- `0250_escala_cobertura_diaria.sql`
- `0251_escala_template_alocacoes.sql`
- `0252_index_eventos_sobreposicao.sql`

**Arquivos backend impactados:**

- Nenhum existente alterado
- Adicionar `worker-airtrust/src/routes/escalas-alocacoes.ts` (novo)
- Adicionar `worker-airtrust/src/routes/escalas-cobertura.ts` (novo)
- Montar no `escalas-core.ts`

**Risco:** baixo — adição pura.  
**Rollback:** drop das novas tabelas.  
**Critério de aceite:** migrations aplicadas, endpoints respondem, `escala_tripulacoes` intacta.

---

### FASE 2 — API paralela nova + cobertura

**Objetivo:** expor os novos endpoints de alocações e cobertura. Testar via Postman/smoke-test. Frontend ainda usa o modelo antigo.

**Endpoints novos:**

- `POST/GET/PUT/DELETE /api/escalas/:id/alocacoes`
- `GET /api/escalas/:id/cobertura`
- `POST /api/escalas/:id/cobertura/recalcular`
- Atualizar `GET /api/escalas/tripulantes-operacionais` com novos params

**Arquivos:**

- `worker-airtrust/src/routes/escalas-alocacoes.ts`
- `worker-airtrust/src/routes/escalas-cobertura.ts`
- `worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts` (atualizar params)
- `worker-airtrust/src/routes/escalas-shared.ts` (novos schemas Zod)
- `worker-airtrust/src/routes/escalas-core.ts` (montar rotas novas)

**Risco:** médio — validações novas ainda não testadas em produção.  
**Rollback:** desmontar as novas rotas do core.  
**Critério de aceite:** smoke-test passa em staging para todos os endpoints novos.

---

### FASE 3 — Adaptar UI para **leitura** do novo modelo

**Objetivo:** `GradeGantt`, `EscalasPage` e tela inicial passam a consumir `alocacoes` e `cobertura` para exibição, mantendo escrita no antigo momentaneamente.

**Mudanças de UI:**

- `GradeGantt.tsx`: usar `alocacoes[]` em vez de `tripulacoes[]` para montar grupos por aeronave
- `EscalasPage.tsx`: nova tela inicial com cartões de aeronave + status de cobertura
- `PainelDisponibilidade.tsx`: incluir gaps de cobertura derivados de `GET /cobertura`
- Novo componente: `BlocoAeronave.tsx` — agrupa PIC(s) e SIC(s) de uma aeronave

**Arquivos:**

- `src/react-app/pages/escalas/EscalasPage.tsx`
- `src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx`
- `src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts` (adicionar hooks novos)
- `src/react-app/pages/escalas/components/Paineis/PainelDisponibilidade.tsx`
- Novo: `src/react-app/pages/escalas/components/EscalaCalendario/BlocoAeronave.tsx`

**Risco:** médio — UI quebrar se shape da API não for consistente.  
**Rollback:** feature flag `USE_ALOCACOES_V2` no frontend.  
**Critério de aceite:** grade mostra dados corretos para escalas já populadas via API nova.

---

### FASE 4 — Migrar criação/edição para novo fluxo

**Objetivo:** `ModalAdicionarTripulacao` → substituído por `WizardAlocacao` usando `POST /alocacoes`.

**Mudanças:**

- Reescrever `ModalAdicionarTripulacao.tsx` como wizard de 3 passos
- O wizard chama `POST /:id/alocacoes` (não mais `POST /:id/tripulacoes`)
- Edição de alocação via `PUT /:id/alocacoes/:aid`
- `escalas-tripulacoes.ts` no backend passa a criar registros em `escala_alocacoes` internamente E em `escala_tripulacoes` (dual-write, para compatibilidade com qualquer consumidor antigo)

**Arquivos:**

- `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx` → refatorar
- `worker-airtrust/src/routes/escalas-tripulacoes.ts` → dual-write
- `worker-airtrust/src/routes/escalas-alocacoes.ts` → implementar validações completas

**Risco:** alto — fluxo crítico. Testar amplamente antes.  
**Rollback:** reverter para o modal antigo via feature flag.  
**Critério de aceite:** criar uma alocação individual por função funciona, cobertura é atualizada, a UI reflete corretamente.

---

### FASE 5 — Remover dependência do modelo antigo

**Objetivo:** `escala_tripulacoes` deixa de receber novas escritas.

**Mudanças:**

- Remover dual-write de `escalas-tripulacoes.ts`
- `GET /:id/calendario` passa a retornar apenas `alocacoes[]` (renomear campo mas manter retrocompatibilidade com `tripulacoes: []` vazio para não quebrar clientes)
- Migration para migrar dados de `escala_tripulacoes` existentes para `escala_alocacoes`

**Script de migração:**

```sql
-- Para cada tripulação existente, criar duas alocações
INSERT INTO escala_alocacoes (id, escala_id, funcionario_id, aeronave_id, funcao, data_inicio, data_fim, created_by, migrado_de_tripulacao_id)
SELECT
  lower(hex(randomblob(16))),
  et.escala_id,
  et.pic_id,
  a.id,
  'PIC',
  et.data_inicio,
  et.data_fim,
  'migration-v2',
  et.id
FROM escala_tripulacoes et
LEFT JOIN aeronaves a ON UPPER(TRIM(a.prefixo)) = UPPER(TRIM(SUBSTR(et.aeronave, 1, INSTR(et.aeronave || ' ', ' ') - 1)))
WHERE et.deleted_at IS NULL AND et.pic_id IS NOT NULL;

-- SIC
INSERT INTO escala_alocacoes (id, escala_id, funcionario_id, aeronave_id, funcao, data_inicio, data_fim, created_by, migrado_de_tripulacao_id)
SELECT
  lower(hex(randomblob(16))),
  et.escala_id,
  et.sic_id,
  a.id,
  'SIC',
  et.data_inicio,
  et.data_fim,
  'migration-v2',
  et.id
FROM escala_tripulacoes et
LEFT JOIN aeronaves a ON UPPER(TRIM(a.prefixo)) = UPPER(TRIM(SUBSTR(et.aeronave, 1, INSTR(et.aeronave || ' ', ' ') - 1)))
WHERE et.deleted_at IS NULL AND et.sic_id IS NOT NULL;
```

**Risco:** médio — depende da qualidade dos dados existentes (campo `aeronave` texto pode não casar perfeitamente com `aeronaves.prefixo`).  
**Rollback:** manter `escala_tripulacoes` intacta, não dropar até Fase 6.  
**Critério de aceite:** 100% das tripulações existentes têm correspondência em alocações.

---

### FASE 6 — Limpeza do legado

**Objetivo:** dropar `escala_tripulacoes` e campos de migração.

**Ações:**

- `ALTER TABLE escalas_templates_tripulacao DROP COLUMN pic_id`
- `ALTER TABLE escalas_templates_tripulacao DROP COLUMN sic_id`
- `DROP TABLE escala_tripulacoes`
- Remover imports e referências aos endpoints antigos de tripulações
- Remover campo `tripulacao_legado_id` de `escala_alocacoes`

**Risco:** baixo neste ponto — se Fase 5 funcionou, Fase 6 é só cleanup.  
**Rollback:** não há rollback fácil — só fazer após validação completa em produção.  
**Critério de aceite:** sistema em produção estável por ≥ 2 semanas antes de dropar tabela.

---

## 9. Riscos e mitigação

| Risco                                                                                       | Probabilidade | Impacto | Mitigação                                                                    |
| ------------------------------------------------------------------------------------------- | ------------- | ------- | ---------------------------------------------------------------------------- |
| Campo `aeronave` texto em `escala_tripulacoes` não casa com `aeronaves.prefixo` na migração | Alta          | Médio   | Script de migração com log de falhas + revisão manual antes de dropar legado |
| Dois PICs na mesma aeronave no mesmo período (excesso de cobertura)                         | Média         | Baixo   | Alerta de "excesso" na cobertura, não bloqueio                               |
| Frontend quebra ao consumir `alocacoes[]` em vez de `tripulacoes[]`                         | Média         | Alto    | Feature flag + testes de regressão antes de ativar                           |
| Template com `pic_id`/`sic_id` hardcoded ainda usados por alguém                            | Baixa         | Médio   | Dual-write durante Fase 4 + banner de depreciação no template antigo         |
| Usuário aloca PIC de quinzena errada sem perceber                                           | Média         | Médio   | Badge visual claro "⚠ fora da quinzena base" + step de revisão no wizard     |
| Performance: recálculo de cobertura após cada mutação                                       | Baixa         | Médio   | Cache em `escala_cobertura_diaria`, recalcular apenas a aeronave afetada     |
| Drag & drop de eventos passa a ter referência a `alocacao_id` nula                          | Baixa         | Baixo   | Ligar `alocacao_id` nos eventos auto-gerados durante a criação da alocação   |

---

## 10. Prompt final de execução

Abaixo o prompt pronto para ser colado no agente e executar o redesenho. Ele está estruturado para execução incremental (Fase 1 + Fase 2), deixando as fases de UI para um segundo ciclo.

---

```
Você é engenheiro full-stack sênior do AirTrust.

Stack: Cloudflare Workers + D1 + Hono + React 19 + TypeScript + Zod.
Padrões: soft delete (deleted_at), auditoria, AppError, { success, data/error }.
Toda tabela nova: created_at, updated_at, deleted_at.
Todo select: WHERE deleted_at IS NULL.
Toda mutação relevante: registrar em escala_auditoria.

Sua tarefa é implementar as FASES 1 e 2 do redesenho do módulo de Escalas
conforme o documento REDESENHO-MODULO-ESCALAS-20260306.md.

=== FASE 1: Migrations ===

Crie os seguintes arquivos em worker-airtrust/migrations/:

1) 0249_escala_alocacoes.sql
   Cria tabela escala_alocacoes com as colunas:
     id TEXT PK, escala_id TEXT NOT NULL (ref escalas_mensais),
     funcionario_id TEXT NOT NULL (ref funcionarios),
     aeronave_id INTEGER NOT NULL (ref aeronaves),
     funcao TEXT NOT NULL CHECK ('PIC','SIC','PIC_CHK','SIC_CHK','INSTRUTOR','FLEX'),
     quinzena_id INTEGER (ref escalas_quinzenas),
     data_inicio TEXT NOT NULL, data_fim TEXT NOT NULL,
     padrao_escala_id TEXT, base TEXT, observacoes TEXT,
     status TEXT DEFAULT 'planejado' CHECK ('planejado','confirmado','cancelado'),
     tripulacao_legado_id TEXT,
     created_by TEXT NOT NULL,
     created_at, updated_at, deleted_at
     CONSTRAINT: data_fim >= data_inicio
   Índices: por escala_id, por funcionario_id, por aeronave_id, por (escala_id, aeronave_id), por (data_inicio, data_fim)

2) 0250_escala_cobertura_diaria.sql
   Cria tabela escala_cobertura_diaria com:
     id INTEGER PK AUTOINCREMENT, escala_id TEXT NOT NULL, aeronave_id INTEGER NOT NULL,
     data TEXT NOT NULL, qtd_pic INTEGER DEFAULT 0, qtd_sic INTEGER DEFAULT 0,
     status_cobertura TEXT DEFAULT 'ok' CHECK ('ok','gap_pic','gap_sic','gap_total','excesso'),
     updated_at TEXT DEFAULT datetime('now')
     UNIQUE(escala_id, aeronave_id, data)
   Índices: por (escala_id, data), por (aeronave_id, data)

3) 0251_escala_template_alocacoes.sql
   Cria tabela escala_template_alocacoes com:
     id TEXT PK, template_id TEXT NOT NULL (ref escalas_templates_tripulacao ON DELETE CASCADE),
     funcao TEXT NOT NULL CHECK (mesmos de alocacoes), funcionario_id TEXT (ref funcionarios),
     padrao_escala_id TEXT, ordem INTEGER DEFAULT 0,
     created_at, updated_at, deleted_at
   ADD COLUMN migrado_para_v2 INTEGER DEFAULT 0 em escalas_templates_tripulacao
   Índice: por template_id

4) 0252_index_conflito_alocacoes.sql
   CREATE INDEX IF NOT EXISTS idx_eventos_funcionario_datas ON escala_eventos(funcionario_id, data_inicio, data_fim) WHERE deleted_at IS NULL AND status != 'cancelado'
   CREATE INDEX IF NOT EXISTS idx_alocacoes_funcionario_datas ON escala_alocacoes(funcionario_id, data_inicio, data_fim) WHERE deleted_at IS NULL
   ALTER TABLE escala_eventos ADD COLUMN alocacao_id TEXT REFERENCES escala_alocacoes(id)

=== FASE 2: Backend ===

Crie o arquivo worker-airtrust/src/routes/escalas-alocacoes.ts.

Este módulo expõe:

POST /:id/alocacoes
  - Autenticação: auth() + requireRole('admin','manager')
  - Parse do body com AlocacaoSchema (Zod — detalhado abaixo)
  - Verificações em ordem:
    1. Escala existe + não publicada
    2. Aeronave existe + pertence à empresa
    3. Funcionário existe + pertence à empresa
    4. Modelo de aeronave habilitado para o funcionário
       → buscar aeronave.modelo_codigo, depois funcionario.modelo_aeronave_id,
         depois modelos_aeronave tabela, comparar. Se não habilitado: 400 MODELO_NAO_HABILITADO
    5. CMA do funcionário: buscar em qualificacoes_historico, status vencido = bloqueio 409
    6. Sobreposição do funcionário: SELECT FROM escala_alocacoes WHERE funcionario_id=? e datas sobrepõem e deleted_at IS NULL → 409 SOBREPOSICAO_FUNCIONARIO
    7. Sobreposição do slot (aeronave+funcao): mesma query mas por aeronave_id+funcao → 409 SLOT_OCUPADO
    8. Restrição de par: apenas se existir outra alocação PIC/SIC na mesma aeronave no mesmo período → verificar restricoes_tripulacao
  - Inserir em escala_alocacoes com crypto.randomUUID()
  - Chamar gerarEventosBaseAlocacao() — versão atualizada de gerarEventosBase que:
    * usa alocacao_id no campo alocacao_id dos eventos
    * gera VOO para data_inicio→data_fim, FOLGA para restante do mês
  - Inserir em escala_auditoria: acao='CRIAR_ALOCACAO', realizado_por=userId
  - Chamar recalcularCoberturaDiaria(db, escalaId, aeronaveId) — função assíncrona
  - Retornar { success: true, data: { alocacao, alertas[], eventos_gerados } }

  AlocacaoSchema = z.object({
    funcionario_id: z.coerce.string().min(1),
    aeronave_id: z.coerce.number().int().positive(),
    funcao: z.enum(['PIC','SIC','PIC_CHK','SIC_CHK','INSTRUTOR','FLEX']),
    quinzena_id: z.coerce.number().int().positive().optional(),
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    padrao_escala_id: z.string().optional(),
    base: z.string().optional(),
    observacoes: z.string().max(500).optional(),
  }).refine(d => d.data_fim >= d.data_inicio, { message: 'data_fim >= data_inicio', path: ['data_fim'] })

GET /:id/alocacoes
  - Query params: aeronave_id? (número), funcao? (string), data? (YYYY-MM-DD)
  - SELECT * FROM escala_alocacoes JOIN funcionarios ON ... JOIN aeronaves ON ... WHERE escala_id=? AND deleted_at IS NULL
  - Se aeronave_id fornecido: AND aeronave_id=?
  - Se funcao fornecido: AND funcao=?
  - Se data fornecido: AND data_inicio <= ? AND data_fim >= ?
  - Retornar { success: true, data: { alocacoes, total } }

PUT /:id/alocacoes/:aid
  - Aceitar campos: funcao?, data_inicio?, data_fim?, status?, observacoes?
  - Revalidar sobreposição excluindo o próprio registro
  - Atualizar updated_at
  - Inserir em escala_auditoria: acao='EDITAR_ALOCACAO'
  - Recalcular cobertura
  - Retornar alocação atualizada

DELETE /:id/alocacoes/:aid
  - Soft delete (deleted_at = datetime('now'))
  - Remover eventos auto-gerados vinculados via alocacao_id (soft delete nos eventos com gerado_automaticamente=1 e alocacao_id=$aid)
  - Inserir em escala_auditoria: acao='REMOVER_ALOCACAO'
  - Recalcular cobertura
  - Retornar { success: true }

Crie também worker-airtrust/src/routes/escalas-cobertura.ts com:

GET /:id/cobertura
  - Query: aeronave_id? (se omitido retorna todas)
  - Tenta buscar de escala_cobertura_diaria (cache)
  - Se cache vazio (0 rows para a escala), recalcula on-the-fly
  - Retornar { success: true, data: { aeronaves: [{ aeronave_id, prefixo, modelo, dias: [{ data, qtd_pic, qtd_sic, status_cobertura }] }] } }

POST /:id/cobertura/recalcular
  - Recalcula escala_cobertura_diaria para toda a escala
  - Para cada aeronave com alocações na escala, para cada dia do mês:
    * qtd_pic = COUNT(alocacoes WHERE funcao LIKE 'PIC%' AND data_inicio <= dia AND data_fim >= dia)
    * qtd_sic = COUNT(alocacoes WHERE funcao LIKE 'SIC%' AND ...)
    * status_cobertura = 'gap_total' se qtd_pic=0 e qtd_sic=0, 'gap_pic' se qtd_pic=0, 'gap_sic' se qtd_sic=0, 'excesso' se algum >1, 'ok' caso contrário
  - Upsert na escala_cobertura_diaria
  - Retornar { success: true, data: { total_dias_calculados, aeronaves_processadas, gaps_detectados } }

Função auxiliar interna recalcularCoberturaDiaria(db, escalaId, aeronaveId):
  - Busca escala.mes + escala.ano
  - Itera cada dia do mês
  - Para cada dia: COUNT alocacoes PIC e SIC sobrepostos
  - Upsert em escala_cobertura_diaria
  - Cria ou resolve alertas em escala_alertas para gaps

Monte as novas rotas no escalas-core.ts:
  import alocacoes from './escalas-alocacoes'
  import cobertura from './escalas-cobertura'
  escalas.route('/', alocacoes)
  escalas.route('/', cobertura)

=== IMPORTANTE ===
- NÃO altere escalas-tripulacoes.ts — ele continua funcionando
- NÃO altere GradeGantt.tsx nem EscalasPage.tsx neste ciclo
- NÃO remova nenhuma rota existente
- NÃO gere arquivo de documentação ou resumo após a execução
- Aplique as migrations com: cd worker-airtrust && npx wrangler d1 execute airtrust-db --remote --env production --file migrations/0249_escala_alocacoes.sql
  e repita para 0250, 0251, 0252
- Ao final: npx wrangler deploy --env production
- Execute smoke-test mínimo: GET /api/escalas/:id/alocacoes e POST /api/escalas/:id/cobertura/recalcular
```

---

### Resumo executivo para o próximo ciclo (Fases 3 e 4)

Após as Fases 1 e 2 estarem estáveis em produção, o próximo prompt deve:

1. Redesenhar `GradeGantt.tsx` para agrupar por aeronave usando `alocacoes[]`.
2. Adicionar `BlocoAeronave.tsx` com botões de alocar PIC/SIC embutidos.
3. Reescrever `ModalAdicionarTripulacao.tsx` como wizard de 3 passos usando `POST /alocacoes`.
4. Atualizar `EscalasPage.tsx` — tela inicial com cartões de aeronave + cobertura.
5. Atualizar `useEscalasQuery.ts` — adicionar hooks para `alocacoes` e `cobertura`.
6. Implementar dual-write em `escalas-tripulacoes.ts` (escreve tanto no legado quanto no novo modelo).
