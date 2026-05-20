-- Migration 0097: Rebuild unificado de qualificacoes_historico
-- Data: 2025-11-23
-- Objetivo: eliminar necessidade de view auxiliar e padronizar totalmente a tabela
-- Estratégia: criar tabela nova com schema canônico e copiar dados usando COALESCE para colunas legado.
-- Seguro: Idempotente parcial (só deve rodar uma vez). Antes de executar em produção, faça backup.
-- Requisitos atendidos:
--  - Nomes padronizados: data_conclusao, data_vencimento, codigo, categoria
--  - Inclui status armazenado (para queries simples) + possibilidade de cálculo futuro
--  - Mantém created_at/updated_at/deleted_at para auditoria e soft delete
--  - Usa COALESCE para migrar possíveis colunas antigas: data_obtencao, data_validade, tipo_codigo, certificado_url, local_treinamento, historico_observacoes
--  - Recria índices e trigger updated_at
--  - Remove view antiga qualificacoes_historico_v (desnecessária pós-normalização)

BEGIN TRANSACTION;

-- 1. Verificar se já foi reconstruída (se nova coluna arquivo_url existir e antigas nao existem, abortar)
-- (SQLite não possui IF/THEN direto; assumimos execução única)

-- 2. Criar tabela nova com schema canônico
CREATE TABLE IF NOT EXISTS qualificacoes_historico_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER NOT NULL,
  data_conclusao TEXT,            -- ISO date
  data_vencimento TEXT,           -- ISO date
  validade_meses INTEGER,
  codigo TEXT,                    -- Código da qualificação (clean)
  categoria TEXT,                 -- Categoria derivada do tipo
  numero_certificado TEXT,
  observacoes TEXT,
  arquivo_url TEXT,               -- URL arquivo certificado (R2)
  nota REAL,
  instrutor TEXT,
  local TEXT,
  modalidade TEXT,
  carga_horaria INTEGER,
  status TEXT DEFAULT 'VALIDA' CHECK (status IN ('VALIDA','VENCIDA','PROXIMA_VENCIMENTO','ATENCAO','INDETERMINADA','REMOVIDA')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id)
);

-- 3. Copiar dados existentes se ainda não migrado (detectar se new está vazio)
INSERT INTO qualificacoes_historico_new (
  id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, validade_meses, codigo, categoria,
  numero_certificado, observacoes, arquivo_url, nota, instrutor, local, modalidade, carga_horaria,
  status, created_at, updated_at, deleted_at
)
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  COALESCE(qh.data_conclusao, qh.data_obtencao) AS data_conclusao,
  COALESCE(qh.data_vencimento, qh.data_validade) AS data_vencimento,
  COALESCE(qh.validade_meses, (SELECT qt.validade_meses FROM qualificacoes_tipos qt WHERE qt.id = qh.qualificacao_id)) AS validade_meses,
  COALESCE(qh.codigo, qh.tipo_codigo, (SELECT qt.codigo FROM qualificacoes_tipos qt WHERE qt.id = qh.qualificacao_id)) AS codigo,
  COALESCE(qh.categoria, (SELECT qt.categoria FROM qualificacoes_tipos qt WHERE qt.id = qh.qualificacao_id)) AS categoria,
  qh.numero_certificado,
  COALESCE(qh.observacoes, qh.historico_observacoes) AS observacoes,
  COALESCE(qh.arquivo_url, qh.certificado_url) AS arquivo_url,
  qh.nota,
  qh.instrutor,
  COALESCE(qh.local, qh.local_treinamento) AS local,
  qh.modalidade,
  qh.carga_horaria,
  CASE
    WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
    WHEN COALESCE(qh.data_vencimento, qh.data_validade) IS NULL THEN 'INDETERMINADA'
    WHEN DATE(COALESCE(qh.data_vencimento, qh.data_validade)) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(COALESCE(qh.data_vencimento, qh.data_validade)) BETWEEN DATE('now') AND DATE('now','+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(COALESCE(qh.data_vencimento, qh.data_validade)) BETWEEN DATE('now','+31 days') AND DATE('now','+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at
FROM qualificacoes_historico qh
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_historico_new LIMIT 1);

-- 4. Substituir tabela antiga pelo novo schema
DROP TABLE IF EXISTS qualificacoes_historico;
ALTER TABLE qualificacoes_historico_new RENAME TO qualificacoes_historico;

-- 5. Remover view antiga
DROP VIEW IF EXISTS qualificacoes_historico_v;

-- 6. Recriar índices unificados
CREATE INDEX IF NOT EXISTS idx_qh_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_qualificacao ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_codigo ON qualificacoes_historico(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_categoria ON qualificacoes_historico(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_certificado ON qualificacoes_historico(numero_certificado) WHERE deleted_at IS NULL;

-- 7. Trigger updated_at
DROP TRIGGER IF EXISTS trg_qh_updated_at;
CREATE TRIGGER trg_qh_updated_at
AFTER UPDATE ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE qualificacoes_historico SET updated_at = datetime('now') WHERE id = NEW.id;
END;

COMMIT;

-- Checklist pós-migração:
-- 1. PRAGMA table_info('qualificacoes_historico') verificar nova estrutura
-- 2. SELECT * FROM qualificacoes_historico LIMIT 5 para validar dados
-- 3. EXPLAIN QUERY PLAN nas principais consultas (expiração e listagens) para confirmar uso de índices
-- 4. Ajustar API/serviços para não depender mais de view antiga
-- 5. Confirmar geração de status coerente para amostras (comparar datas)
-- 6. Iniciar desenvolvimento de ETL usando staging criado em 0095
