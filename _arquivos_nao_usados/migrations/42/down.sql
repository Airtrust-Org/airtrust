-- Remover templates adicionados
DELETE FROM sessoes_template WHERE treinamento_codigo IN ('SGV-001', 'SMS-001') AND created_by = 'SISTEMA';