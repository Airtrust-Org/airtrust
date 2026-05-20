-- SEED CORRETO COM SCHEMA REAL

-- Limpar
DELETE FROM qualificacoes_historico WHERE funcionario_cpf IN (SELECT cpf FROM funcionarios WHERE email LIKE '%teste@%');
DELETE FROM funcionarios WHERE email LIKE '%teste@%';
DELETE FROM qualificacoes_tipos WHERE codigo LIKE 'TEST%';

-- 1. FUNCIONÁRIOS (10)
INSERT INTO funcionarios (nome, cpf, email, matricula) VALUES
('João Silva Teste', '012.345.678-90', 'joao.teste@airtrust.com', 'TEST001'),
('Maria Santos Teste', '123.456.789-09', 'maria.teste@airtrust.com', 'TEST002'),
('Carlos Oliveira Teste', '234.567.890-12', 'carlos.teste@airtrust.com', 'TEST003'),
('Ana Costa Teste', '345.678.901-23', 'ana.teste@airtrust.com', 'TEST004'),
('Pedro Lima Teste', '456.789.012-34', 'pedro.teste@airtrust.com', 'TEST005'),
('Julia Souza Teste', '567.890.123-45', 'julia.teste@airtrust.com', 'TEST006'),
('Roberto Alves Teste', '678.901.234-56', 'roberto.teste@airtrust.com', 'TEST007'),
('Fernanda Dias Teste', '789.012.345-67', 'fernanda.teste@airtrust.com', 'TEST008'),
('Marcos Rocha Teste', '890.123.456-78', 'marcos.teste@airtrust.com', 'TEST009'),
('Patricia Nunes Teste', '901.234.567-89', 'patricia.teste@airtrust.com', 'TEST010');

-- 2. TIPOS QUALIFICAÇÃO (5)
INSERT INTO qualificacoes_tipos (codigo, nome, categoria, descricao, validade) VALUES
('TEST-CMA', 'Certificado Médico (Teste)', 'Médica', 'CMA teste E2E', 12),
('TEST-PPH', 'Piloto Privado Heli (Teste)', 'Técnica', 'PPH teste E2E', 24),
('TEST-CHT', 'Cheque Técnico (Teste)', 'Técnica', 'Cheque teste E2E', 6),
('TEST-SEG', 'Treinamento Segurança (Teste)', 'Segurança', 'Segurança teste E2E', 12),
('TEST-SIM', 'Simulador Básico (Teste)', 'Simulação', 'Simulador teste E2E', 12);

-- 3. HISTÓRICO QUALIFICAÇÕES (15)
-- Válidas
INSERT INTO qualificacoes_historico (funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento) VALUES
('012.345.678-90', 'TEST-CMA', '2024-06-01', '2025-06-01'),
('123.456.789-09', 'TEST-PPH', '2023-01-15', '2025-01-15'),
('234.567.890-12', 'TEST-CHT', '2024-09-10', '2025-03-10'),
('345.678.901-23', 'TEST-SEG', '2024-08-20', '2025-08-20'),
('456.789.012-34', 'TEST-SIM', '2024-05-05', '2025-05-05');

-- Próximas vencer
INSERT INTO qualificacoes_historico (funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento) VALUES
('567.890.123-45', 'TEST-CMA', '2024-01-10', '2025-01-10'),
('678.901.234-56', 'TEST-CHT', '2024-07-20', '2025-01-20');

-- Vencidas
INSERT INTO qualificacoes_historico (funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento) VALUES
('789.012.345-67', 'TEST-CMA', '2023-06-01', '2024-06-01'),
('890.123.456-78', 'TEST-PPH', '2021-03-15', '2023-03-15'),
('901.234.567-89', 'TEST-CHT', '2023-12-10', '2024-06-10');

-- Sem validade
INSERT INTO qualificacoes_historico (funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento) VALUES
('012.345.678-90', 'TEST-SEG', '2024-11-01', NULL),
('123.456.789-09', 'TEST-SEG', '2024-10-15', NULL);

-- Renovações
INSERT INTO qualificacoes_historico (funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento, observacoes) VALUES
('234.567.890-12', 'TEST-CMA', '2023-01-05', '2024-01-05', 'Anterior vencida'),
('234.567.890-12', 'TEST-CMA', '2024-01-05', '2025-01-05', 'Renovação vigente'),
('345.678.901-23', 'TEST-CHT', '2024-03-01', '2024-09-01', 'Cheque antigo');

-- Verificação
SELECT '✅ Funcionários:' AS info, COUNT(*) AS total FROM funcionarios WHERE email LIKE '%teste@%';
SELECT '✅ Tipos:' AS info, COUNT(*) AS total FROM qualificacoes_tipos WHERE codigo LIKE 'TEST%';
SELECT '✅ Históricos:' AS info, COUNT(*) AS total FROM qualificacoes_historico WHERE funcionario_cpf IN (SELECT cpf FROM funcionarios WHERE email LIKE '%teste@%');
