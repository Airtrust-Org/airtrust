-- Sistemas de Geração e Gestão de Certificados
-- Data: 2025-11-02
-- Versionamento, upload, template dinâmico com auditoria

-- ============================================================
-- 1. Alterar tabela tipos_qualificacoes para adicionar conteúdo programático
-- ============================================================

-- NOTA: Esta coluna pode já existir, será silenciosamente ignorada se erro
-- ALTER TABLE tipos_qualificacoes ADD COLUMN conteudo_programatico TEXT DEFAULT NULL;

-- ============================================================
-- 2. Tabela de Certificados com Versionamento e Histórico
-- ============================================================

CREATE TABLE IF NOT EXISTS certificados_qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Associações
  qualificacao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  
  -- Arquivo
  arquivo_url TEXT NOT NULL,              -- URL em R2 ou local
  nome_arquivo TEXT NOT NULL,             -- Nome padronizado CERT-{matricula}-{codigo}-{data}.pdf
  
  -- Tipo e Versão
  tipo_certificado VARCHAR(50) NOT NULL DEFAULT 'GERADO', -- GERADO ou UPLOADED
  versao INTEGER NOT NULL DEFAULT 1,      -- Controle de versão
  eh_anterior BOOLEAN NOT NULL DEFAULT FALSE, -- Marca versões antigas
  
  -- Datas
  data_geracao TIMESTAMP,                 -- Se GERADO
  data_upload TIMESTAMP,                  -- Se UPLOADED
  
  -- Auditoria
  criado_por_usuario_id INTEGER,          -- Usuário que gerou/upload
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,                   -- Soft delete
  
  -- Constraints
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
  
  -- Unicidade: última versão por qualificação
  UNIQUE(qualificacao_id, versao, deleted_at)
);

-- ============================================================
-- 3. Índices de Performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cert_qualificacao 
  ON certificados_qualificacoes(qualificacao_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_cert_funcionario 
  ON certificados_qualificacoes(funcionario_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_cert_versao 
  ON certificados_qualificacoes(qualificacao_id, versao DESC, deleted_at);

CREATE INDEX IF NOT EXISTS idx_cert_tipo 
  ON certificados_qualificacoes(tipo_certificado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cert_data_geracao 
  ON certificados_qualificacoes(data_geracao DESC, deleted_at);

-- ============================================================
-- 4. Trigger: Atualizar updated_at
-- ============================================================

CREATE TRIGGER IF NOT EXISTS trig_cert_updated_at
AFTER UPDATE ON certificados_qualificacoes
FOR EACH ROW
BEGIN
  UPDATE certificados_qualificacoes 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE id = NEW.id;
END;

-- ============================================================
-- 5. View: Certificados Ativos (Versão Mais Recente)
-- ============================================================

CREATE VIEW IF NOT EXISTS vw_certificados_ativos AS
SELECT 
  c.id,
  c.qualificacao_id,
  c.funcionario_id,
  c.arquivo_url,
  c.nome_arquivo,
  c.tipo_certificado,
  c.versao,
  c.data_geracao,
  c.data_upload,
  c.created_at,
  f.matricula,
  f.nome as funcionario_nome,
  q.codigo as qualificacao_codigo,
  q.nome as qualificacao_nome,
  q.data_conclusao,
  q.data_vencimento,
  tq.nome as tipo_qualificacao_nome,
  tq.codigo as tipo_qualificacao_codigo
FROM certificados_qualificacoes c
INNER JOIN funcionarios f ON c.funcionario_id = f.id
INNER JOIN qualificacoes q ON c.qualificacao_id = q.id
INNER JOIN tipos_qualificacoes tq ON q.tipo_qualificacao_id = tq.id
WHERE c.deleted_at IS NULL
  AND c.eh_anterior = FALSE
  AND f.deleted_at IS NULL
  AND q.deleted_at IS NULL
  AND c.versao = (
    SELECT MAX(versao) 
    FROM certificados_qualificacoes 
    WHERE qualificacao_id = c.qualificacao_id 
      AND deleted_at IS NULL
  );

-- ============================================================
-- 6. View: Histórico Completo de Certificados
-- ============================================================

CREATE VIEW IF NOT EXISTS vw_certificados_historico AS
SELECT 
  c.id,
  c.qualificacao_id,
  c.funcionario_id,
  c.arquivo_url,
  c.nome_arquivo,
  c.tipo_certificado,
  c.versao,
  c.eh_anterior,
  c.data_geracao,
  c.data_upload,
  c.created_at,
  c.updated_at,
  f.matricula,
  f.nome as funcionario_nome,
  q.codigo as qualificacao_codigo,
  q.nome as qualificacao_nome,
  CASE 
    WHEN c.tipo_certificado = 'GERADO' THEN 'Gerado Automaticamente'
    WHEN c.tipo_certificado = 'UPLOADED' THEN 'Enviado Manualmente'
    ELSE c.tipo_certificado
  END as tipo_descricao
FROM certificados_qualificacoes c
LEFT JOIN funcionarios f ON c.funcionario_id = f.id
LEFT JOIN qualificacoes q ON c.qualificacao_id = q.id
WHERE c.deleted_at IS NULL
ORDER BY c.qualificacao_id, c.versao DESC;

-- ============================================================
-- 7. Garantir tabela de configuração (será criada se não existir)
-- ============================================================

-- NOTA: system_config pode já existir, então usamos CREATE TABLE IF NOT EXISTS
-- A coluna de tipo também pode não existir, mas tentaremos adicionar

CREATE TABLE IF NOT EXISTS system_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  tipo VARCHAR(50) DEFAULT 'STRING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 8. Auditoria: Registrar eventos de certificados
-- ============================================================

-- NOTA: auditoriaavancadav2 já existe no banco, então apenas comentamos
-- A tabela será usada pela aplicação através de auditService

-- CREATE TABLE IF NOT EXISTS auditoriaavancadav2 (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   modelo VARCHAR(100),
--   comando VARCHAR(50),
--   tempo_ms INTEGER DEFAULT 0,
--   sucesso BOOLEAN DEFAULT TRUE,
--   checksum TEXT,
--   erros INTEGER DEFAULT 0,
--   warnings INTEGER DEFAULT 0,
--   detalhes TEXT,
--   criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
-- 
-- CREATE INDEX IF NOT EXISTS idx_auditoria_modelo ON auditoriaavancadav2(modelo);
-- CREATE INDEX IF NOT EXISTS idx_auditoria_comando ON auditoriaavancadav2(comando);
-- CREATE INDEX IF NOT EXISTS idx_auditoria_tempo ON auditoriaavancadav2(criado_em DESC);
