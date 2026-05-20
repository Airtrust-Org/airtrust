-- Restaurar dados de exemplo para qualificacoes_historico
-- Baseado na imagem: Genérico TREINAMENTO com GEN_TREINAMENTO

-- Primeiro, garantir que temos um funcionário genérico
INSERT OR IGNORE INTO funcionarios (id, nome, matricula, status, ativo)
VALUES (999, 'Genérico TREINAMENTO', 'GEN-001', 'ATIVO', 1);

-- Depois, garantir que temos uma qualificação tipo genérica
INSERT OR IGNORE INTO qualificacoes_tipos (id, nome, codigo, categoria, validade_meses, ativo)
VALUES (999, 'GEN_TREINAMENTO', 'GEN_TREINAMENTO', 'TREINAMENTO', 12, 1);

-- Limpar registros antigos com esse padrão
DELETE FROM qualificacoes_historico 
WHERE funcionario_id = 999 AND qualificacao_id = 999;

-- Inserir dados de exemplo baseado na imagem
INSERT INTO qualificacoes_historico 
(id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, created_at, updated_at)
VALUES
(100, 999, 999, '2025-10-22', '2026-10-21', 'VENCIDA', datetime('now'), datetime('now')),
(101, 999, 999, '2025-10-22', '2026-10-21', 'VENCIDA', datetime('now'), datetime('now')),
(102, 999, 999, '2025-10-22', '2026-10-21', 'VENCIDA', datetime('now'), datetime('now')),
(103, 999, 999, '2025-10-22', '2026-10-21', 'VENCIDA', datetime('now'), datetime('now')),
(104, 999, 999, '2025-10-22', '2026-10-21', 'VENCIDA', datetime('now'), datetime('now')),
(105, 999, 999, '2025-10-22', '2026-10-21', 'VENCIDA', datetime('now'), datetime('now')),
(106, 999, 999, '2025-10-22', '2026-10-21', 'VENCIDA', datetime('now'), datetime('now')),
(107, 999, 999, '2025-10-22', '2026-10-21', 'VENCIDA', datetime('now'), datetime('now'));
