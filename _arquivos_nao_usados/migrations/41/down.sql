-- Remover templates criados para auditoria
DELETE FROM sessoes_template WHERE created_by = 'SISTEMA_AUDITORIA';