INSERT OR IGNORE INTO tipos_qualificacoes (nome, descricao, created_at)
VALUES
  ('PIC', 'Pilot in Command - Comandante de Aeronave', datetime('now')),
  ('COP', 'Copilot - Copiloto', datetime('now')),
  ('FLIGHT_ENGINEER', 'Flight Engineer - Engenheiro de Voo', datetime('now')),
  ('CREW_CHIEF', 'Crew Chief - Chefe de Tripulação', datetime('now')),
  ('PURSER', 'Purser - Comissário Chefe', datetime('now')),
  ('FLIGHT_ATTENDANT', 'Flight Attendant - Comissário de Bordo', datetime('now')),
  ('INSTRUCTOR', 'Instructor - Instrutor', datetime('now')),
  ('EXAMINER', 'Examiner - Examinador', datetime('now'));

INSERT OR IGNORE INTO habilitacoes (funcionario_id, codigo, nome, data_obtencao, data_vencimento, status, created_at)
VALUES
  (1, 'CPL001', 'CPL', date('now'), date('now', '+24 months'), 'ATIVA', datetime('now')),
  (1, 'ATPL001', 'ATPL', date('now'), date('now', '+24 months'), 'ATIVA', datetime('now')),
  (2, 'CPL002', 'CPL-H', date('now'), date('now', '+24 months'), 'ATIVA', datetime('now')),
  (2, 'IR002', 'IR', date('now'), date('now', '+24 months'), 'ATIVA', datetime('now')),
  (3, 'ATPL003', 'ATPL-H', date('now'), date('now', '+24 months'), 'ATIVA', datetime('now')),
  (3, 'MER003', 'MER', date('now'), date('now', '+24 months'), 'ATIVA', datetime('now')),
  (4, 'PURSER004', 'FRMS-Level-2', date('now'), date('now', '+24 months'), 'ATIVA', datetime('now')),
  (5, 'FA005', 'SAFETY-PROCEDURES', date('now'), date('now', '+12 months'), 'ATIVA', datetime('now')),
  (6, 'FA006', 'EMERGENCY-EQUIPMENT', date('now'), date('now', '+24 months'), 'ATIVA', datetime('now')),
  (7, 'INSTR007', 'INSTRUCTOR', date('now'), date('now', '+24 months'), 'ATIVA', datetime('now')),
  (8, 'MGR008', 'RECURRENT-TRAINING', date('now'), date('now', '+12 months'), 'ATIVA', datetime('now'));

INSERT OR IGNORE INTO funcionarios (matricula, nome, cpf, email, cargo, setor, status, created_at)
VALUES
  ('MAT001', 'Captain João Silva', '11111111111', 'joao@airtrust.com.br', 'Piloto', 'Operações', 'ATIVO', datetime('now')),
  ('MAT002', 'First Officer Maria Santos', '22222222222', 'maria@airtrust.com.br', 'Copiloto', 'Operações', 'ATIVO', datetime('now')),
  ('MAT003', 'Captain Carlos Oliveira', '33333333333', 'carlos@airtrust.com.br', 'Piloto', 'Operações', 'ATIVO', datetime('now')),
  ('MAT004', 'Purser Ana Costa', '44444444444', 'ana@airtrust.com.br', 'Comissário Chefe', 'Operações', 'ATIVO', datetime('now')),
  ('MAT005', 'Flight Attendant Bruno Pereira', '55555555555', 'bruno@airtrust.com.br', 'Comissário', 'Operações', 'ATIVO', datetime('now')),
  ('MAT006', 'Flight Attendant Lucia Ferreira', '66666666666', 'lucia@airtrust.com.br', 'Comissária', 'Operações', 'ATIVO', datetime('now')),
  ('MAT007', 'Instructor Felipe Lima', '77777777777', 'felipe@airtrust.com.br', 'Instrutor', 'Treinamento', 'ATIVO', datetime('now')),
  ('MAT008', 'Training Manager Patricia Alves', '88888888888', 'patricia@airtrust.com.br', 'Gerente de Treinamento', 'RH', 'ATIVO', datetime('now'));
