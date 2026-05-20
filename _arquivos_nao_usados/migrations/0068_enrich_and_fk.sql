-- MIGRATION 0068: Enriquecimento Semântico + Reintrodução de FKs (qualificacoes_historico)
-- Estratégia simplificada: criar tipos genéricos por categoria, mapear todos os históricos
-- depois recriar tabela com FKs e índices. Mantém backup da tabela antiga.
-- Preserva dados em _backup_qualificacoes_historico_pre_fk.


-- 1. Criar tipos genéricos para categorias sem código
INSERT INTO qualificacoes_tipos (codigo,nome,categoria,descricao,ativo,created_at,updated_at)
SELECT 'GEN_'||qh.categoria AS codigo,
       'Genérico '||qh.categoria AS nome,
       qh.categoria AS categoria,
       'Criado automaticamente na migração 0068 (categoria genérica)' AS descricao,
       1 AS ativo,
       datetime('now'),
       datetime('now')
FROM qualificacoes_historico qh
WHERE qh.deleted_at IS NULL
  AND qh.categoria IS NOT NULL
  AND qh.categoria <> ''
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_tipos qt WHERE qt.codigo = 'GEN_'||qh.categoria AND qt.deleted_at IS NULL
  );

-- 2. Mapear historico para tipos genéricos onde qualificacao_id ainda nulo
UPDATE qualificacoes_historico
SET qualificacao_id = (
  SELECT qt.id FROM qualificacoes_tipos qt
  WHERE qt.codigo = 'GEN_'||qualificacoes_historico.categoria AND qt.deleted_at IS NULL LIMIT 1
)
WHERE qualificacao_id IS NULL
  AND deleted_at IS NULL
  AND categoria IS NOT NULL AND categoria <> '';

-- 3. Marcar órfãos (funcionario inexistente) como deleted_at para não migrar
UPDATE qualificacoes_historico
SET deleted_at = datetime('now')
WHERE deleted_at IS NULL AND (
  funcionario_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM funcionarios f WHERE f.id = qualificacoes_historico.funcionario_id AND f.deleted_at IS NULL
  )
);

-- 4. Backup da tabela antiga antes de recriar com FKs
ALTER TABLE qualificacoes_historico RENAME TO _backup_qualificacoes_historico_pre_fk;

-- 5. Recriar tabela com FKs (apenas registros válidos serão reinseridos)
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER NOT NULL,
  tipo_codigo TEXT,
  codigo TEXT,
  categoria TEXT,
  validade TEXT,
  numero_certificado TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 6. Inserir dados válidos (qualificacao_id preenchido e funcionário ativo)
INSERT INTO qualificacoes_historico (
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
  numero_certificado, observacoes, arquivo_url, created_at, updated_at, deleted_at                                
)
SELECT id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
      numero_certificado, observacoes, arquivo_url, created_at, updated_at, deleted_at                            
FROM _backup_qualificacoes_historico_pre_fk
WHERE deleted_at IS NULL
  AND qualificacao_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = funcionario_id AND f.deleted_at IS NULL)
  AND EXISTS (SELECT 1 FROM qualificacoes_tipos qt WHERE qt.id = qualificacao_id AND qt.deleted_at IS NULL);

-- 7. Índices
CREATE INDEX idx_qualificacoes_historico_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_qualificacao ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_validade ON qualificacoes_historico(validade) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_qualificacoes_historico_unico ON qualificacoes_historico(funcionario_id, qualificacao_id, numero_certificado) WHERE deleted_at IS NULL AND numero_certificado IS NOT NULL;

-- 8. Recriar view (garantia de coerência)
-- View será criada separadamente após recriação da tabela (removida deste arquivo por erros de coluna).

-- 9. Auditoria agregada
INSERT INTO auditoria_avancada_v2 (tabela,registro_id,acao,dados_novos,origem)
VALUES ('system_migration',68,'UPDATE',json_object(
  'migration','0068_enrich_and_fk',
  'total_historico',(SELECT COUNT(*) FROM qualificacoes_historico),
  'mapped',(SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id IS NOT NULL),
  'mapping_percent',(SELECT ROUND( (SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id IS NOT NULL)*100.0 / (SELECT COUNT(*) FROM qualificacoes_historico),2) )
),'migration_script');

