-- ============================================================
-- Migration 0138: Melhorias completas no sistema de certificados
-- Data: 29/11/2025
-- Descrição: Implementa todos os gaps identificados na auditoria
-- ============================================================

-- GAP #2: Índices faltantes para performance
CREATE INDEX IF NOT EXISTS idx_documentos_r2_key 
  ON documentos(r2_key) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_tipo 
  ON documentos(tipo) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_tipo
  ON documentos(funcionario_id, tipo)
  WHERE deleted_at IS NULL;

-- GAP #3: Auditoria de downloads (compliance)
CREATE TABLE IF NOT EXISTS documentos_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL,
  usuario_id INTEGER,
  usuario_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (documento_id) REFERENCES documentos(id)
);

CREATE INDEX IF NOT EXISTS idx_downloads_documento 
  ON documentos_downloads(documento_id);

CREATE INDEX IF NOT EXISTS idx_downloads_usuario 
  ON documentos_downloads(usuario_id);

CREATE INDEX IF NOT EXISTS idx_downloads_data 
  ON documentos_downloads(downloaded_at);

-- GAP #4: Popular certificado_arquivo_id em qualificacoes_historico
-- Atualiza registros existentes que têm certificado mas FK está NULL
UPDATE qualificacoes_historico
SET certificado_arquivo_id = (
  SELECT d.uuid 
  FROM documentos d
  WHERE d.funcionario_id = qualificacoes_historico.funcionario_id
    AND d.tipo = 'application/pdf'
    AND d.deleted_at IS NULL
    AND d.r2_key LIKE '%CERT-%'
  LIMIT 1
)
WHERE certificado_arquivo_id IS NULL
  AND arquivo_url IS NOT NULL
  AND deleted_at IS NULL;

-- GAP #5: View para facilitar consultas de certificados completos
CREATE VIEW IF NOT EXISTS v_certificados_completos AS
SELECT 
  d.id AS documento_id,
  d.uuid AS documento_uuid,
  d.nome_arquivo,
  d.tamanho,
  d.r2_key,
  d.descricao,
  d.created_at AS upload_date,
  f.id AS funcionario_id,
  f.nome AS funcionario_nome,
  f.cpf AS funcionario_cpf,
  qh.id AS qualificacao_historico_id,
  qh.qualificacao_codigo,
  qt.nome AS qualificacao_nome,
  qt.categoria AS qualificacao_categoria,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.numero_certificado,
  CASE 
    WHEN qh.data_vencimento IS NULL THEN 'VALIDO'
    WHEN DATE(qh.data_vencimento) >= DATE('now') THEN 'VALIDO'
    ELSE 'VENCIDO'
  END AS status_validade
FROM documentos d
INNER JOIN funcionarios f ON d.funcionario_id = f.id
LEFT JOIN qualificacoes_historico qh ON d.uuid = qh.certificado_arquivo_id
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_codigo = qt.codigo
WHERE d.tipo = 'application/pdf'
  AND d.r2_key LIKE 'certificados/%'
  AND d.deleted_at IS NULL
  AND f.deleted_at IS NULL;

-- GAP #6: Trigger para atualizar arquivo_url automaticamente
CREATE TRIGGER IF NOT EXISTS trg_documentos_update_url
AFTER INSERT ON documentos
WHEN NEW.tipo = 'application/pdf' AND NEW.r2_key LIKE 'certificados/%'
BEGIN
  UPDATE qualificacoes_historico
  SET arquivo_url = '/api/certificados/stream/' || NEW.id,
      certificado_arquivo_id = NEW.uuid,
      updated_at = datetime('now')
  WHERE funcionario_id = NEW.funcionario_id
    AND certificado_arquivo_id IS NULL
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;
END;

-- GAP #7: Índice composto para queries de certificados por CPF
CREATE INDEX IF NOT EXISTS idx_historico_cpf_codigo
  ON qualificacoes_historico(funcionario_cpf, qualificacao_codigo)
  WHERE deleted_at IS NULL;

-- ============================================================
-- Verificações de integridade
-- ============================================================

-- Conta certificados sem FK
-- SELECT COUNT(*) AS certificados_sem_fk
-- FROM qualificacoes_historico
-- WHERE arquivo_url IS NOT NULL 
--   AND certificado_arquivo_id IS NULL
--   AND deleted_at IS NULL;

-- Lista certificados duplicados (mesmo CPF + código + data)
-- SELECT funcionario_cpf, qualificacao_codigo, data_conclusao, COUNT(*) as total
-- FROM qualificacoes_historico
-- WHERE deleted_at IS NULL
-- GROUP BY funcionario_cpf, qualificacao_codigo, data_conclusao
-- HAVING COUNT(*) > 1;
