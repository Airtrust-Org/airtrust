-- Migration 0112: Seed de dados de exemplo para qualificacoes_tipos
-- Data: 2025-11-26
-- Objetivo: Popular tabela com dados de exemplo para teste de importação

-- Inserir tipos de qualificações de aviação comuns
INSERT OR IGNORE INTO qualificacoes_tipos (id, tipo, codigo, nome, descricao, categoria, carga_horaria, validade, observacoes, ativo, created_at, updated_at, deleted_at)
VALUES
  ('tipo-001', 'Piloto', 'CMA', 'Comandante', 'Comandante de Aeronave - Autoridade máxima a bordo', 'Pilotagem', 120, 24, 'Renovação bienal', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-002', 'Piloto', 'SIC', 'Segundo em Comando', 'Segundo em Comando de Aeronave', 'Pilotagem', 80, 24, 'Renovação bienal', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-003', 'Piloto', 'PP', 'Piloto Privado', 'Piloto Privado - Voos não comerciais', 'Pilotagem', 60, 24, 'Renovação bienal', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-004', 'Piloto', 'PC', 'Piloto Comercial', 'Piloto Comercial - Voos remunerados', 'Pilotagem', 100, 24, 'Renovação bienal', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-005', 'Habilitação', 'IFR', 'Voo por Instrumento', 'Habilitação de Voo por Instrumento - Voos em IMC', 'Voo', 40, 24, 'Renovação bienal', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-006', 'Habilitação', 'MLTE', 'Multi-Engine', 'Habilitação para Aeronaves Multimotoras', 'Voo', 30, 24, 'Renovação bienal', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-007', 'Instrutor', 'CFI', 'Instrutor de Voo', 'Instrutor de Voo de Avião - Autorizado a treinar pilotos', 'Instrução', 50, 24, 'Renovação anual', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-008', 'Piloto', 'ATPL', 'Piloto de Linha Aérea', 'Piloto de Linha Aérea - ATPL', 'Pilotagem', 150, 24, 'Renovação bienal', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-009', 'Técnico', 'AME', 'Mecânico de Aeronave', 'Mecânico de Manutenção de Aeronave', 'Manutenção', 200, 24, 'Renovação bienal com inspeção', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-010', 'Segurança', 'CRM', 'Crew Resource Management', 'Treinamento de Gerenciamento de Recursos da Tripulação', 'Tripulação', 16, 24, 'Renovação anual', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-011', 'Segurança', 'SEGURANCA', 'Segurança de Voo', 'Treinamento de Segurança de Voo', 'Segurança', 20, 12, 'Renovação anual', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-012', 'Médico', 'AEROMEDICO', 'Certificado Aeromédico', 'Certificado Médico para Operação Aérea', 'Médico', 8, 12, 'Renovação anual', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-013', 'Despacho', 'DESPACHO', 'Despacho de Aeronave', 'Autorização para Despacho de Aeronave', 'Operacional', 24, 24, 'Renovação bienal', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-014', 'Treinamento', 'SIMULADOR', 'Treinamento em Simulador', 'Horas de Treinamento em Simulador de Voo', 'Treinamento', 40, 24, 'Renovação por ciclo', 1, datetime('now'), datetime('now'), NULL),
  ('tipo-015', 'Procedimento', 'PO', 'Procedimentos Operacionais', 'Conhecimento de Procedimentos Operacionais', 'Operacional', 16, 12, 'Revisão anual', 1, datetime('now'), datetime('now'), NULL);

-- Registrar estatísticas no log
SELECT COUNT(*) as total_tipos_cadastrados FROM qualificacoes_tipos WHERE deleted_at IS NULL;

-- Fim Migration 0112
