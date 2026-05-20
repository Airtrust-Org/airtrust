-- purge_soft_deletes.sql
-- Remoção definitiva de registros soft-deleted mais antigos que N dias.
-- Defina :dias antes de rodar (ex: .param set dias 90) se suportado ou substitua manual.

-- Qualificacoes Historico
DELETE FROM qualificacoes_historico WHERE deleted_at IS NOT NULL AND julianday('now') - julianday(deleted_at) > :dias;
-- Funcionarios
DELETE FROM funcionarios WHERE deleted_at IS NOT NULL AND julianday('now') - julianday(deleted_at) > :dias;
-- Tipos de Qualificacoes
DELETE FROM qualificacoes_tipos WHERE deleted_at IS NOT NULL AND julianday('now') - julianday(deleted_at) > :dias;
-- Habilitacoes
DELETE FROM habilitacoes WHERE deleted_at IS NOT NULL AND julianday('now') - julianday(deleted_at) > :dias;
-- Licencas
DELETE FROM licencas WHERE deleted_at IS NOT NULL AND julianday('now') - julianday(deleted_at) > :dias;

-- Relatório pós-purge
SELECT 'qualificacoes_historico' AS tabela, COUNT(*) AS ativos FROM qualificacoes_historico WHERE deleted_at IS NULL
UNION ALL
SELECT 'funcionarios', COUNT(*) FROM funcionarios WHERE deleted_at IS NULL
UNION ALL
SELECT 'qualificacoes_tipos', COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL
UNION ALL
SELECT 'habilitacoes', COUNT(*) FROM habilitacoes WHERE deleted_at IS NULL
UNION ALL
SELECT 'licencas', COUNT(*) FROM licencas WHERE deleted_at IS NULL;
