-- Migration 0215: FRMS — adiciona campo notas_resolucao à tabela frms_alerta
-- Permite registrar observações de resolução diretamente no alerta.

ALTER TABLE frms_alerta ADD COLUMN notas_resolucao TEXT DEFAULT NULL;
