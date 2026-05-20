-- Sincroniza modelos da empresa 6 (Costa do Sol) com PTO A Rev. 10 + PTO B Rev. 5.
-- Formato propositalmente simples para compatibilidade com execução remota no D1.

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Doutrinamento Básico', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 12, carga_horaria_inicial = 12, carga_horaria_recorrente = NULL, validade = NULL, vencimento_fim_mes = 0, observacoes = 'Somente treinamento inicial conforme PTO A Rev. 10.', conteudo_programatico = COALESCE(conteudo_programatico, 'Atribuições e responsabilidades do tripulante de voo
Regras e regulamentos aplicáveis
COA e Especificações Operativas
Partes relevantes do MGO
Noções sobre Artigos Perigosos
Fundamentos de SGSO, AVSEC e CRM'), updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'A';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'CGA - Conhecimentos Gerais de Aeronave', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 4, carga_horaria_recorrente = 2, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'B';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Emergências Gerais', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 4, carga_horaria_recorrente = 2, validade = 12, vencimento_fim_mes = 0, observacoes = 'Inclui sessões práticas simuladas obrigatórias.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'C';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'AVSEC', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 4, carga_horaria_inicial = 8, carga_horaria_recorrente = 4, validade = 24, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'D1';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'SGSO', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = 2, validade = 36, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'D2';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'CRM – Gerenciamento de Recursos da Tripulação', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 8, carga_horaria_inicial = 20, carga_horaria_recorrente = 8, validade = 12, vencimento_fim_mes = 0, observacoes = 'Periódico padrão 8h até 12 meses; acima disso o PTO prevê 16h.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'D3';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'DGR (Artigos Perigosos)', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 4, carga_horaria_inicial = 8, carga_horaria_recorrente = 4, validade = 24, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'D4';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Operações Offshore', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = 2, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E1';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Operações PBN – Navegação Baseada em Performance', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = 2, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E2';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Operações sobre Grandes Extensões de Água (inclui T-HUET)', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 8, carga_horaria_inicial = 8, carga_horaria_recorrente = 8, validade = 24, vencimento_fim_mes = 0, observacoes = 'Validade sistêmica ajustada para 24 meses pelo componente teórico; T-HUET prático no PTO permanece 48 meses.', updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E3';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Operação Aeromédica', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = 2, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E4';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'EFB – Electronic Flight Bag', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = 2, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E5';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Operações em Terrenos Desabitados', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = 2, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E6';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Manuseio de Carga', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = 2, validade = 12, vencimento_fim_mes = 0, conteudo_programatico = COALESCE(conteudo_programatico, 'Classificação dos tipos de carga
Critérios de embalagem, identificação, segregação e fixação
Limites de peso, balanceamento e compatibilidade
Inspeção, embarque, conferência e documentação
Restrições e ações de emergência'), updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E7';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Diário de Bordo Eletrônico (eDB)', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 2, carga_horaria_inicial = 2, carga_horaria_recorrente = 2, validade = 12, vencimento_fim_mes = 0, conteudo_programatico = COALESCE(conteudo_programatico, 'Conceitos e vantagens do eDB
Acesso seguro e funcionalidades
Procedimentos de preenchimento e assinatura
Validação e correção de informações
Armazenamento digital e contingência'), updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E8';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'AW139 – Solo', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 8, carga_horaria_inicial = 60, carga_horaria_recorrente = 8, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'F1';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'SK76 - Solo', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 8, carga_horaria_inicial = 32, carga_horaria_recorrente = 8, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'F2';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO DE VOO', nome = 'AW139 - Voo', categoria = 'TREINAMENTO DE VOO', carga_horaria = 8, carga_horaria_inicial = 24, carga_horaria_recorrente = 8, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'G1';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO DE VOO', nome = 'SK76 – Voo', categoria = 'TREINAMENTO DE VOO', carga_horaria = 6, carga_horaria_inicial = 24, carga_horaria_recorrente = 6, validade = 12, vencimento_fim_mes = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'G2';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Manual Geral de Operações (MGO)', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 1, carga_horaria_inicial = 1, carga_horaria_recorrente = 1, validade = 24, vencimento_fim_mes = 0, conteudo_programatico = COALESCE(conteudo_programatico, 'Estrutura e propósito do MGO
Responsabilidades dos tripulantes
Controle operacional e comunicação
Procedimentos de contingência
Conformidade regulatória e operacional'), updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'N';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Procedimentos Operacionais Padrão (SOP)', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 1, carga_horaria_inicial = 1, carga_horaria_recorrente = 1, validade = 24, vencimento_fim_mes = 0, conteudo_programatico = COALESCE(conteudo_programatico, 'Filosofia operacional da empresa
Procedimentos normais e anormais
Uso de checklists
Integração com FCOM e OM-B'), updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'O';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO TEÓRICO', nome = 'Prevenção de CFIT (Controlled Flight Into Terrain)', categoria = 'TREINAMENTO TEÓRICO', carga_horaria = 1, carga_horaria_inicial = 1, carga_horaria_recorrente = 1, validade = 24, vencimento_fim_mes = 0, conteudo_programatico = COALESCE(conteudo_programatico, 'Conceito e histórico de CFIT
Fatores contribuintes
Aproximação estabilizada
Práticas preventivas e CRM'), updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'P';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO DE VOO', nome = 'Treinamento Noturno em Unidade Marítima', categoria = 'TREINAMENTO DE VOO', carga_horaria = 1, carga_horaria_inicial = 2, carga_horaria_recorrente = 1, validade = 12, vencimento_fim_mes = 0, conteudo_programatico = COALESCE(conteudo_programatico, 'Fundamentos de segurança em operações noturnas offshore
Coordenação com a unidade marítima
Técnica de aproximação e pouso noturno
Comunicação com helideck e ATC
Exercícios práticos de pouso noturno'), updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'R';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO DE VOO', nome = 'Treinamento Noturno em Simulador', categoria = 'TREINAMENTO DE VOO', carga_horaria = 1, carga_horaria_inicial = 1, carga_horaria_recorrente = 1, validade = 6, vencimento_fim_mes = 0, conteudo_programatico = COALESCE(conteudo_programatico, 'Briefing sobre técnicas noturnas offshore
Procedimentos com referência visual degradada
Simulação de cenários adversos e de emergência
Prática de pousos noturnos em helideck simulado'), updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'S';

UPDATE qualificacoes_tipos
SET tipo = 'TREINAMENTO DE VOO', nome = 'Treinamento Noturno em Pista', categoria = 'TREINAMENTO DE VOO', carga_horaria = 0.67, carga_horaria_inicial = 0.67, carga_horaria_recorrente = 0.67, validade = NULL, vencimento_fim_mes = 0, observacoes = 'PTO define periodicidade conforme necessidade.', conteudo_programatico = COALESCE(conteudo_programatico, 'Técnicas de pouso noturno em pistas terrestres
Condições visuais e ambientais
Coordenação e comunicação durante o voo noturno
Procedimentos de segurança em pista'), updated_at = datetime('now')
WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'T';

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'TREINAMENTO TEÓRICO', 'A', 'Doutrinamento Básico', NULL, 'TREINAMENTO TEÓRICO', 12, NULL, 0, 'Somente treinamento inicial conforme PTO A Rev. 10.', 1, datetime('now'), datetime('now'), NULL, 6, 0, 'Atribuições e responsabilidades do tripulante de voo
Regras e regulamentos aplicáveis
COA e Especificações Operativas
Partes relevantes do MGO
Noções sobre Artigos Perigosos
Fundamentos de SGSO, AVSEC e CRM', 12, NULL
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'A');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'TREINAMENTO TEÓRICO', 'E7', 'Manuseio de Carga', NULL, 'TREINAMENTO TEÓRICO', 2, 12, 0, NULL, 1, datetime('now'), datetime('now'), NULL, 6, 0, 'Classificação dos tipos de carga
Critérios de embalagem, identificação, segregação e fixação
Limites de peso, balanceamento e compatibilidade
Inspeção, embarque, conferência e documentação
Restrições e ações de emergência', 2, 2
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E7');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'TREINAMENTO TEÓRICO', 'E8', 'Diário de Bordo Eletrônico (eDB)', NULL, 'TREINAMENTO TEÓRICO', 2, 12, 0, NULL, 1, datetime('now'), datetime('now'), NULL, 6, 0, 'Conceitos e vantagens do eDB
Acesso seguro e funcionalidades
Procedimentos de preenchimento e assinatura
Validação e correção de informações
Armazenamento digital e contingência', 2, 2
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'E8');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'TREINAMENTO TEÓRICO', 'N', 'Manual Geral de Operações (MGO)', NULL, 'TREINAMENTO TEÓRICO', 1, 24, 0, NULL, 1, datetime('now'), datetime('now'), NULL, 6, 0, 'Estrutura e propósito do MGO
Responsabilidades dos tripulantes
Controle operacional e comunicação
Procedimentos de contingência
Conformidade regulatória e operacional', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'N');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'TREINAMENTO TEÓRICO', 'O', 'Procedimentos Operacionais Padrão (SOP)', NULL, 'TREINAMENTO TEÓRICO', 1, 24, 0, NULL, 1, datetime('now'), datetime('now'), NULL, 6, 0, 'Filosofia operacional da empresa
Procedimentos normais e anormais
Uso de checklists
Integração com FCOM e OM-B', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'O');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'TREINAMENTO TEÓRICO', 'P', 'Prevenção de CFIT (Controlled Flight Into Terrain)', NULL, 'TREINAMENTO TEÓRICO', 1, 24, 0, NULL, 1, datetime('now'), datetime('now'), NULL, 6, 0, 'Conceito e histórico de CFIT
Fatores contribuintes
Aproximação estabilizada
Práticas preventivas e CRM', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'P');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'TREINAMENTO DE VOO', 'R', 'Treinamento Noturno em Unidade Marítima', NULL, 'TREINAMENTO DE VOO', 1, 12, 0, NULL, 1, datetime('now'), datetime('now'), NULL, 6, 0, 'Fundamentos de segurança em operações noturnas offshore
Coordenação com a unidade marítima
Técnica de aproximação e pouso noturno
Comunicação com helideck e ATC
Exercícios práticos de pouso noturno', 2, 1
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'R');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'TREINAMENTO DE VOO', 'S', 'Treinamento Noturno em Simulador', NULL, 'TREINAMENTO DE VOO', 1, 6, 0, NULL, 1, datetime('now'), datetime('now'), NULL, 6, 0, 'Briefing sobre técnicas noturnas offshore
Procedimentos com referência visual degradada
Simulação de cenários adversos e de emergência
Prática de pousos noturnos em helideck simulado', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'S');

INSERT INTO qualificacoes_tipos (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at, empresa_id, is_check, conteudo_programatico, carga_horaria_inicial, carga_horaria_recorrente)
SELECT 'TREINAMENTO DE VOO', 'T', 'Treinamento Noturno em Pista', NULL, 'TREINAMENTO DE VOO', 0.67, NULL, 0, 'PTO define periodicidade conforme necessidade.', 1, datetime('now'), datetime('now'), NULL, 6, 0, 'Técnicas de pouso noturno em pistas terrestres
Condições visuais e ambientais
Coordenação e comunicação durante o voo noturno
Procedimentos de segurança em pista', 0.67, 0.67
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 6 AND deleted_at IS NULL AND codigo = 'T');