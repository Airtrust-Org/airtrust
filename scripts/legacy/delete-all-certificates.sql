-- Limpar todos os certificados
DELETE FROM certificados_qualificacoes WHERE deleted_at IS NULL;
DELETE FROM certificados_qualificacoes;

-- Verificar se foi limpo
SELECT COUNT(*) as total_certificados FROM certificados_qualificacoes;
