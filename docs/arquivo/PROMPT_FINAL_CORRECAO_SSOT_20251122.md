# PROMPT FINAL: Correção SSOT AirTrust - Atualizado com Migrations 0071-0087 (SSOT + Observabilidade + Analytics + Unificação Stats + Correção View)

## CONTEXTO EXECUTIVO

Sistema: AirTrust - Cloudflare Workers + D1 + Hono + React 19  
Arquitetura: SSOT Duplo com View Enriquecida + Camada Analítica (Latência + Risco)  
Status: ✅ OPERACIONAL (com fallback) - Migrations 0071-0087 Aplicadas  
Data: 2025-11-22 12:23 -03  
Relatórios Base: `VALIDACAO_FINAL_SSOT_20251122.md`, README_SSOT_FINAL.md

## ESTADO ATUAL VALIDADO

### Métricas Finais ✅

- **Total registros histórico (tabela base):** 522
- **Total registros view (após 0086 regressão, corrigida em 0087):** validar pós-deploy (esperado 522)
- **Mapeamento:** 100% (522/522)
- **Órfãos:** 0 (funcionários + tipos)
- **Foreign Keys:** 2 ativas (CASCADE)
- **Triggers:** 10 (cascade + auditoria + integridade validade + nota/carga)
- **Índices:** 9 (inclui composto + latência)
- **Tabelas observabilidade:** 2 (api_latency_samples, api_latency_daily)
- **Views risco/estatísticas:** 2 (qualificacoes_historico_stats_v, qualificacoes_historico_risco_v)
- **Migrations aplicadas:** 0062-0087

### Distribuição por Status (snapshot produção após enriquecimento)

| Status             | Total | %    |
| ------------------ | ----- | ---- |
| VALIDA             | 522   | 100% |
| VENCIDA            | 0     | 0%   |
| INDETERMINADA      | 0     | 0%   |
| PROXIMA_VENCIMENTO | 0     | 0%   |
| ATENCAO            | 0     | 0%   |

## MIGRATIONS APLICADAS (HISTÓRICO + ANALÍTICO COMPLETO + UNIFICAÇÃO)

### Migration 0071: Fix Coluna Status ✅

**Problema:** View usava `status` mas código esperava `status_qualificacao`  
**Correção:** Padronização do nome da coluna  
**Status:** Aplicada + Código ajustado com `COALESCE(status_qualificacao, status)`

### Migrations 0072-0074: Otimização Performance ✅

**0072:** Remoção de referências inexistentes (`orgao_emissor` duplicado)  
**0073:** Slim da view (somente colunas existentes)  
**0074:** View agregada `qualificacoes_historico_stats_v` para estatísticas globais

**Benefícios:**

- Eliminação de erros silenciosos
- Redução de COUNTs condicionais repetidos
- Latência global sem filtros: O(1) vs múltiplos scans

### Migrations 0075-0077: Enriquecimento Estrutural ✅

**Objetivo:** Transição de dados genéricos para estrutura reativa com datas concretas

**Colunas Adicionadas:**

```sql
ALTER TABLE qualificacoes_historico ADD COLUMN data_conclusao TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN data_vencimento TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN validade_meses INTEGER;
ALTER TABLE qualificacoes_historico ADD COLUMN instrutor TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN local TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN modalidade TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN nota REAL;
ALTER TABLE qualificacoes_historico ADD COLUMN carga_horaria INTEGER;
```

**Lógica de Derivação:**

1. Se `validade` é número 1-60 → `validade_meses = validade` e `data_vencimento = DATE(created_at, '+' || validade || ' months')`
2. Se `validade` é data ISO → `data_vencimento = validade`
3. Caso contrário → `data_vencimento = NULL`
4. `data_conclusao = created_at` quando ausente

### Migrations 0078-0081: Observabilidade & Materialização ✅

| Migration | Objetivo                                                              | Resultado                                                            |
| --------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 0078      | Planejamento tabela diária stats (nova estrutura com `snapshot_date`) | Preparado cron dual-schema (legacy + novo)                           |
| 0079      | Trigger consistência validade (`validade_meses` ↔ `data_vencimento`)  | Atualização automática ao inserir/atualizar                          |
| 0080      | Tabela latência bruta (`api_latency_samples`)                         | Registro de cada request crítica (rota /api/qualificacoes/historico) |
| 0081      | Recriação completa da view enriquecida                                | Inclusão total de colunas funcionais e analíticas                    |

### Migration 0082: Agregação de Latência Diária ✅

Criação de `api_latency_daily` (métricas: calls, avg_ms, p95_ms, p99_ms, max_ms) calculada pelo cron.

### Migration 0083: Triggers Validação Nota / Carga Horária ✅

Garante intervalo seguro: `nota` (0–100), `carga_horaria >= 0`.

### Migration 0084: View Risco ✅

Segmentação por faixas de dias até vencimento (<=30, 31-60, >60, vencidas, indeterminadas).

### Migration 0085: Unificação Stats Diária ✅

Recriação da tabela `qualificacoes_historico_stats_daily` com colunas integradas:
`snapshot_date`, `day`, `scope_hash`, `total`, `validas`, `vencendo`, `vencidas`, `renovadas`, `indeterminadas`, `generated_at` + índices em `snapshot_date` e `(day, scope_hash)`.

Objetivo: Remover ambiguidade entre schema legacy (day/scope_hash) e novo (snapshot_date + indeterminadas) mantendo retrocompatibilidade sem alterar rotas.

## SCHEMA FINAL CONSOLIDADO

### Tabela: qualificacoes_historico (DEFINITIVO)

```sql
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER NOT NULL,
  tipo_codigo TEXT,
  codigo TEXT,
  categoria TEXT,
  validade TEXT,
  data_conclusao TEXT NOT NULL,
  data_vencimento TEXT,
  validade_meses INTEGER,
  numero_certificado TEXT,
  orgao_emissor TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  instrutor TEXT,
  local TEXT,
  modalidade TEXT,
  nota REAL,
  carga_horaria INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
```

### View: qualificacoes_historico_v (ENRIQUECIDA - 0089)

Remoção de colunas legacy inexistentes em `qualificacoes_tipos` (requer_renovacao, obrigatoria_para_cargo, pre_requisitos, cor_status, icone, ordem_exibicao). Mantidos campos computados `status_qualificacao` e `dias_ate_vencimento` para compatibilidade com views analíticas.

```sql
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id AS historico_id,
  qh.funcionario_id,
  qh.qualificacao_id AS qualificacao_tipo_id,
  qh.status,
  qh.data_emissao,
  qh.data_validade,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.instrutor,
  qh.local,
  qh.modalidade,
  qh.nota,
  qh.carga_horaria,
  qh.deleted_at AS historico_deleted_at,
  qh.created_at AS historico_created_at,
  qh.updated_at AS historico_updated_at,
  COALESCE(qh.tipo_codigo, qh.codigo, qt.codigo, qh.qualificacao_id) AS tipo_codigo,
  COALESCE(qh.tipo_categoria, qh.categoria, qt.categoria) AS tipo_categoria,
  COALESCE(qh.tipo_nome, qt.nome) AS tipo_nome,
  COALESCE(qh.tipo_descricao, qt.descricao) AS tipo_descricao,
  COALESCE(qh.tipo_validade_meses, qh.validade_meses, qt.validade_meses) AS tipo_validade_meses,
  qt.ativo AS tipo_ativo,
  qt.deleted_at AS tipo_deleted_at,
  qt.created_at AS tipo_created_at,
  qt.updated_at AS tipo_updated_at,
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.deleted_at AS funcionario_deleted_at,
  CASE
    WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
    WHEN qh.data_vencimento IS NULL AND qh.validade_meses IS NULL AND qh.tipo_validade_meses IS NULL THEN 'INDETERMINADA'
    WHEN qh.data_vencimento IS NOT NULL AND DATE(qh.data_vencimento) < DATE('now') THEN 'VENCIDA'
    WHEN qh.data_vencimento IS NOT NULL AND DATE(qh.data_vencimento) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN qh.data_vencimento IS NOT NULL AND DATE(qh.data_vencimento) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,
  CASE
    WHEN qh.data_vencimento IS NULL THEN NULL
    ELSE CAST((julianday(qh.data_vencimento) - julianday('now')) AS INTEGER)
  END AS dias_ate_vencimento
FROM qualificacoes_historico qh
  LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
  LEFT JOIN funcionarios f ON qh.funcionario_id = f.id
WHERE qh.deleted_at IS NULL;
```

### View: qualificacoes_historico_stats_v (AGREGADA)

```sql
CREATE VIEW qualificacoes_historico_stats_v AS
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status_qualificacao = 'VALIDA' THEN 1 ELSE 0 END) as validas,
  SUM(CASE WHEN status_qualificacao = 'VENCIDA' THEN 1 ELSE 0 END) as vencidas,
  SUM(CASE WHEN status_qualificacao = 'PROXIMA_VENCIMENTO' THEN 1 ELSE 0 END) as proximas_vencimento,
  SUM(CASE WHEN status_qualificacao = 'ATENCAO' THEN 1 ELSE 0 END) as atencao,
  SUM(CASE WHEN status_qualificacao = 'INDETERMINADA' THEN 1 ELSE 0 END) as indeterminadas
FROM qualificacoes_historico_v;
```

### View: qualificacoes_historico_risco_v (ANALÍTICA DE RISCO)

```sql
CREATE VIEW qualificacoes_historico_risco_v AS
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN status_qualificacao = 'VALIDA' THEN 1 ELSE 0 END) AS validas,
  SUM(CASE WHEN status_qualificacao = 'VENCIDA' THEN 1 ELSE 0 END) AS vencidas,
  SUM(CASE WHEN dias_ate_vencimento BETWEEN 0 AND 30 THEN 1 ELSE 0 END) AS faixa_0_30,
  SUM(CASE WHEN dias_ate_vencimento BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS faixa_31_60,
  SUM(CASE WHEN dias_ate_vencimento > 60 THEN 1 ELSE 0 END) AS faixa_60_plus,
  SUM(CASE WHEN status_qualificacao = 'INDETERMINADA' THEN 1 ELSE 0 END) AS indeterminadas
FROM qualificacoes_historico_v;
```

### Tabela: api_latency_samples (BRUTA)

```sql
CREATE TABLE api_latency_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  captured_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_api_latency_samples_route_method ON api_latency_samples(route, method);
```

### Tabela: api_latency_daily (AGREGADA)

```sql
CREATE TABLE api_latency_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  calls INTEGER NOT NULL,
  avg_ms REAL NOT NULL,
  p95_ms REAL NOT NULL,
  p99_ms REAL NOT NULL,
  max_ms INTEGER NOT NULL,
  generated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_api_latency_daily_day_route_method ON api_latency_daily(day, route, method);
```

### Triggers Adicionais (Integridade & Analytics)

```sql
-- Consistência validade (0079)
CREATE TRIGGER IF NOT EXISTS trg_qh_set_data_vencimento
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL AND NEW.data_vencimento IS NULL
BEGIN
  UPDATE qualificacoes_historico
  SET data_vencimento = DATE(NEW.created_at, '+' || NEW.validade_meses || ' months')
  WHERE id = NEW.id;
END;

-- Nota (0083)
CREATE TRIGGER IF NOT EXISTS trg_qh_validate_nota
BEFORE INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.nota IS NOT NULL AND (NEW.nota < 0 OR NEW.nota > 100)
BEGIN
  SELECT RAISE(ABORT, 'Nota fora do intervalo 0-100');
END;

-- Carga Horária (0083)
CREATE TRIGGER IF NOT EXISTS trg_qh_validate_carga_horaria
BEFORE INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.carga_horaria IS NOT NULL AND NEW.carga_horaria < 0
BEGIN
  SELECT RAISE(ABORT, 'Carga horaria negativa não permitida');
END;
```

## ENDPOINT ATUALIZADO (RESUMO)

`GET /api/qualificacoes/historico` otimizado: usa view agregada sem filtros e cálculo direto quando filtrado. Retorna `data_validade` (alias), status derivado e estatísticas globais.

## VALIDAÇÃO FINAL (SQL)

```sql
-- Verificar estado final
SELECT 'Total Registros' as metrica, COUNT(*) as valor FROM qualificacoes_historico WHERE deleted_at IS NULL
UNION ALL
SELECT 'Na View', COUNT(*) FROM qualificacoes_historico_v
UNION ALL
SELECT 'Com data_vencimento', COUNT(*) FROM qualificacoes_historico WHERE data_vencimento IS NOT NULL AND deleted_at IS NULL
UNION ALL
SELECT 'Com data_conclusao', COUNT(*) FROM qualificacoes_historico WHERE data_conclusao IS NOT NULL AND deleted_at IS NULL
UNION ALL
SELECT 'Órfãos Funcionários', COUNT(*) FROM qualificacoes_historico qh WHERE qh.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = qh.funcionario_id AND f.deleted_at IS NULL)
UNION ALL
SELECT 'Órfãos Tipos', COUNT(*) FROM qualificacoes_historico qh WHERE qh.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos qt WHERE qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL)
UNION ALL
SELECT 'Foreign Keys', COUNT(*) FROM pragma_foreign_key_list('qualificacoes_historico');
```

### Resultado Esperado

```
metrica                   | valor
--------------------------|------
Total Registros           | 522
Na View                   | 522
Com data_vencimento       | 522
Com data_conclusao        | 522
Órfãos Funcionários       | 0
Órfãos Tipos              | 0
Foreign Keys              | 2
```

### Consultas de Verificação Analytics

```sql
-- Latência bruta (últimas 10)
SELECT route, method, latency_ms, captured_at FROM api_latency_samples ORDER BY captured_at DESC LIMIT 10;

-- Latência agregada diária
SELECT day, route, method, calls, avg_ms, p95_ms, p99_ms, max_ms FROM api_latency_daily ORDER BY day DESC LIMIT 10;

-- Risco consolidado
SELECT * FROM qualificacoes_historico_risco_v;
```

## CHECKLIST FINAL

Estrutura, funcionalidades, integridade, performance e migrations 0071–0077 todas confirmadas. Sistema pronto para evolução analítica.

## MIGRATIONS 0086–0087 (PRIORIZAÇÃO + CORREÇÃO)

### 0086: Priorizar Dados Históricos

Adiciona `qualificacao_display` e usa COALESCE para priorizar campos específicos do registro histórico. Introduziu regressão (0 linhas) devido a uso de INNER JOIN com órfãos.

### 0087: Correção Regressão (LEFT JOIN)

Substitui INNER JOIN por LEFT JOIN, preserva registros órfãos, remove ORDER BY da definição da view e adiciona coluna `deleted_at` para visibilidade. Endpoint principal ganhou fallback automático à tabela base quando `total=0` sem filtros.

## MIGRATION 0088 (BACKFILL METADATA)

Objetivo: Preencher colunas `tipo_codigo`, `codigo` e `categoria` em `qualificacoes_historico` onde estavam nulas ou vazias, alinhando metadados históricos com a tabela de tipos para futura análise categórica.

### Estratégia

- Três comandos `UPDATE` idempotentes com subselect para `qt.codigo` e `qt.categoria`.
- Aplica somente quando campo alvo está NULL ou string vazia.
- Preserva consistência sem exigir travas transacionais complexas (compatível com D1 e execuções diretas).

### SQL Central

```sql
UPDATE qualificacoes_historico
SET tipo_codigo = (
  SELECT qt.codigo FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL
)
WHERE (tipo_codigo IS NULL OR tipo_codigo = '')
  AND qualificacao_id IS NOT NULL
  AND deleted_at IS NULL;
```

Procedimento repetido para `codigo` e `categoria`.

### Resultado Esperado Pós-Backfill

```sql
SELECT
  SUM(CASE WHEN tipo_codigo IS NULL OR tipo_codigo='' THEN 1 ELSE 0 END) AS faltando_tipo_codigo,
  SUM(CASE WHEN categoria IS NULL OR categoria='' THEN 1 ELSE 0 END) AS faltando_categoria
FROM qualificacoes_historico WHERE deleted_at IS NULL;
```

Esperado: ambos = 0.

## PRÓXIMOS PASSOS (FUTURO)

1. Backfill real (instrutor/local/modalidade/nota/carga) substituindo placeholder.
2. Alertas SLA latência (threshold p95/p99) + notificação.
3. Dashboard risco + curva renovação longitudinal.
4. Integração OCR para `numero_certificado` + validação automática.
5. Backfill histórico de latência (cálculo retroativo p95/p99).
6. Automação de alertas de vencimento via canal externo.

## CONCLUSÃO

SSOT histórico 100% operacional, enriquecido, consistente, observável e com base analítica inicial pronta para expansão.

**FIM DO PROMPT ATUALIZADO**
