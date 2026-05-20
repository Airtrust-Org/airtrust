-- Delta PTO consolidado para empresa 6.
-- Ajusta nomes/cargas/validade e inclui modelos faltantes na categoria OUTROS.

INSERT INTO qualificacoes_categorias (nome, codigo, descricao, cor, ativo, created_at, updated_at)
SELECT 'OUTROS', 'OUTROS', 'Modelos complementares e especiais do PTO', '#6B7280', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias WHERE UPPER(codigo) = 'OUTROS' AND deleted_at IS NULL
);

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Conhecimentos Gerais da Aeronave', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 4, carga_horaria_recorrente = 2, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'B';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'CRM — Gerenciamento de Recursos da Tripulação', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 8, carga_horaria_inicial = 20, carga_horaria_recorrente = 8, validade = 12, vencimento_fim_mes = 0, observacoes = 'Inicial: 16h teórico + 4h prático. Periódico: 8h até 12 meses; acima disso o PTO prevê 16h.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'D3';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'DGR — Transporte de Artigos Perigosos', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 4, carga_horaria_inicial = 8, carga_horaria_recorrente = 4, validade = 24, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'D4';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 8, carga_horaria_inicial = 8, carga_horaria_recorrente = 8, validade = 24, vencimento_fim_mes = 0, observacoes = 'Inicial: 3h teórico + 5h prático. Periódico: componente teórico com 24 meses; T-HUET prático conforme OPITO em 48 meses.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E3';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'AW139 — Currículo de Solo', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 8, carga_horaria_inicial = 60, carga_horaria_recorrente = 8, validade = 12, vencimento_fim_mes = 0, observacoes = 'Inicial composto por 56h de currículo + 4h de exame.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'F1';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'SK76 — Currículo de Solo', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 8, carga_horaria_inicial = 32, carga_horaria_recorrente = 8, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'F2';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO DE VOO', nome = 'AW139 — Currículo de Voo', categoria = 'TREINAMENTO DE VOO', carga_horaria = 8, carga_horaria_inicial = 24, carga_horaria_recorrente = 8, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'G1';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO DE VOO', nome = 'SK76 — Currículo de Voo', categoria = 'TREINAMENTO DE VOO', carga_horaria = 6, carga_horaria_inicial = 24, carga_horaria_recorrente = 6, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'G2';

UPDATE qualificacoes_tipos
SET tipo = 'OUTROS', nome = 'Currículo de Diferenças — Sikorsky S76', categoria = 'OUTROS', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = NULL, validade = NULL, vencimento_fim_mes = 0, observacoes = 'Treinamento sob demanda, sem recorrência periódica definida.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'H';

UPDATE qualificacoes_tipos
SET tipo = 'OUTROS', nome = 'Instrutor de Voo — Solo', categoria = 'OUTROS', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = NULL, validade = NULL, vencimento_fim_mes = 0, observacoes = 'PTO prevê 2h para quem já é INVA e 8h para quem não é INVA.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'I';

UPDATE qualificacoes_tipos
SET tipo = 'OUTROS', nome = 'Instrutor de Voo — Voo', categoria = 'OUTROS', carga_horaria = 1, carga_horaria_inicial = 2, carga_horaria_recorrente = 1, validade = 24, vencimento_fim_mes = 0, observacoes = 'Periódico composto por 1h de exame a cada 2 anos.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'J';

UPDATE qualificacoes_tipos
SET tipo = 'OUTROS', nome = 'Examinador Credenciado — Solo', categoria = 'OUTROS', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = NULL, validade = NULL, vencimento_fim_mes = 0, observacoes = 'PTO prevê 2h para instrutor e 4h para não instrutor.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'L';

UPDATE qualificacoes_tipos
SET tipo = 'OUTROS', nome = 'Examinador Credenciado — Voo', categoria = 'OUTROS', carga_horaria = 1, carga_horaria_inicial = 2, carga_horaria_recorrente = 1, validade = 24, vencimento_fim_mes = 0, observacoes = 'Periódico composto por 1h de exame a cada 2 anos.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'M';

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'Q', 'Experiência Operacional em Rota', NULL, 'OUTROS', 20, NULL, 0, 'Inicial: 20h ou 10h + 10 pousos/decolagens. Sem recorrência periódica definida.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, 20, NULL
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'Q');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'VM-SOLO', 'Verificação de Manutenção — Solo', NULL, 'OUTROS', 1, 36, 0, 'Inicial 1h. Periódico 1h a cada 3 anos.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'VM-SOLO');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'VM-VOO', 'Verificação de Manutenção — Voo', NULL, 'OUTROS', 1, 36, 0, 'Inicial 1h. Periódico 1h a cada 3 anos.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'VM-VOO');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'IOS-T', 'Instrutor Operador de Estação (IOS) — Teórico', NULL, 'OUTROS', 5, NULL, 0, 'Somente treinamento inicial de 5h.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, 5, NULL
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'IOS-T');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'IOS-P', 'Instrutor Operador de Estação (IOS) — Prático', NULL, 'OUTROS', 3, NULL, 0, 'Somente treinamento inicial de 3h.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, 3, NULL
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'IOS-P');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'CRM-LOS-T', 'CRM em Ambiente LOS — Teórico', NULL, 'OUTROS', 4, 12, 0, 'Inicial 4h. Periódico 4h anual.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, 4, 4
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'CRM-LOS-T');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'CRM-LOS-P', 'CRM em Ambiente LOS — Prático', NULL, 'OUTROS', 4, 12, 0, 'Inicial 4h. Periódico 4h anual.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, 4, 4
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'CRM-LOS-P');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'REG-ANAC', 'Regulação ANAC', NULL, 'OUTROS', 1, 12, 0, 'Inicial 1h. Periódico 1h anual.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'REG-ANAC');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'PETRO-OURO', 'Regras de Ouro — Petrobras', NULL, 'OUTROS', 1, NULL, 0, 'Somente treinamento inicial de 1h.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'PETRO-OURO');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'THUET', 'T-HUET — Escape de Helicóptero Submerso', NULL, 'OUTROS', NULL, 48, 0, 'Carga horária e validade conforme padrão OPITO. Recorrência usual em 4 anos.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'THUET');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'OUTROS', 'EN-ASSES', 'English Assessment — Pilots', NULL, 'OUTROS', 1, 12, 0, 'Inicial 1h. Periódico 1h anual.', 1, datetime('now'), datetime('now'), NULL, 6, 0, NULL, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'EN-ASSES');