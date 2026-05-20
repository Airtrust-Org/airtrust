-- ============================================================================
-- CORREÇÃO: FK em certificados_qualificacoes
-- Data: 2025-11-06
-- Descrição: Corrige FK de qualificacoes_registros → qualificacoes
-- ============================================================================

-- Recriar tabela com FK correta
DROP TABLE IF EXISTS certificados_qualificacoes_new;
CREATE TABLE certificados_qualificacoes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qualificacao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  arquivo_url TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo_certificado VARCHAR(50) NOT NULL DEFAULT 'GERADO',
  versao INTEGER NOT NULL DEFAULT 1,
  eh_anterior BOOLEAN NOT NULL DEFAULT FALSE,
  data_geracao TIMESTAMP,
  data_upload TIMESTAMP,
  criado_por_usuario_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes(id), -- ← CORRIGIDO
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (criado_por_usuario_id) REFERENCES usuarios(id),
  UNIQUE(qualificacao_id, versao, deleted_at)
);

-- Migrar dados
INSERT INTO certificados_qualificacoes_new 
SELECT * FROM certificados_qualificacoes;

-- Substituir
DROP TABLE certificados_qualificacoes;
ALTER TABLE certificados_qualificacoes_new RENAME TO certificados_qualificacoes;
