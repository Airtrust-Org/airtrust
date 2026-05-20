-- ================================================================
-- Migration 0137: Correções Completas do Sistema de Certificados
-- Data: 2025-11-29
-- Base: AUDITORIA_CERTIFICADOS_COMPLETA_29NOV2025.md
-- ================================================================

-- ========================================
-- 1. CRIAR ÍNDICES FALTANTES (PERFORMANCE)
-- ========================================

CREATE INDEX IF NOT EXISTS idx_documentos_r2_key 
ON documentos(r2_key) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_tipo 
ON documentos(tipo) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_tipo
ON documentos(funcionario_id, tipo) WHERE deleted_at IS NULL;

-- ========================================
-- 2. POPULAR certificado_arquivo_id (FK para documentos)
-- ========================================

UPDATE qualificacoes_historico
SET certificado_arquivo_id = (
  SELECT d.uuid 
  FROM documentos d
  WHERE d.funcionario_id = qualificacoes_historico.funcionario_id
    AND d.r2_key LIKE 'certificados/CERT-%' || qualificacoes_historico.qualificacao_codigo || '%'
    AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC
  LIMIT 1
)
WHERE certificado_arquivo_id IS NULL
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM documentos d2
    WHERE d2.funcionario_id = qualificacoes_historico.funcionario_id
      AND d2.r2_key LIKE 'certificados/CERT-%'
      AND d2.deleted_at IS NULL
  );

-- ========================================
-- 3. POPULAR arquivo_url (acesso rápido)
-- ========================================

UPDATE qualificacoes_historico
SET arquivo_url = (
  SELECT '/api/certificados/stream/' || d.id
  FROM documentos d
  WHERE d.uuid = qualificacoes_historico.certificado_arquivo_id
    AND d.deleted_at IS NULL
)
WHERE certificado_arquivo_id IS NOT NULL
  AND (arquivo_url IS NULL OR arquivo_url = '')
  AND deleted_at IS NULL;

-- ========================================
-- 4. CRIAR TABELA DE AUDITORIA DE DOWNLOADS
-- ========================================

CREATE TABLE IF NOT EXISTS documentos_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL,
  usuario_id INTEGER,
  usuario_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_downloads_documento 
ON documentos_downloads(documento_id);

CREATE INDEX IF NOT EXISTS idx_downloads_usuario 
ON documentos_downloads(usuario_id) WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_downloads_data 
ON documentos_downloads(downloaded_at);

-- ========================================
-- 5. CRIAR VIEW DE CERTIFICADOS COMPLETOS
-- ========================================

DROP VIEW IF EXISTS v_certificados_completos;

CREATE VIEW v_certificados_completos AS
SELECT 
  d.id AS documento_id,
  d.uuid,
  d.nome_arquivo,
  d.tamanho,
  d.r2_key,
  d.tipo,
  d.created_at AS upload_at,
  qh.id AS qualificacao_id,
  qh.funcionario_cpf,
  qh.qualificacao_codigo,
  qh.numero_certificado,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.arquivo_url,
  f.id AS funcionario_id,
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.codigo_anac,
  qt.nome AS qualificacao_nome,
  qt.categoria,
  COALESCE(
    (SELECT COUNT(*) FROM documentos_downloads dd WHERE dd.documento_id = d.id),
    0
  ) AS total_downloads
FROM documentos d
LEFT JOIN qualificacoes_historico qh 
  ON d.uuid = qh.certificado_arquivo_id
LEFT JOIN funcionarios f 
  ON qh.funcionario_cpf = f.cpf
LEFT JOIN qualificacoes_tipos qt 
  ON qh.qualificacao_codigo = qt.codigo
WHERE d.deleted_at IS NULL
  AND (qh.deleted_at IS NULL OR qh.deleted_at IS NULL);

-- ========================================
-- 6. AUDITORIA DA MIGRATION
-- ========================================

SELECT 
  '0137_fix_certificados_completo' AS migration,
  (SELECT COUNT(*) FROM documentos WHERE deleted_at IS NULL) AS total_documentos,
  (SELECT COUNT(*) FROM qualificacoes_historico WHERE certificado_arquivo_id IS NOT NULL) AS qualifs_com_certificado,
  (SELECT COUNT(*) FROM documentos_downloads) AS total_downloads_registrados,
  datetime('now') AS executed_at;
