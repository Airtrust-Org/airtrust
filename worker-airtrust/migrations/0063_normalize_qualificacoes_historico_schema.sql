-- ============================================================
-- MIGRATION 0063: Normalizar Schema qualificacoes_historico para SSOT
-- Data: 2025-11-21
-- Objetivo: Alinhar produção ao schema unificado utilizado pela view reativa
--            adicionando campos padronizados e tipos consistentes.
--            Estratégia: rebuild (rename -> create -> copy -> drop) para alterar tipos.
-- IMPORTANTE: Validar previamente volume de dados. Backup obrigatório antes.
-- ============================================================

-- 1. Backup lógico (executar externamente via wrangler export antes desta migration)

-- (Pré) Remover trigger que referencia qualificacoes_historico para evitar erro durante rebuild
DROP TRIGGER IF EXISTS trg_funcionarios_soft_delete;
DROP TRIGGER IF EXISTS trg_funcionarios_updated_at; -- inválido em D1 (referência SET_UPDATE_TIME)

-- 2. Renomear tabela original
ALTER TABLE qualificacoes_historico RENAME TO qualificacoes_historico_old_0063;

-- 3. Criar nova tabela normalizada
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER,
  tipo_codigo TEXT,              -- Novo: código do tipo (ex: CURSO, LICENCA)
  codigo TEXT,                   -- Código único ou referência externa
  categoria TEXT,                -- Categoria / subgrupo
  validade TEXT,                 -- Data de validade (ISO string)
  numero_certificado TEXT,       -- Número do certificado
  orgao_emissor TEXT,            -- Órgão emissor
  observacoes TEXT,
  arquivo_url TEXT,              -- URL do documento/certificado

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT

  -- Removido FK temporariamente devido a registros órfãos na produção; será reavaliado em migração futura
);

-- 4. Copiar dados mapeando colunas existentes
-- Mapeamento de colunas antigas -> novas:
--  funcionario_id (TEXT) -> CAST(funcionario_id AS INTEGER)
--  categoria -> categoria
--  codigo -> codigo
--  validade/data_vencimento -> prioridade: validade se não nula senão data_vencimento
--  certificado_numero -> numero_certificado
--  observacoes -> observacoes
--  certificado_url -> arquivo_url
--  NOTA: Campos não existentes preenchidos como NULL (tipo_codigo, orgao_emissor, qualificacao_id)

INSERT INTO qualificacoes_historico (
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
  numero_certificado, orgao_emissor, observacoes, arquivo_url, created_at, updated_at, deleted_at
)
SELECT
  id,
  CAST(funcionario_id AS INTEGER) AS funcionario_id,
  NULL AS qualificacao_id,
  NULL AS tipo_codigo,
  codigo,
  categoria,
  COALESCE(validade, data_vencimento) AS validade,
  certificado_numero AS numero_certificado,
  NULL AS orgao_emissor,
  observacoes,
  certificado_url AS arquivo_url,
  created_at,
  updated_at,
  deleted_at
FROM qualificacoes_historico_old_0063;
-- Ajuste: Filtrar apenas registros com funcionario_id válido para evitar falha FK
-- (Reexecutar com filtro de integridade)
DELETE FROM qualificacoes_historico; -- limpar tentativa anterior caso parcialmente criada (em rollback não existirá, segura)
INSERT INTO qualificacoes_historico (
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
  numero_certificado, orgao_emissor, observacoes, arquivo_url, created_at, updated_at, deleted_at
)
SELECT
  id,
  CAST(funcionario_id AS INTEGER) AS funcionario_id,
  NULL AS qualificacao_id,
  NULL AS tipo_codigo,
  codigo,
  categoria,
  COALESCE(validade, data_vencimento) AS validade,
  certificado_numero AS numero_certificado,
  NULL AS orgao_emissor,
  observacoes,
  certificado_url AS arquivo_url,
  created_at,
  updated_at,
  deleted_at
FROM qualificacoes_historico_old_0063
WHERE CAST(funcionario_id AS INTEGER) IN (SELECT id FROM funcionarios);

-- 5. Criar índices necessários
CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_validade ON qualificacoes_historico(validade) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo ON qualificacoes_historico(codigo) WHERE deleted_at IS NULL;

-- 6. Drop da tabela antiga
DROP TABLE qualificacoes_historico_old_0063;

-- 7. Observações pós-migration
--    - Campos novos (tipo_codigo, qualificacao_id, orgao_emissor) estão NULL e podem ser populados futuramente.
--    - Garantir que view reativa (0060) considere novo schema caso seja recriada.
--    - Validar contagem de linhas antes/depois para assegurar integridade.

-- 8. Auditoria manual recomendada:
-- SELECT COUNT(*) FROM qualificacoes_historico;
-- SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NOT NULL;

-- (Pós) Recriar trigger de soft delete agora apontando para nova estrutura
DROP TRIGGER IF EXISTS trg_funcionarios_soft_delete;
CREATE TRIGGER trg_funcionarios_soft_delete
AFTER UPDATE OF deleted_at ON funcionarios
FOR EACH ROW
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE funcionario_id = NEW.id AND deleted_at IS NULL;
  UPDATE sessoes_simulador SET deleted_at = datetime('now') WHERE (funcionario_id = NEW.id OR instrutor_id = NEW.id) AND deleted_at IS NULL;
  UPDATE hospedagens SET deleted_at = datetime('now') WHERE funcionario_id = NEW.id AND deleted_at IS NULL;
  UPDATE registros_frms SET deleted_at = datetime('now') WHERE funcionario_id = NEW.id AND deleted_at IS NULL;
  INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, origem) VALUES ('funcionarios', NEW.id, 'SOFT_DELETE', 'system');
END;

-- ============================================================
-- FIM MIGRATION 0063
-- ============================================================
