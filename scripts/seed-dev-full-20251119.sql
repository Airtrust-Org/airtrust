-- =============================================================
-- AIRTRUST DEV SEED - CONSOLIDADO (2025-11-19)
-- Objetivo: Popular ambiente de desenvolvimento com dados reais
-- provenientes de snapshots/migrações antigas e export de produção
-- sem reprocessar todo o d1-prod-export.sql (evita colisões de schema).
-- Seguro: usa INSERT OR IGNORE e checagens NOT EXISTS.
-- Banco alvo: airtrust-db-dev (wrangler.dev.toml)
-- Uso:
--   wrangler d1 execute --config wrangler.dev.toml airtrust-db-dev --local --file scripts/seed-dev-full-20251119.sql
-- =============================================================

PRAGMA foreign_keys=OFF; -- desabilita FK temporariamente para semear dados interdependentes
BEGIN TRANSACTION;

-- =============================
-- 1. Funcionarios (dados reais)
-- Fonte: scripts/d1-seed-funcionarios.sql
-- =============================
INSERT OR IGNORE INTO funcionarios (matricula, nome, cpf, email, cargo, setor, status, created_at, updated_at)
VALUES
('00300', 'Adriana Brasil', '13465142837', 'adriana.brasil@voecostadosol.co.br', 'Piloto', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:43:58', '2025-11-06 12:40:56'),
('00074', 'Antonio Luiz Simões Ramos', '419.906.257-20', 'antonio.ramos@voecostadosol.com.br', 'Co-piloto', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:43:58', '2025-11-06 12:40:56'),
('00003', 'Bernardo Freire Antunes', '05241484736', 'bernardo.antunes@voecostadosol.com.br', 'Comissário', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:43:58', '2025-11-06 12:40:56'),
('00170', 'Caio Cesar Simões de Alcantara', '38718100880', 'caio.alcantara@voecostadosol.com.br', 'Piloto', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:43:59', '2025-11-06 12:40:56'),
('00218', 'Carlos José Salgueiro de Castro', '899.850.527-49', 'carlos.castro@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:43:59', '2025-11-06 12:40:56'),
('00252', 'Dieter Johny Kühr', '017.058.448-80', 'dieter.kuhr@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:43:59', '2025-11-06 12:40:56'),
('00282', 'Fernando La Rocque', '722.443.567-87', 'fernando.filho@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:43:59', '2025-11-06 12:40:56'),
('00149', 'Flavio Alves Belmont', '112.015.317-48', 'flavio.belmont@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:00', '2025-11-06 12:40:56'),
('00251', 'José Alfredo Gomes Marinho', '401.238.047-87', 'jose.marinho@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:00', '2025-11-06 12:40:56'),
('00246', 'Katia de Aguiar Santa Anna', '734.990.727-34', 'katia.santana@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:00', '2025-11-06 12:40:56'),
('00004', 'Max Monteiro Magioli', '311.120.807-91', 'max.magioli@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:01', '2025-11-06 12:40:56'),
('00232', 'Nivaldo Antonio Naressi', '058.412.708-18', 'nivaldo.naressi@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:01', '2025-11-06 12:40:56'),
('00333', 'Paloma Gonçalves Moreira', '102.896.837-66', 'paloma.magioli@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:01', '2025-11-06 12:40:56'),
('00262', 'Rafael Siegmann Paradeda', '563.716.080-53', 'rafael.paradeda@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:02', '2025-11-06 12:40:56'),
('00264', 'Ramon Godinho Bastos', '093.127.887-28', 'ramon.bastos@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:02', '2025-11-06 12:40:56'),
('00221', 'Vitor de Almeida Costa', '155.257.297-84', 'vitor.costa@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:03', '2025-11-06 12:40:56'),
('00001', 'Wilson Maciel Martins Nery', '71392092787', 'wilson.nery@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:03', '2025-11-06 12:40:56'),
('00318', 'Eduardo Luiz Brandão Ribeiro', '772.105.497-49', 'eduardo.ribeiro@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:04', '2025-11-06 12:40:56'),
('00334', 'Karl Martin Kühr', '012.598.600-94', 'karl.kuhr@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:04', '2025-11-06 12:40:56'),
('00353', 'Filipe Passaroni Daumas', '083.286.227-42', 'filipe.daumas@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:04', '2025-11-06 12:40:56'),
('00363', 'Jair Cesar da Silva', '108.943.047-71', 'jair.silva@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 15:44:04', '2025-11-06 12:40:56'),
('TEST-001', 'Teste Funcionário', '12345678909', 'teste@example.com', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-22 19:58:21', '2025-11-06 12:40:56'),
('00313', 'Rubens Negreiros Silva.', '66379458620', 'rubens.silva@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-23 13:27:04', '2025-11-06 12:40:56'),
('00362', 'Gabriel Ferreira Barreto', '14588074792', 'gabriel.barreto@voecostadosol.com.br', 'Tripulante', 'OPERACIONAL', 'ATIVO', '2025-10-23 13:43:39', '2025-11-06 12:40:56');

-- =============================
-- 2. Simuladores (produção)
-- Fonte parcial: d1-prod-export.sql
-- =============================
INSERT OR IGNORE INTO simuladores (id, nome, modelo, tipo, fabricante, localizacao, capacidade, status, observacoes, created_at, updated_at)
VALUES
(1,'Simulador A320 CAE','A320','FULL FLIGHT','CAE','Hangar 1',10,'ATIVO','TESTE AUDIT','2025-10-22 23:11:01','2025-10-23 00:02:49'),
(2,'Boeing 737-800 MAX','B737-800','FULL FLIGHT','Boeing','Hangar 2',4,'ATIVO',NULL,'2025-10-22 23:11:43','2025-10-22 23:11:43'),
(3,'Embraer E195','E195','FULL FLIGHT','Embraer','Hangar 3',2,'ATIVO',NULL,'2025-10-22 23:14:51','2025-10-22 23:14:51'),
(4,'ATR 72-600','ATR72','FNPT II','ATR','Hangar 4',2,'ATIVO',NULL,'2025-10-22 23:14:51','2025-10-23 02:15:16'),
(5,'Cessna Citation CJ4','CJ4','FTD','Cessna','Sala 101',1,'ATIVO',NULL,'2025-10-22 23:14:52','2025-10-22 23:14:52'),
(6,'Simulador Teste Validação','TEST-100','FTD','Teste Inc','Sala Teste',2,'ATIVO',NULL,'2025-10-22 23:36:03','2025-10-22 23:36:03'),
(7,'Simulador Teste','TEST-100','FTD','Teste','Sala 1',6,'MANUTENCAO',NULL,'2025-10-22 23:36:10','2025-10-22 23:41:10'),
(8,'AUDIT TEST','TEST','FTD','TEST','TEST',1,'ATIVO',NULL,'2025-10-22 23:50:40','2025-10-24 12:42:05'),
(9,'TESTE FINAL','TEST','FTD','TEST','TEST',1,'ATIVO',NULL,'2025-10-23 00:02:48','2025-10-23 00:02:48'),
(10,'TESTE-VERIFICACAO','TEST','FTD','TEST','TEST',1,'ATIVO',NULL,'2025-10-23 00:30:36','2025-10-23 00:30:36');

-- =============================
-- 3. Tipos de Sessão (produção + recuperação)
-- =============================
INSERT OR IGNORE INTO tipos_sessao (id, codigo, nome, descricao, ativo, ordem, created_at, updated_at)
VALUES
(8,'INICIAL','Treinamento Inicial',NULL,1,0,'2025-10-27 14:28:34','2025-10-27 14:28:34'),
(9,'PERIÓDICO','Treinamento Periódico',NULL,1,0,'2025-10-27 14:29:14','2025-10-27 14:29:14'),
(1,'PC','PC - Proficiency Check','Verificação de proficiência',1,1,'2025-10-27 13:58:18','2025-10-27 13:58:18'),
(2,'OPC','OPC - Operator Proficiency Check','Verificação de proficiência do operador',1,2,'2025-10-27 13:58:18','2025-10-27 13:58:18'),
(3,'LPC','LPC - License Proficiency Check','Verificação de proficiência de licença',1,3,'2025-10-27 13:58:18','2025-10-27 13:58:18'),
(4,'TREINAMENTO','Treinamento','Sessão de treinamento regular',1,4,'2025-10-27 13:58:18','2025-10-27 13:58:18');

-- =============================
-- 4. Qualificações Tipos (subset)
-- =============================
INSERT OR IGNORE INTO qualificacoes_tipos (id, nome, descricao, codigo, categoria, carga_horaria, validade_meses, ativo, created_at, updated_at)
VALUES
('1','CRM - Crew Resource Management',NULL,'CRM','TREINAMENTO',8,24,1,'2025-10-22 01:32:21','2025-11-04 21:16:56'),
('5','Exame Médico Aeronáutico (ASO)',NULL,'Exame','EXAME',8,12,1,'2025-10-22 01:32:21','2025-10-22 01:32:21'),
('8','Certificado Médico Aeronáutico',NULL,'Certificado','CHECK',8,12,1,'2025-10-22 01:32:21','2025-10-22 01:32:21'),
('23','IFR',NULL,'IFR','CHECK',8,12,1,'2025-10-27 13:22:24','2025-10-27 13:22:24'),
('24','LPC',NULL,'LPC','CHECK',8,12,1,'2025-10-27 13:22:30','2025-10-27 13:22:30'),
('25','OPC',NULL,'OPC','CHECK',8,12,1,'2025-10-27 13:25:19','2025-10-27 13:25:19');

-- =============================
-- 5. Manobras Categorias (produção)
-- =============================
INSERT OR IGNORE INTO manobras_categorias (id, codigo, nome, tipo, ordem, cor, created_at, updated_at)
VALUES
(1,'FLY-BAS','Controle Básico','NORMAL',1,'#3B82F6','2025-10-30 14:10:13','2025-10-30 14:10:13'),
(2,'OPS-NRM','Operações Normais','NORMAL',2,'#10B981','2025-10-30 14:10:13','2025-10-30 14:10:13'),
(3,'OPS-NAV','Navegação','NORMAL',3,'#8B5CF6','2025-10-30 14:10:13','2025-10-30 14:10:13'),
(4,'OPS-APP','Aproximações','NORMAL',4,'#EC4899','2025-10-30 14:10:13','2025-10-30 14:10:13'),
(6,'EMG-WAR-PWR','Emerg Warning Powerplant','WARNING',6,'#DC2626','2025-10-30 14:10:13','2025-10-30 14:10:13'),
(18,'EMG-WAR-FIRE','Emerg Warning Fogo Fumaça','WARNING',18,'#DC2626','2025-10-30 14:10:13','2025-10-30 14:10:13');

-- =============================
-- 6. Sessões Template (subset AW139)
-- =============================
INSERT OR IGNORE INTO sessoes_template (id, codigo, nome, descricao, sessao_numero, total_sessoes, tipo, duracao_minutos, ativo, created_at, updated_at)
VALUES
(4,'A139-I-01/12','01/12 - FAMILIARIZAÇÃO AW139 - VFR BÁSICO',NULL,1,1,'INICIAL',120,1,'2025-10-26 21:45:54','2025-10-30 01:18:05'),
(5,'A139-I-02/12','02/12 - EMERGÊNCIAS POWERPLANT & AUTOROTAÇÕES',NULL,2,1,'INICIAL',120,1,'2025-10-26 21:46:06','2025-10-30 01:18:09');

-- =============================
-- 7. Verificação de contagens
-- =============================
SELECT 'funcionarios' AS entidade, COUNT(*) AS total FROM funcionarios WHERE status='ATIVO';
SELECT 'simuladores' AS entidade, COUNT(*) AS total FROM simuladores WHERE deleted_at IS NULL OR deleted_at IS NULL; -- redundante para compatibilidade
SELECT 'tipos_sessao' AS entidade, COUNT(*) AS total FROM tipos_sessao WHERE deleted_at IS NULL OR deleted_at IS NULL;
SELECT 'qualificacoes_tipos' AS entidade, COUNT(*) AS total FROM qualificacoes_tipos WHERE deleted_at IS NULL OR deleted_at IS NULL;
SELECT 'manobras_categorias' AS entidade, COUNT(*) AS total FROM manobras_categorias WHERE deleted_at IS NULL OR deleted_at IS NULL;
SELECT 'sessoes_template' AS entidade, COUNT(*) AS total FROM sessoes_template WHERE deleted_at IS NULL OR deleted_at IS NULL;

COMMIT;
PRAGMA foreign_keys=ON;

-- Fim do seed consolidado 2025-11-19