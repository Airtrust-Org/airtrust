-- Migration 0096: Unificar estrutura de qualificacoes_historico
-- Data: 2025-11-23
-- Objetivo: garantir colunas canônicas presentes sem ambiguidade para import futuro
-- Observação: SQLite/D1 não suporta ADD COLUMN em todas versões. Executar condicionalmente via ferramenta de migração se necessário.
-- Passos recomendados (manual/automação JS):
-- 1. PRAGMA table_info('qualificacoes_historico') para listar colunas.
-- 2. Se existir data_obtencao e NÃO existir data_conclusao -> ALTER TABLE ... RENAME COLUMN data_obtencao TO data_conclusao;
-- 3. Se existir data_validade e NÃO existir data_vencimento -> ALTER TABLE ... RENAME COLUMN data_validade TO data_vencimento;
-- 4. Adicionar colunas faltantes: validade_meses, tipo_codigo, categoria, codigo, numero_certificado, arquivo_url, nota, instrutor, local, modalidade, carga_horaria.
-- 5. Remover view antiga e recriar (já tratado na 0095).
-- Este arquivo apenas registra checklist para execução automatizada em ambiente controlado.

BEGIN TRANSACTION;
-- Exemplo de renome (executar apenas se coluna existir):
-- ALTER TABLE qualificacoes_historico RENAME COLUMN data_obtencao TO data_conclusao;
-- ALTER TABLE qualificacoes_historico RENAME COLUMN data_validade TO data_vencimento;

-- Exemplo de adição (comentar se já existe):
-- ALTER TABLE qualificacoes_historico ADD COLUMN validade_meses INTEGER;
-- ALTER TABLE qualificacoes_historico ADD COLUMN tipo_codigo TEXT;
-- ALTER TABLE qualificacoes_historico ADD COLUMN categoria TEXT;
-- ALTER TABLE qualificacoes_historico ADD COLUMN codigo TEXT;
-- ALTER TABLE qualificacoes_historico ADD COLUMN numero_certificado TEXT;
-- ALTER TABLE qualificacoes_historico ADD COLUMN arquivo_url TEXT;
-- ALTER TABLE qualificacoes_historico ADD COLUMN nota REAL;
-- ALTER TABLE qualificacoes_historico ADD COLUMN instrutor TEXT;
-- ALTER TABLE qualificacoes_historico ADD COLUMN local TEXT;
-- ALTER TABLE qualificacoes_historico ADD COLUMN modalidade TEXT;
-- ALTER TABLE qualificacoes_historico ADD COLUMN carga_horaria INTEGER;

-- Índices adicionais garantidos (idempotentes):
CREATE INDEX IF NOT EXISTS idx_qh_funcionario_vencimento ON qualificacoes_historico(funcionario_id, data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_codigo ON qualificacoes_historico(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_categoria ON qualificacoes_historico(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_numero_cert ON qualificacoes_historico(numero_certificado) WHERE deleted_at IS NULL;

COMMIT;

-- Checklist Pós 0096:
-- 1. Validar colunas finais
-- 2. Atualizar rotinas de ETL para inserir somente campos canônicos
-- 3. Garantir que view qualificacoes_historico_v usa somente novas colunas (COALESCE temporário removível quando legado migrado)
-- 4. Planejar remoção futura de colunas antigas (após 100% migrado)
