-- Remover todos os dados de teste
DELETE FROM fichas_manobras_executadas WHERE ficha_id IN (SELECT id FROM fichas_sessao WHERE ficha_uuid LIKE 'FICHA-TEST-%');
DELETE FROM fichas_sessao WHERE ficha_uuid LIKE 'FICHA-TEST-%';
DELETE FROM agendamento_slots WHERE created_by = 'SISTEMA_POPULATION';
DELETE FROM sessoes_template_manobras WHERE sessao_template_id IN (SELECT id FROM sessoes_template WHERE created_by = 'SISTEMA_POPULATION');
DELETE FROM sessoes_template WHERE created_by = 'SISTEMA_POPULATION';
DELETE FROM manobras_catalogo_ciclos WHERE manobra_catalogo_id IN (SELECT id FROM manobras_catalogo WHERE created_by = 'SISTEMA_POPULATION');
DELETE FROM ciclos WHERE numero_ciclo IN (1, 2, 3);
DELETE FROM manobras_catalogo WHERE created_by = 'SISTEMA_POPULATION';
DELETE FROM funcionarios WHERE matricula IN ('INST001', 'INST002', 'P001', 'P002', 'P003');
DELETE FROM simuladores WHERE created_by = 'SISTEMA_POPULATION';
