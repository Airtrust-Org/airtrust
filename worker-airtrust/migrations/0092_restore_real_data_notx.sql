-- 0092_restore_real_data.sql
-- Restaura dados reais de qualificacoes_historico do backup prod_full_backup.sql
-- Estratégia: codigo = nome da qualificação, categoria = data_conclusao


-- FASE 1: Criar tipos de qualificações baseados em nomes únicos
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Certificado Médico Aeronáutico', 'Certificado Médico Aeronáutico', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Emergências Gerais', 'Emergências Gerais', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('CHT IFR', 'CHT IFR', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('CHT TIPO', 'CHT TIPO', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('AVSEC', 'AVSEC', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('FAP 05.2', 'FAP 05.2', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('OPC', 'OPC', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('FAP 06', 'FAP 06', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('SGSO', 'SGSO', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('CRM – Gerenciamento de Recursos da Tripulação', 'CRM – Gerenciamento de Recursos da Tripulação', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Atestado Saúde Ocupacional', 'Atestado Saúde Ocupacional', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Operações sobre Grandes Extensões de Água (inclui T-HUET)', 'Operações sobre Grandes Extensões de Água (inclui T-HUET)', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('EFB – Eletronic Flight Bag', 'EFB – Eletronic Flight Bag', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Conhecimentos Gerais de Aeronave', 'Conhecimentos Gerais de Aeronave', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('DGR (Artigos Perigosos)', 'DGR (Artigos Perigosos)', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Operações Offshore', 'Operações Offshore', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Operações PBN – Navegação Baseada em Performance', 'Operações PBN – Navegação Baseada em Performance', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('FAP 14', 'FAP 14', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('SAE-FAP14', 'SAE-FAP14', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('IFR', 'IFR', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('LOFT', 'LOFT', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('SAE-FAP06-135', 'SAE-FAP06-135', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('SK76 - Solo', 'SK76 - Solo', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('SK76 – Voo', 'SK76 – Voo', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Operação Aeromédica', 'Operação Aeromédica', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('AW139 – Solo', 'AW139 – Solo', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('AW139 - Voo', 'AW139 - Voo', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Treinamento Noturno Helideck', 'Treinamento Noturno Helideck', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('LPC', 'LPC', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('ROTA', 'ROTA', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Operações em Terrenos Desabitados', 'Operações em Terrenos Desabitados', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Examinador Credenciado - Solo', 'Examinador Credenciado - Solo', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('CRM - Crew Resource Management', 'CRM - Crew Resource Management', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Exame Médico Aeronáutico (ASO)', 'Exame Médico Aeronáutico (ASO)', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Check de Proficiência - B737', 'Check de Proficiência - B737', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Diferenças do SK76', 'Diferenças do SK76', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Segurança de Voo', 'Segurança de Voo', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Manutenção Preventiva', 'Manutenção Preventiva', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Atendimento ao Passageiro', 'Atendimento ao Passageiro', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Avaliação Psicológica', 'Avaliação Psicológica', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Teste', 'Teste', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Check Final Teste', 'Check Final Teste', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Treinamento Validação Final', 'Treinamento Validação Final', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Auditoria Check Test', 'Auditoria Check Test', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO qualificacoes_tipos (codigo, nome, categoria, orgao_emissor, validade_meses, created_at, updated_at)
VALUES ('Teste Final Absoluto', 'Teste Final Absoluto', 'TREINAMENTO', 'A definir', NULL, datetime('now'), datetime('now'));

-- FASE 2: Atualizar qualificacoes_historico com dados restaurados
UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM - Crew Resource Management',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM - Crew Resource Management' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Segurança de Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Segurança de Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 2 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM - Crew Resource Management',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM - Crew Resource Management' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 3 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Manutenção Preventiva',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Manutenção Preventiva' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 4 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atendimento ao Passageiro',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atendimento ao Passageiro' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 5 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Exame Médico Aeronáutico (ASO)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Exame Médico Aeronáutico (ASO)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 6 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Exame Médico Aeronáutico (ASO)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Exame Médico Aeronáutico (ASO)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 7 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Avaliação Psicológica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Avaliação Psicológica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 8 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Check de Proficiência - B737',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Check de Proficiência - B737' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 9 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Check de Proficiência - B737',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Check de Proficiência - B737' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 10 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 11 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Teste',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Teste' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 12 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 13 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 14 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 15 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 16 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 17 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 18 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 19 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 20 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 21 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 22 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 23 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 24 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 25 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 26 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 27 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 28 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 29 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 30 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 31 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 32 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 33 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 34 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 35 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 36 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 37 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 38 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 39 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 40 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 41 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 42 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 43 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 44 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 45 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 46 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 47 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 48 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 49 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 50 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 51 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 52 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 53 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 54 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 55 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 56 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 57 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 58 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 59 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 60 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 61 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 62 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 63 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 64 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 65 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 66 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 67 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 68 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 69 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 70 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 71 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 72 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 73 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 74 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 75 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 76 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 77 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 78 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 79 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 80 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 81 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 82 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 83 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 84 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 85 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 86 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 87 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 88 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 89 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 90 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 91 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 92 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 93 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 94 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 95 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 96 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 97 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 98 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 99 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 100 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 101 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 102 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 103 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 104 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 105 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 106 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'ROTA',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'ROTA' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 107 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 108 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 109 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 110 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 111 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 112 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 113 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 114 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 115 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 116 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 117 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 118 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 119 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 120 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 121 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 122 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 123 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 124 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 125 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 126 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 127 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 128 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 129 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 130 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 131 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 132 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 133 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 134 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 135 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 136 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 137 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 138 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 139 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 140 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 141 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 142 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 143 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 144 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 145 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 146 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 147 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 148 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 149 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 150 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 151 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 152 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 153 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 154 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 155 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 156 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 157 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 158 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 159 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 160 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 161 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 162 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 163 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 164 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 165 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 166 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 167 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 168 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 169 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 170 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 171 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 172 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 173 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 174 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 175 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 176 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 177 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 178 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 179 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 180 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 181 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 182 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 183 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 184 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 185 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 186 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 187 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 188 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 189 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 190 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 191 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 192 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 193 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 194 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 195 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 196 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 197 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 198 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 199 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 200 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 201 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 202 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 203 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 204 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 205 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 206 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 207 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 208 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 209 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 210 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 211 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 212 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 213 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Diferenças do SK76',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Diferenças do SK76' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 214 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 215 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 216 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 217 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 218 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 219 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 220 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 221 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 222 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 223 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 224 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 225 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 226 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 227 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 228 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 229 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 230 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 231 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 232 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 233 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 234 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 235 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 236 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 237 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 238 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 239 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 240 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 241 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações em Terrenos Desabitados',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações em Terrenos Desabitados' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 242 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Noturno Helideck',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Noturno Helideck' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 243 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 244 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 245 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 246 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 247 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 248 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 249 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 250 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 251 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 252 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 253 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 254 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 255 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 256 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 257 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 258 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 259 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 260 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 261 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 262 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Examinador Credenciado - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Examinador Credenciado - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 263 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 264 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'ROTA',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'ROTA' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 265 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 266 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 267 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Noturno Helideck',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Noturno Helideck' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 268 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 269 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 270 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 271 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 272 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 273 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 274 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 275 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 276 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 277 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 278 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 279 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 280 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 281 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 282 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 283 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 284 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 285 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 286 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 287 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 288 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 289 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 290 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 291 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 292 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 293 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 294 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 295 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 296 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 297 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 298 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 299 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 300 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 301 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 302 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 303 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 304 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 305 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 306 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 307 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 308 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 309 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 310 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 311 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 312 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 313 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 314 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 315 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 316 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 317 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 318 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'ROTA',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'ROTA' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 319 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 320 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 321 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações em Terrenos Desabitados',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações em Terrenos Desabitados' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 322 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 323 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 324 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 325 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 326 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 327 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 328 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 329 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 330 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 331 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 332 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 333 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 334 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 335 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 336 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 337 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 338 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 339 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 340 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 341 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 342 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 343 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 344 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 345 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 346 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 347 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 348 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 349 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 350 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 351 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 352 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 353 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 354 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 355 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 356 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 357 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 358 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 359 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 360 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 361 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Noturno Helideck',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Noturno Helideck' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 362 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 363 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 364 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 365 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 366 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 367 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 368 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 369 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 370 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 371 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 372 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 373 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 374 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 375 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 376 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 377 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 378 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 379 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 380 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 381 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 382 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 383 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 384 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Noturno Helideck',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Noturno Helideck' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 385 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 386 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 387 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 388 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 389 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 390 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 391 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 392 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 393 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 394 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 395 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 396 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 397 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 398 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 399 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 400 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 401 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 402 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 403 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 404 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 405 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 406 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 407 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 408 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 409 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 410 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 411 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 412 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 413 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 414 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 415 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 416 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 417 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 418 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 419 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 420 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 421 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 422 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 423 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 424 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 425 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 426 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 427 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 428 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações em Terrenos Desabitados',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações em Terrenos Desabitados' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 429 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Noturno Helideck',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Noturno Helideck' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 430 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 431 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 432 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 433 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 434 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 435 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 436 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 437 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 438 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 439 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 440 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 441 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 442 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 443 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 444 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 445 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 446 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 447 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 448 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 449 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 450 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 451 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 452 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 453 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 454 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 455 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 456 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 457 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 458 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 459 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 460 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 461 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 462 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 463 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 464 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 465 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 466 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 467 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 468 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 469 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 470 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 471 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 472 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 473 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 474 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 475 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 476 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 477 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 478 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 479 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 480 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 481 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 482 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 483 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 484 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 485 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 486 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 487 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 488 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 489 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 490 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 491 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 492 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 493 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 494 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 495 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 496 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 497 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 498 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 499 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 500 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 501 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 502 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 503 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 504 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 505 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 506 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 507 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 508 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 509 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 510 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 511 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 512 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 513 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 514 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 515 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 516 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 517 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 518 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 519 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 520 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 521 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 522 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 523 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 524 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 525 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 526 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 527 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 528 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 529 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 530 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 531 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 532 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 533 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 534 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 535 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 536 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 537 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 538 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 539 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 540 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 541 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 542 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 543 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 544 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 545 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 546 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 547 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 548 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 549 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 550 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 551 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 552 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'ROTA',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'ROTA' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 553 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 554 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 555 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 556 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 557 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 558 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 559 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 560 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 561 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 562 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 563 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 564 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 565 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 566 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 567 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 568 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 569 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 570 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 571 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 572 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 573 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 574 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 575 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 576 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 577 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 578 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 579 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 580 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 581 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 582 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 583 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 584 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 585 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 586 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 587 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 588 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 589 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 590 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 591 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 592 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 593 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 594 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 595 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 596 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 597 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 598 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 599 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 600 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 601 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 602 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 603 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 604 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 605 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 606 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 607 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 608 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 609 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 610 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 611 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 612 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 613 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 614 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 615 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 616 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 617 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 618 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 619 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 620 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 621 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 622 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 623 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 624 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 625 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 626 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 627 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 628 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 629 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 630 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 631 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 632 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 633 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 634 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 635 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 636 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 637 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 638 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 639 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 640 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 641 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 642 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 643 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 644 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 645 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 646 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 647 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 648 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 649 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 650 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 651 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 652 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 653 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 654 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 655 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 656 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 657 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 658 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 659 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 660 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 661 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 662 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 663 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 664 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 665 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 666 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 667 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Diferenças do SK76',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Diferenças do SK76' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 668 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 669 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 670 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 671 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 672 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 673 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 674 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 675 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 676 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 677 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 678 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 679 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 680 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 681 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 682 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 683 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 684 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 685 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 686 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 687 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 688 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 689 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 690 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 691 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 692 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 693 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 694 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 695 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 696 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 697 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 698 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 699 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 700 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 701 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 702 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 703 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações em Terrenos Desabitados',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações em Terrenos Desabitados' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 704 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Noturno Helideck',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Noturno Helideck' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 705 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 706 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 707 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 708 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 709 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 710 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 711 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 712 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 713 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 714 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 715 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 716 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 717 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 718 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 719 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 720 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 721 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 722 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 723 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 724 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 725 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 726 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Examinador Credenciado - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Examinador Credenciado - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 727 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 728 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'ROTA',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'ROTA' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 729 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 730 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 731 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Noturno Helideck',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Noturno Helideck' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 732 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 733 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 734 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 735 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 736 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 737 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 738 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 739 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 740 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 741 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 742 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 743 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 744 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 745 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 746 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 747 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 748 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 749 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 750 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 751 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 752 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 753 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 754 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 755 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 756 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 757 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 758 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 759 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 760 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 761 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 762 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 763 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 764 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 765 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 766 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 767 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 768 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 769 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 770 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 771 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 772 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 773 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 774 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 775 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 776 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 777 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 778 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 779 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 780 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 781 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 782 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 783 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 784 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'ROTA',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'ROTA' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 785 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 786 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 787 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações em Terrenos Desabitados',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações em Terrenos Desabitados' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 788 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 789 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 790 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 791 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 792 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 793 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 794 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 795 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 796 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 797 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 798 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 799 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 800 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 801 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 802 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 803 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 804 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 805 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 806 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 807 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 808 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 809 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 810 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 811 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 812 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 813 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 814 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 815 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 816 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 817 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 818 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 819 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 820 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 821 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 822 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 823 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 824 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 825 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 826 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 827 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 828 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 829 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Noturno Helideck',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Noturno Helideck' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 830 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 831 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 832 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 833 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 834 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 835 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 836 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 837 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 838 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 839 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 840 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 841 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 842 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 843 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 844 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 845 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 846 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 847 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 848 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 849 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 850 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 851 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 852 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 853 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 854 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Noturno Helideck',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Noturno Helideck' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 855 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 856 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 857 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 858 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 859 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 860 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 861 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 862 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 863 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 864 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 865 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 866 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 867 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 868 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 869 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 870 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 871 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 872 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 873 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 874 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 875 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 876 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 877 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 878 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 879 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 880 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 881 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 882 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 883 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 884 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 885 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 886 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 887 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 888 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 889 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 890 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 891 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 892 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 893 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 894 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 895 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 896 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 897 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 898 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 899 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 900 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações em Terrenos Desabitados',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações em Terrenos Desabitados' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 901 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Noturno Helideck',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Noturno Helideck' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 902 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 903 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 904 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 905 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 906 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 907 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 908 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 909 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 910 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 911 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 912 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 913 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 914 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 915 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 916 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 917 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 918 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 919 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 920 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 921 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 922 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 923 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 924 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 925 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 926 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 927 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 928 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 929 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 930 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Examinador Credenciado - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Examinador Credenciado - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 931 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Examinador Credenciado - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Examinador Credenciado - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 932 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 933 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 934 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 935 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 936 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 937 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 938 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 939 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 940 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 941 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 942 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 943 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 944 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 945 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 946 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 947 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 948 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 949 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 950 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 951 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 952 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 953 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 954 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 955 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 956 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 957 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 958 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 959 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 960 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 961 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 962 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 963 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 964 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 965 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 966 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 967 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 968 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 969 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 970 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 971 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 972 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 973 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 974 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 975 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 976 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 977 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 978 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 979 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'ROTA',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'ROTA' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 980 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 981 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 982 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 983 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 984 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 985 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 986 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 987 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 988 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 989 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 990 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 991 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 992 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 993 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 994 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 995 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 996 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 – Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 – Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 997 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 998 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 999 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1000 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AW139 - Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AW139 - Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1001 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1002 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1003 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1004 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1005 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Conhecimentos Gerais de Aeronave',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Conhecimentos Gerais de Aeronave' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1006 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Emergências Gerais',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Emergências Gerais' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1007 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1008 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CHT TIPO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CHT TIPO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1009 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Certificado Médico Aeronáutico',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Certificado Médico Aeronáutico' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1010 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'AVSEC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'AVSEC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1011 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SGSO',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SGSO' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1012 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'CRM – Gerenciamento de Recursos da Tripulação',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'CRM – Gerenciamento de Recursos da Tripulação' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1013 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'DGR (Artigos Perigosos)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'DGR (Artigos Perigosos)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1014 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Atestado Saúde Ocupacional',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Atestado Saúde Ocupacional' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1015 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações Offshore',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações Offshore' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1016 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações PBN – Navegação Baseada em Performance',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações PBN – Navegação Baseada em Performance' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1017 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1018 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Operação Aeromédica',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Operação Aeromédica' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1019 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'EFB – Eletronic Flight Bag',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'EFB – Eletronic Flight Bag' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1020 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 - Solo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 - Solo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1021 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 05.2',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 05.2' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1022 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1023 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 06',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 06' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1024 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'FAP 14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'FAP 14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1025 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SK76 – Voo',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SK76 – Voo' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1026 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'IFR',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'IFR' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1027 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'LOFT',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'LOFT' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1028 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'OPC',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'OPC' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1029 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'ROTA',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'ROTA' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1030 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP06-135',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP06-135' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1031 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'SAE-FAP14',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'SAE-FAP14' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1032 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Check Final Teste',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Check Final Teste' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1033 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Treinamento Validação Final',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Treinamento Validação Final' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1034 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Auditoria Check Test',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Auditoria Check Test' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1035 AND deleted_at IS NULL;

UPDATE qualificacoes_historico SET
  tipo_codigo = 'TREINAMENTO',
  codigo = 'Teste Final Absoluto',
  categoria = 'TREINAMENTO',
  qualificacao_id = (SELECT id FROM qualificacoes_tipos WHERE codigo = 'Teste Final Absoluto' AND deleted_at IS NULL LIMIT 1),
  numero_certificado = '12',
  updated_at = datetime('now')
WHERE id = 1036 AND deleted_at IS NULL;

-- FASE 3: Soft delete tipo genérico
UPDATE qualificacoes_tipos SET deleted_at = datetime('now')
WHERE codigo IN ('GEN_TREINAMENTO','GEN_TREINAMENTO_UNIFICADO')
  AND deleted_at IS NULL
  AND id NOT IN (SELECT DISTINCT qualificacao_id FROM qualificacoes_historico WHERE deleted_at IS NULL AND qualificacao_id IS NOT NULL);

-- FASE 4: Relatório
SELECT COUNT(DISTINCT qualificacao_id) AS tipos_ativos, COUNT(*) AS total_registros
FROM qualificacoes_historico WHERE deleted_at IS NULL;

SELECT qt.codigo, COUNT(qh.id) AS total
FROM qualificacoes_historico qh
JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
WHERE qh.deleted_at IS NULL AND qt.deleted_at IS NULL
GROUP BY qt.id, qt.codigo
ORDER BY total DESC LIMIT 20;

