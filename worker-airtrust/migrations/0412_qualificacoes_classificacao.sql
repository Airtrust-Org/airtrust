-- ============================================================================
-- Migration 0412: Classificação de Qualificações — Formato + Categoria FK
-- Data: 2026-06-30
-- Objetivo:
--   Separar o campo `categoria` (que hoje carrega natureza + modalidade misturadas)
--   em dois conceitos distintos:
--     - categoria_id → natureza do requisito (FK para qualificacoes_categorias)
--     - formato_id   → modalidade de execução (FK para nova qualificacoes_formatos)
--   Adiciona também classe_requisito para distinguir tipo regulatório.
--   Adiciona snapshots opcionais em qualificacoes_historico.
--   Adiciona formato_id em lms_cursos (distinto de tipo_conteudo que é mídia técnica).
--
-- ATENÇÃO: NÃO aplicar em produção sem autorização explícita.
-- Nenhum campo legado é removido.
--
-- IDEMPOTÊNCIA:
--   - DML de backfill (seções 2, 4, 5, 6, 8, 10) É IDEMPOTENTE como SQL bruto.
--     Usa WHERE ... IS NULL / INSERT OR IGNORE — pode rodar 2x sem duplicar dados.
--   - DDL (seções 1, 3, 7, 9: CREATE TABLE, ALTER TABLE ADD COLUMN) NÃO é idempotente
--     como SQL bruto. ALTER TABLE ADD COLUMN falha se a coluna já existir.
--     A migration DEPENDE do runner/ledger aplicar este arquivo uma única vez.
--     NÃO reaplique o SQL bruto manualmente sem verificar se a DDL já foi aplicada.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference:
--     PR #216 — feat/qualificacoes-classificacao-consolidada.
--     Classificação de qualificações com separação conceitual Categoria/Formato/Modelo.
--   operational_decision:
--     Backfill DML é idempotente (WHERE ... IS NULL, INSERT OR IGNORE).
--     Nenhum campo legado é removido. Fallback NAO_CLASSIFICADO para tipos não-EAD.
--     Migration é somente aditiva — dados existentes não são deletados ou sobrescritos
--     com perda de informação.
--   dry_run_required:
--     Antes de aplicar em produção:
--       1. Rodar migration local em banco limpo e banco já migrado.
--       2. Executar validações de contagem pós-migration (seção 11 descomentada).
--       3. Verificar que nenhum tipo não-EAD recebeu formato PRESENCIAL.
--       4. Validar que lms_cursos.tipo_conteudo permaneceu intacto.
--   rollback_plan_required:
--     Rollback NÃO requer DML reverso (additive-only migration):
--       a. Reverter Worker deploy — novas colunas coexistem inofensivamente
--          com código que não as referencia (columnsSupport guards).
--       b. Se necessário remover artefatos: DROP TABLE qualificacoes_formatos;
--          ALTER TABLE qualificacoes_tipos DROP COLUMN formato_id,
--          DROP COLUMN categoria_id, DROP COLUMN classe_requisito;
--          ALTER TABLE qualificacoes_historico DROP COLUMN formato_id,
--          DROP COLUMN formato_codigo, DROP COLUMN categoria_id,
--          DROP COLUMN categoria_codigo;
--          ALTER TABLE lms_cursos DROP COLUMN formato_id.
--     Rollback de dados NÃO é necessário — nenhum dado legado é removido
--     ou alterado com perda de informação.
-- ============================================================================

-- ============================================================================
-- 1. TABELA qualificacoes_formatos
--    Modalidade de execução/registro de uma qualificação.
--    Exemplos: EAD, Presencial, Remoto, Voo, Simulador, Prático, Documental, Teórico
--    Não confundir com tipo_conteudo do LMS (scorm, h5p, pdf, pptx, video).
-- ============================================================================

CREATE TABLE IF NOT EXISTS qualificacoes_formatos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT    NOT NULL,
  codigo     TEXT    NOT NULL,
  descricao  TEXT,
  cor        TEXT    DEFAULT '#6B7280',
  ativo      INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_formatos_empresa_codigo_active
  ON qualificacoes_formatos(empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_formatos_empresa
  ON qualificacoes_formatos(empresa_id, ativo)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. SEED: formatos canônicos por empresa (idempotente via INSERT OR IGNORE)
--    Garante que toda empresa com tipos cadastrados tenha os formatos base.
-- ============================================================================

INSERT OR IGNORE INTO qualificacoes_formatos (nome, codigo, descricao, empresa_id, created_at, updated_at)
SELECT DISTINCT
  'EAD'           AS nome,
  'EAD'           AS codigo,
  'Treinamento a distância (EAD/e-learning). Vinculado ao LMS nativo.' AS descricao,
  empresa_id,
  datetime('now'),
  datetime('now')
FROM qualificacoes_tipos
WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO qualificacoes_formatos (nome, codigo, descricao, empresa_id, created_at, updated_at)
SELECT DISTINCT
  'Presencial'    AS nome,
  'PRESENCIAL'    AS codigo,
  'Treinamento ou avaliação presencial em sala ou campo.' AS descricao,
  empresa_id,
  datetime('now'),
  datetime('now')
FROM qualificacoes_tipos
WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO qualificacoes_formatos (nome, codigo, descricao, empresa_id, created_at, updated_at)
SELECT DISTINCT
  'Simulador'     AS nome,
  'SIMULADOR'     AS codigo,
  'Treinamento ou avaliação em dispositivo de treinamento por simulação (FSTD/FTD).' AS descricao,
  empresa_id,
  datetime('now'),
  datetime('now')
FROM qualificacoes_tipos
WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO qualificacoes_formatos (nome, codigo, descricao, empresa_id, created_at, updated_at)
SELECT DISTINCT
  'Voo'           AS nome,
  'VOO'           AS codigo,
  'Treinamento ou avaliação em aeronave real.' AS descricao,
  empresa_id,
  datetime('now'),
  datetime('now')
FROM qualificacoes_tipos
WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO qualificacoes_formatos (nome, codigo, descricao, empresa_id, created_at, updated_at)
SELECT DISTINCT
  'Remoto'        AS nome,
  'REMOTO'        AS codigo,
  'Treinamento ou avaliação síncrona online (videoconferência).' AS descricao,
  empresa_id,
  datetime('now'),
  datetime('now')
FROM qualificacoes_tipos
WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO qualificacoes_formatos (nome, codigo, descricao, empresa_id, created_at, updated_at)
SELECT DISTINCT
  'Documental'    AS nome,
  'DOCUMENTAL'    AS codigo,
  'Registro documental sem treinamento (exame médico, licença, habilitação).' AS descricao,
  empresa_id,
  datetime('now'),
  datetime('now')
FROM qualificacoes_tipos
WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO qualificacoes_formatos (nome, codigo, descricao, empresa_id, created_at, updated_at)
SELECT DISTINCT
  'Não classificado' AS nome,
  'NAO_CLASSIFICADO' AS codigo,
  'Formato ainda não atribuído. Reclassificar conforme evidência do dado.' AS descricao,
  empresa_id,
  datetime('now'),
  datetime('now')
FROM qualificacoes_tipos
WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. NOVAS COLUNAS em qualificacoes_tipos
-- ============================================================================

ALTER TABLE qualificacoes_tipos ADD COLUMN formato_id INTEGER REFERENCES qualificacoes_formatos(id);
ALTER TABLE qualificacoes_tipos ADD COLUMN categoria_id INTEGER REFERENCES qualificacoes_categorias(id);
ALTER TABLE qualificacoes_tipos ADD COLUMN classe_requisito TEXT
  CHECK(classe_requisito IS NULL OR classe_requisito IN ('TREINAMENTO','AVALIACAO','DOCUMENTO','EXPERIENCIA'));

CREATE INDEX IF NOT EXISTS idx_qt_formato
  ON qualificacoes_tipos(formato_id, empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qt_categoria_id
  ON qualificacoes_tipos(categoria_id, empresa_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. BACKFILL formato_id em qualificacoes_tipos (idempotente via WHERE ... IS NULL)
--    Regra conservadora — só atribui formato quando há evidência clara:
--      - categoria IN ('EAD','TREINAMENTO EAD') → formato = EAD
--      - demais → formato = NAO_CLASSIFICADO (reclassificação manual necessária)
--    Não usa PRESENCIAL como fallback universal — cada tipo deve ser classificado
--    conforme evidência do dado real (origem_tipo, dispositivo, local, etc.).
--    Não sobrescreve valor já preenchido.
-- ============================================================================

UPDATE qualificacoes_tipos
SET formato_id = (
  SELECT f.id FROM qualificacoes_formatos f
  WHERE f.empresa_id = qualificacoes_tipos.empresa_id
    AND f.codigo = 'EAD'
    AND f.deleted_at IS NULL
  LIMIT 1
),
updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND formato_id IS NULL
  AND UPPER(TRIM(COALESCE(categoria,''))) IN ('EAD', 'TREINAMENTO EAD');

UPDATE qualificacoes_tipos
SET formato_id = (
  SELECT f.id FROM qualificacoes_formatos f
  WHERE f.empresa_id = qualificacoes_tipos.empresa_id
    AND f.codigo = 'NAO_CLASSIFICADO'
    AND f.deleted_at IS NULL
  LIMIT 1
),
updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND formato_id IS NULL;

-- ============================================================================
-- 5. BACKFILL categoria_id em qualificacoes_tipos (idempotente via join string)
--    Converte o JOIN frágil por string em FK persistida.
-- ============================================================================

UPDATE qualificacoes_tipos
SET categoria_id = (
  SELECT qc.id FROM qualificacoes_categorias qc
  WHERE qc.empresa_id = qualificacoes_tipos.empresa_id
    AND UPPER(TRIM(qc.nome)) = UPPER(TRIM(COALESCE(qualificacoes_tipos.categoria,'')))
    AND qc.deleted_at IS NULL
  LIMIT 1
),
updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND categoria_id IS NULL
  AND categoria IS NOT NULL
  AND UPPER(TRIM(COALESCE(categoria,''))) NOT IN ('EAD','TREINAMENTO EAD');

-- ============================================================================
-- 6. BACKFILL classe_requisito em qualificacoes_tipos (idempotente)
-- ============================================================================

UPDATE qualificacoes_tipos
SET classe_requisito = 'AVALIACAO',
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND classe_requisito IS NULL
  AND is_check = 1;

UPDATE qualificacoes_tipos
SET classe_requisito = 'DOCUMENTO',
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND classe_requisito IS NULL
  AND UPPER(TRIM(COALESCE(categoria,''))) IN ('CMA','ASO','ATESTADO','LICENCA','CNOH','CANAC','HABILITACAO');

UPDATE qualificacoes_tipos
SET classe_requisito = 'TREINAMENTO',
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND classe_requisito IS NULL;

-- ============================================================================
-- 7. NOVAS COLUNAS em qualificacoes_historico (snapshots — nullable)
-- ============================================================================

ALTER TABLE qualificacoes_historico ADD COLUMN formato_id INTEGER REFERENCES qualificacoes_formatos(id);
ALTER TABLE qualificacoes_historico ADD COLUMN formato_codigo TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN categoria_id INTEGER REFERENCES qualificacoes_categorias(id);
ALTER TABLE qualificacoes_historico ADD COLUMN categoria_codigo TEXT;

CREATE INDEX IF NOT EXISTS idx_qh_formato
  ON qualificacoes_historico(formato_id, empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qh_categoria_id
  ON qualificacoes_historico(categoria_id, empresa_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- 8. BACKFILL snapshots em qualificacoes_historico (idempotente)
--    Só preenche registros com qualificacao_id conhecido.
--    Não altera campos legados (categoria texto).
-- ============================================================================

UPDATE qualificacoes_historico
SET
  formato_id = (
    SELECT qt.formato_id FROM qualificacoes_tipos qt
    WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL LIMIT 1
  ),
  formato_codigo = (
    SELECT f.codigo
    FROM qualificacoes_tipos qt
    JOIN qualificacoes_formatos f ON f.id = qt.formato_id
    WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL LIMIT 1
  ),
  categoria_id = (
    SELECT qt.categoria_id FROM qualificacoes_tipos qt
    WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL LIMIT 1
  ),
  categoria_codigo = (
    SELECT qc.codigo
    FROM qualificacoes_tipos qt
    JOIN qualificacoes_categorias qc ON qc.id = qt.categoria_id
    WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL LIMIT 1
  ),
  updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND qualificacao_id IS NOT NULL
  AND formato_id IS NULL;

-- ============================================================================
-- 9. NOVA COLUNA em lms_cursos
--    formato_id representa o formato da qualificação vinculada (EAD).
--    NÃO substitui tipo_conteudo (scorm/h5p/pdf/pptx/video = mídia técnica do player).
-- ============================================================================

ALTER TABLE lms_cursos ADD COLUMN formato_id INTEGER REFERENCES qualificacoes_formatos(id);

CREATE INDEX IF NOT EXISTS idx_lms_cursos_formato
  ON lms_cursos(formato_id, empresa_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- 10. BACKFILL formato_id em lms_cursos (idempotente)
--     Todo curso LMS é, por definição regulatória, formato EAD.
--     tipo_conteudo permanece intacto (é a mídia, não o formato da qualificação).
-- ============================================================================

UPDATE lms_cursos
SET formato_id = (
  SELECT f.id FROM qualificacoes_formatos f
  WHERE f.empresa_id = lms_cursos.empresa_id
    AND f.codigo = 'EAD'
    AND f.deleted_at IS NULL
  LIMIT 1
),
updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND formato_id IS NULL;

-- ============================================================================
-- VALIDAÇÃO PÓS-MIGRATION (descomentar para auditar em local)
-- SELECT 'formatos_total' AS check_item, COUNT(*) AS valor FROM qualificacoes_formatos WHERE deleted_at IS NULL
-- UNION ALL
-- SELECT 'tipos_sem_formato', COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL AND formato_id IS NULL
-- UNION ALL
-- SELECT 'historico_sem_formato', COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL AND qualificacao_id IS NOT NULL AND formato_id IS NULL
-- UNION ALL
-- SELECT 'lms_sem_formato', COUNT(*) FROM lms_cursos WHERE deleted_at IS NULL AND formato_id IS NULL;
-- ============================================================================
