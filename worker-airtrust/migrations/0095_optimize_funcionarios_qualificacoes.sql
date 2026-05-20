-- Migration 0095: Otimizacao de funcionarios e qualificacoes para futura importacao
-- Data: 2025-11-23
-- Objetivo:
-- 1. Padronizar nomenclatura de datas (data_conclusao, data_vencimento) para qualificacoes
-- 2. Garantir colunas chave e índices para buscas e deduplicacao em funcionarios
-- 3. Criar índices adicionais para queries de expiracao e status
-- 4. Adicionar triggers de updated_at para auditoria consistente
-- 5. Criar views normalizadas para camada de import / API estável
-- 6. Preparar staging tables para import futura sem poluir tabelas principais
--
-- Observacoes:
-- - Usa somente comandos idempotentes (CREATE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS)
-- - Para renomes: se existir data_obtencao/data_validade e NAO existir data_conclusao/data_vencimento
--   executa processo de copia segura.
-- - SQLite (D1) permite RENAME COLUMN; fallback: criar nova, copiar, remover antiga.
-- - Nao remove colunas legado; mantida view de compatibilidade.

BEGIN TRANSACTION;

-- =============================
-- FUNCIONARIOS: Ajustes de Estrutura
-- =============================
-- Adicionar colunas opcionais se faltam
-- (D1/SQLite nao suporta IF NOT EXISTS em ADD COLUMN em todas versões; checar PRAGMA antes)

-- Nome de guerra
DO $$ BEGIN END $$; -- Placeholder para compat; ignorado em SQLite (comentado logicamente)

-- Para SQLite: verificação e adição condicional
-- (Executar via ferramenta externa se necessario)
-- SELECT 1 FROM pragma_table_info('funcionarios') WHERE name='nome_guerra';
-- Se nao existir:
-- ALTER TABLE funcionarios ADD COLUMN nome_guerra TEXT;
-- SELECT 1 FROM pragma_table_info('funcionarios') WHERE name='base';
-- ALTER TABLE funcionarios ADD COLUMN base TEXT;
-- SELECT 1 FROM pragma_table_info('funcionarios') WHERE name='aeronave';
-- ALTER TABLE funcionarios ADD COLUMN aeronave TEXT;
-- SELECT 1 FROM pragma_table_info('funcionarios') WHERE name='status';
-- ALTER TABLE funcionarios ADD COLUMN status TEXT DEFAULT 'ATIVO';
-- SELECT 1 FROM pragma_table_info('funcionarios') WHERE name='ativo';
-- ALTER TABLE funcionarios ADD COLUMN ativo INTEGER DEFAULT 1;

-- Índices adicionais para busca frequente e deduplicação
CREATE INDEX IF NOT EXISTS idx_funcionarios_nome ON funcionarios(nome) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_funcao ON funcionarios(funcao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_codigo_anac ON funcionarios(codigo_anac) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_cpf ON funcionarios(cpf) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_email ON funcionarios(email) WHERE deleted_at IS NULL;
-- codigo_anac pode ser nulo; criar índice unico condicional apenas quando não vazio
CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_codigo_anac ON funcionarios(codigo_anac) WHERE codigo_anac IS NOT NULL AND codigo_anac <> '' AND deleted_at IS NULL;

-- Trigger para atualizar updated_at automaticamente
DROP TRIGGER IF EXISTS trg_funcionarios_updated_at;
CREATE TRIGGER trg_funcionarios_updated_at
AFTER UPDATE ON funcionarios
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE funcionarios SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- =============================
-- QUALIFICACOES TIPOS
-- =============================
CREATE INDEX IF NOT EXISTS idx_qual_tipos_categoria_obrigatoria ON qualificacoes_tipos(categoria, obrigatoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qual_tipos_ativo ON qualificacoes_tipos(ativo) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_qual_tipos_updated_at;
CREATE TRIGGER trg_qual_tipos_updated_at
AFTER UPDATE ON qualificacoes_tipos
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE qualificacoes_tipos SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- =============================
-- QUALIFICACOES HISTORICO
-- =============================
-- Padronizar nomes: manter data_conclusao + data_vencimento.
-- Caso existam colunas legado data_obtencao/data_validade e faltem as novas, migrar:
-- (Pseudo sequência para execução manual, pois SQLite carece de IF EXISTS atômico em migrações genéricas)
-- SELECT name FROM pragma_table_info('qualificacoes_historico');
-- ALTER TABLE qualificacoes_historico RENAME COLUMN data_obtencao TO data_conclusao;
-- ALTER TABLE qualificacoes_historico RENAME COLUMN data_validade TO data_vencimento;

-- Índices adicionais / compostos
CREATE INDEX IF NOT EXISTS idx_qh_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL; -- se coluna status existir (schema produção)
CREATE INDEX IF NOT EXISTS idx_qh_funcionario_vencimento ON qualificacoes_historico(funcionario_id, data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_codigo ON qualificacoes_historico(codigo) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_qh_updated_at;
CREATE TRIGGER trg_qh_updated_at
AFTER UPDATE ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE qualificacoes_historico SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- View normalizada principal (substitui v2) usando COALESCE para evitar confusão de nomes legado
DROP VIEW IF EXISTS qualificacoes_historico_v;
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  COALESCE(qh.codigo, qt.codigo) AS qualificacao_codigo,
  qt.nome AS qualificacao_nome,
  COALESCE(qh.categoria, qt.categoria) AS qualificacao_categoria,
  COALESCE(qh.validade_meses, qt.validade_meses) AS validade_meses,
  COALESCE(qh.data_conclusao, qh.data_obtencao) AS data_conclusao,
  COALESCE(qh.data_vencimento, qh.data_validade) AS data_vencimento,
  CASE
    WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
    WHEN COALESCE(qh.data_vencimento, qh.data_validade) IS NULL THEN 'INDETERMINADA'
    WHEN DATE(COALESCE(qh.data_vencimento, qh.data_validade)) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(COALESCE(qh.data_vencimento, qh.data_validade)) BETWEEN DATE('now') AND DATE('now','+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(COALESCE(qh.data_vencimento, qh.data_validade)) BETWEEN DATE('now','+31 days') AND DATE('now','+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_calculado,
  qh.numero_certificado,
  COALESCE(qh.observacoes, qh.observacoes) AS observacoes,
  COALESCE(qh.arquivo_url, qh.certificado_url) AS arquivo_url,
  qh.nota,
  qh.instrutor,
  qh.local,
  qh.modalidade,
  qh.carga_horaria,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id;

-- =============================
-- STAGING PARA IMPORT FUTURA
-- =============================
-- Tabelas staging permitem validar e limpar dados antes de inserir principal
CREATE TABLE IF NOT EXISTS import_funcionarios_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_id TEXT, -- id externo
  nome TEXT,
  nome_guerra TEXT,
  cpf TEXT,
  matricula TEXT,
  email TEXT,
  telefone TEXT,
  funcao TEXT,
  cargo TEXT,
  setor TEXT,
  codigo_anac TEXT,
  status TEXT,
  origem TEXT, -- sistema origem
  raw_json TEXT, -- payload bruto
  validation_errors TEXT, -- JSON array
  imported INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_import_funcionarios_imported ON import_funcionarios_staging(imported);
CREATE INDEX IF NOT EXISTS idx_import_funcionarios_cpf ON import_funcionarios_staging(cpf);
CREATE INDEX IF NOT EXISTS idx_import_funcionarios_matricula ON import_funcionarios_staging(matricula);

CREATE TABLE IF NOT EXISTS import_qualificacoes_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_id TEXT,
  funcionario_matricula TEXT,
  qualificacao_codigo TEXT,
  data_conclusao TEXT,
  data_vencimento TEXT,
  numero_certificado TEXT,
  validade_meses INTEGER,
  categoria TEXT,
  origem TEXT,
  raw_json TEXT,
  validation_errors TEXT,
  imported INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_import_qh_imported ON import_qualificacoes_staging(imported);
CREATE INDEX IF NOT EXISTS idx_import_qh_funcionario ON import_qualificacoes_staging(funcionario_matricula);
CREATE INDEX IF NOT EXISTS idx_import_qh_codigo ON import_qualificacoes_staging(qualificacao_codigo);

COMMIT;

-- =============================
-- CHECKLIST POS-MIGRATION
-- =============================
-- 1. Executar PRAGMA table_info para confirmar colunas
-- 2. Validar views (SELECT * FROM qualificacoes_historico_v LIMIT 1)
-- 3. Rodar queries de performance comparando planos (EXPLAIN QUERY PLAN)
-- 4. Implementar rotina de ETL que move staging -> principal com validação Zod
-- 5. Ajustar código React para consumir somente qualificacoes_historico_v
-- 6. Padronizar no código: sempre usar data_conclusao / data_vencimento
-- 7. Na importação, normalizar cpf (somente dígitos), matricula (upper), email (lower), codigo_anac (upper)
