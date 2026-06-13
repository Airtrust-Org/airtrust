-- Fase A: INSERT 6 categorias Manutenção (empresa_id=6)
-- Idempotente: usa WHERE NOT EXISTS para evitar duplicatas
-- Script: categorias-manutencao-insert.sql

INSERT INTO qualificacoes_categorias (empresa_id, nome, codigo, cor, descricao, ativo, created_at, updated_at)
SELECT 6, 'Treinamento de Doutrinação', 'TREINAMENTO-DE-DOUTRINACAO', '#14B8A6',
  'Treinamentos de integração e doutrinamento inicial da equipe de Manutenção', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
  WHERE empresa_id = 6 AND UPPER(TRIM(nome)) = UPPER('Treinamento de Doutrinação') AND deleted_at IS NULL
);

INSERT INTO qualificacoes_categorias (empresa_id, nome, codigo, cor, descricao, ativo, created_at, updated_at)
SELECT 6, 'Treinamento de Produto', 'TREINAMENTO-DE-PRODUTO', '#EF4444',
  'Treinamentos técnicos sobre aeronaves e motores específicos da frota', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
  WHERE empresa_id = 6 AND UPPER(TRIM(nome)) = UPPER('Treinamento de Produto') AND deleted_at IS NULL
);

INSERT INTO qualificacoes_categorias (empresa_id, nome, codigo, cor, descricao, ativo, created_at, updated_at)
SELECT 6, 'Treinamento Técnico Especializado', 'TREINAMENTO-TECNICO-ESPECIALIZADO', '#F59E0B',
  'Treinamentos em áreas especializadas: HUMS, IRM, MEL, artigos perigosos, fatores humanos', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
  WHERE empresa_id = 6 AND UPPER(TRIM(nome)) = UPPER('Treinamento Técnico Especializado') AND deleted_at IS NULL
);

INSERT INTO qualificacoes_categorias (empresa_id, nome, codigo, cor, descricao, ativo, created_at, updated_at)
SELECT 6, 'Treinamento Corretivo', 'TREINAMENTO-CORRETIVO', '#EC4899',
  'Treinamentos corretivos para sanar desvios identificados em auditorias ou inspeções', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
  WHERE empresa_id = 6 AND UPPER(TRIM(nome)) = UPPER('Treinamento Corretivo') AND deleted_at IS NULL
);

INSERT INTO qualificacoes_categorias (empresa_id, nome, codigo, cor, descricao, ativo, created_at, updated_at)
SELECT 6, 'Treinamento em Serviço - OJT', 'TREINAMENTO-EM-SERVICO-OJT', '#8B5CF6',
  'Treinamento em serviço (On-the-Job Training) não estruturado', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
  WHERE empresa_id = 6 AND UPPER(TRIM(nome)) = UPPER('Treinamento em Serviço - OJT') AND deleted_at IS NULL
);

INSERT INTO qualificacoes_categorias (empresa_id, nome, codigo, cor, descricao, ativo, created_at, updated_at)
SELECT 6, 'Treinamento em Serviço - OJT Estruturado', 'TREINAMENTO-EM-SERVICO-OJT-ESTRUTURADO', '#6366F1',
  'Treinamento em serviço com plano documentado e acompanhamento formal (OJT Estruturado)', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
  WHERE empresa_id = 6 AND UPPER(TRIM(nome)) = UPPER('Treinamento em Serviço - OJT Estruturado') AND deleted_at IS NULL
);
