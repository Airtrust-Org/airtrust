-- ===============================================
-- SEED DATA PARA TESTES E2E
-- Ambiente: Production
-- Data: 26/11/2025
-- ===============================================

-- Limpar dados de teste anteriores (se existirem)
DELETE FROM qualificacoes_historico WHERE funcionario_cpf IN (
  SELECT cpf FROM funcionarios WHERE email LIKE '%@teste.%' OR email LIKE '%teste@%'
);
DELETE FROM funcionarios WHERE email LIKE '%@teste.%' OR email LIKE '%teste@%';
DELETE FROM qualificacoes_tipos WHERE codigo LIKE 'TEST%';

-- ===============================================
-- 1. FUNCIONÁRIOS DE TESTE (10 registros)
-- ===============================================

INSERT INTO funcionarios (
  cpf, matricula, nome, guerra, funcao, aeronave, 
  email, telefone, data_nascimento, admissao, 
  canac, licenca, sispat
) VALUES
-- Pilotos
('012.345.678-90', 'TEST001', 'João Silva Teste', 'Silva', 'Piloto', 'S76', 
 'joao.teste@airtrust.com', '(11) 98765-4321', '1985-05-15', '2020-01-10',
 'CANAC-001', 'PP-H-001', 'SISPAT-001'),

('123.456.789-09', 'TEST002', 'Maria Santos Teste', 'Santos', 'Piloto', 'AW139',
 'maria.teste@airtrust.com', '(21) 99876-5432', '1987-08-20', '2019-03-15',
 'CANAC-002', 'PP-H-002', 'SISPAT-002'),

('111.444.777-35', 'TEST003', 'Pedro Oliveira Teste', 'Pedro', 'Copiloto', 'EC135',
 'pedro.teste@airtrust.com', '(11) 97654-3210', '1990-11-25', '2021-06-01',
 'CANAC-003', 'PC-H-003', 'SISPAT-003'),

-- Mecânicos
('222.555.888-46', 'TEST004', 'Ana Costa Teste', 'Ana', 'Mecânico', 'S76',
 'ana.teste@airtrust.com', '(11) 96543-2109', '1988-03-12', '2020-09-10',
 'CANAC-004', 'MEC-004', 'SISPAT-004'),

('333.666.999-57', 'TEST005', 'Carlos Pereira Teste', 'Pereira', 'Mecânico', 'AW139',
 'carlos.teste@airtrust.com', '(21) 95432-1098', '1992-07-30', '2021-11-20',
 'CANAC-005', 'MEC-005', 'SISPAT-005'),

-- Instrutores
('444.777.000-68', 'TEST006', 'Fernanda Lima Teste', 'Fernanda', 'Instrutor', 'S76',
 'fernanda.teste@airtrust.com', '(11) 94321-0987', '1980-12-05', '2018-02-15',
 'CANAC-006', 'INST-006', 'SISPAT-006'),

('555.888.111-79', 'TEST007', 'Roberto Alves Teste', 'Roberto', 'Instrutor', 'AW139',
 'roberto.teste@airtrust.com', '(21) 93210-9876', '1983-09-18', '2019-05-20',
 'CANAC-007', 'INST-007', 'SISPAT-007'),

-- Outros
('666.999.222-80', 'TEST008', 'Juliana Souza Teste', 'Juliana', 'Coordenador', 'EC135',
 'juliana.teste@airtrust.com', '(11) 92109-8765', '1989-04-22', '2020-08-05',
 'CANAC-008', 'COORD-008', 'SISPAT-008'),

('777.000.333-91', 'TEST009', 'Marcos Rocha Teste', 'Marcos', 'Piloto', 'S76',
 'marcos.teste@airtrust.com', '(21) 91098-7654', '1991-01-10', '2022-01-15',
 'CANAC-009', 'PP-H-009', 'SISPAT-009'),

('888.111.444-02', 'TEST010', 'Beatriz Martins Teste', 'Beatriz', 'Copiloto', 'AW139',
 'beatriz.teste@airtrust.com', '(11) 90987-6543', '1993-06-28', '2022-03-20',
 'CANAC-010', 'PC-H-010', 'SISPAT-010');

-- ===============================================
-- 2. TIPOS DE QUALIFICAÇÃO DE TESTE (5 registros)
-- ===============================================

INSERT INTO qualificacoes_tipos (
  codigo, nome, tipo, descricao, categoria, 
  carga_horaria, validade, vencimento_fim_mes
) VALUES
('TEST-CMA', 'Certificado Médico Teste', 'MEDICO', 
 'Exame médico aeronáutico de teste', 'SAUDE',
 0, 12, 1),

('TEST-PPH', 'Piloto Privado Teste', 'PILOTO',
 'Licença de piloto privado de teste', 'OPERACIONAL',
 150, 24, 0),

('TEST-CHT', 'Cheque Técnico Teste', 'TECNICO',
 'Verificação técnica de teste', 'MANUTENCAO',
 8, 6, 1),

('TEST-SEG', 'Treinamento Segurança Teste', 'SEGURANCA',
 'Treinamento de segurança de teste', 'SEGURANCA',
 4, 12, 0),

('TEST-SIM', 'Simulador Básico Teste', 'SIMULADOR',
 'Treinamento em simulador de teste', 'OPERACIONAL',
 20, 12, 1);

-- ===============================================
-- 3. HISTÓRICO DE QUALIFICAÇÕES DE TESTE (15 registros)
-- ===============================================

-- Qualificações VÁLIDAS (recentes)
INSERT INTO qualificacoes_historico (
  funcionario_cpf, qualificacao_codigo, 
  data_conclusao, data_vencimento,
  nota, instrutor, local, modalidade
) VALUES
-- João Silva - Válidas
('012.345.678-90', 'TEST-CMA', '2024-11-01', '2025-11-30', 4.5, 'Dr. Silva', 'São Paulo', 'PRESENCIAL'),
('012.345.678-90', 'TEST-PPH', '2024-01-15', '2026-01-15', 5.0, 'Inst. Roberto', 'Rio de Janeiro', 'PRESENCIAL'),

-- Maria Santos - Válidas
('123.456.789-09', 'TEST-CMA', '2024-10-15', '2025-10-31', 4.8, 'Dr. Costa', 'Rio de Janeiro', 'PRESENCIAL'),
('123.456.789-09', 'TEST-SIM', '2024-09-20', '2025-09-30', 4.2, 'Inst. Fernanda', 'São Paulo', 'SIMULADOR'),

-- Pedro Oliveira - Válidas
('111.444.777-35', 'TEST-CHT', '2024-10-01', '2025-03-31', 4.0, 'Mec. Carlos', 'São Paulo', 'PRESENCIAL');

-- Qualificações PRÓXIMAS DE VENCER (15-30 dias)
INSERT INTO qualificacoes_historico (
  funcionario_cpf, qualificacao_codigo,
  data_conclusao, data_vencimento,
  nota, instrutor, local, modalidade
) VALUES
('222.555.888-46', 'TEST-CMA', '2023-12-20', '2024-12-31', 4.5, 'Dr. Silva', 'São Paulo', 'PRESENCIAL'),
('333.666.999-57', 'TEST-SEG', '2023-12-15', '2024-12-15', 4.0, 'Inst. Roberto', 'Rio de Janeiro', 'PRESENCIAL');

-- Qualificações VENCIDAS
INSERT INTO qualificacoes_historico (
  funcionario_cpf, qualificacao_codigo,
  data_conclusao, data_vencimento,
  nota, instrutor, local, modalidade
) VALUES
('444.777.000-68', 'TEST-CMA', '2023-01-15', '2024-01-31', 5.0, 'Dr. Costa', 'São Paulo', 'PRESENCIAL'),
('555.888.111-79', 'TEST-PPH', '2022-06-20', '2024-06-20', 4.8, 'Inst. Fernanda', 'Rio de Janeiro', 'PRESENCIAL'),
('666.999.222-80', 'TEST-CHT', '2023-06-10', '2023-12-31', 4.2, 'Mec. Carlos', 'São Paulo', 'PRESENCIAL');

-- Qualificações SEM VALIDADE (INDETERMINADAS)
INSERT INTO qualificacoes_historico (
  funcionario_cpf, qualificacao_codigo,
  data_conclusao, data_vencimento,
  nota, instrutor, local, modalidade
) VALUES
('777.000.333-91', 'TEST-SEG', '2023-08-15', NULL, 4.5, 'Inst. Roberto', 'São Paulo', 'EAD'),
('888.111.444-02', 'TEST-SIM', '2023-09-20', NULL, 4.0, 'Inst. Fernanda', 'Rio de Janeiro', 'HIBRIDO');

-- Múltiplas ocorrências do mesmo tipo (renovações)
INSERT INTO qualificacoes_historico (
  funcionario_cpf, qualificacao_codigo,
  data_conclusao, data_vencimento,
  nota, instrutor, local, modalidade
) VALUES
-- João Silva - Renovações de CMA
('012.345.678-90', 'TEST-CMA', '2023-11-01', '2024-11-30', 4.8, 'Dr. Silva', 'São Paulo', 'PRESENCIAL'),
('012.345.678-90', 'TEST-CMA', '2022-11-01', '2023-11-30', 4.5, 'Dr. Silva', 'São Paulo', 'PRESENCIAL'),

-- Maria Santos - Renovações de SIM
('123.456.789-09', 'TEST-SIM', '2023-09-20', '2024-09-30', 4.5, 'Inst. Fernanda', 'São Paulo', 'SIMULADOR');

-- ===============================================
-- VERIFICAÇÃO DOS DADOS INSERIDOS
-- ===============================================

SELECT 'Funcionários de teste inseridos:' as info, COUNT(*) as total FROM funcionarios WHERE email LIKE '%@teste.%' OR email LIKE '%teste@%';
SELECT 'Tipos de qualificação de teste inseridos:' as info, COUNT(*) as total FROM qualificacoes_tipos WHERE codigo LIKE 'TEST%';
SELECT 'Históricos de qualificação de teste inseridos:' as info, COUNT(*) as total FROM qualificacoes_historico WHERE funcionario_cpf IN (SELECT cpf FROM funcionarios WHERE email LIKE '%@teste.%' OR email LIKE '%teste@%');
