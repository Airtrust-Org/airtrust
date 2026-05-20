-- validate-ssot-final.sql
-- Consultas de validação final do SSOT histórico
SELECT 'Total Registros' as metrica, COUNT(*) as valor FROM qualificacoes_historico WHERE deleted_at IS NULL
UNION ALL
SELECT 'Na View' , COUNT(*) FROM qualificacoes_historico_v
UNION ALL
SELECT 'Com data_vencimento', COUNT(*) FROM qualificacoes_historico WHERE data_vencimento IS NOT NULL AND deleted_at IS NULL
UNION ALL
SELECT 'Com data_conclusao', COUNT(*) FROM qualificacoes_historico WHERE data_conclusao IS NOT NULL AND deleted_at IS NULL
UNION ALL
SELECT 'Órfãos Funcionários', COUNT(*) FROM qualificacoes_historico qh WHERE qh.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = qh.funcionario_id AND f.deleted_at IS NULL)
UNION ALL
SELECT 'Órfãos Tipos', COUNT(*) FROM qualificacoes_historico qh WHERE qh.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos qt WHERE qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL)
UNION ALL
SELECT 'Foreign Keys', COUNT(*) FROM pragma_foreign_key_list('qualificacoes_historico');
