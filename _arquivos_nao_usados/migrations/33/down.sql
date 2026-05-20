
-- Rollback da auditoria
DELETE FROM sessoes_template_manobras WHERE sessao_template_id IN (
  SELECT id FROM sessoes_template WHERE created_by = 'AUDITORIA'
);
DELETE FROM sessoes_template WHERE created_by = 'AUDITORIA';
DELETE FROM manobras_catalogo_ciclos WHERE manobra_catalogo_id IN (
  SELECT id FROM manobras_catalogo WHERE created_by = 'AUDITORIA'
);
DELETE FROM manobras_catalogo WHERE created_by = 'AUDITORIA';
DELETE FROM simuladores WHERE created_by = 'AUDITORIA';
DELETE FROM catalogo_treinamentos_v2 WHERE codigo IN ('REC-A', 'CHK-B');
DELETE FROM funcionarios WHERE matricula IN ('INST010', 'CHECK015', 'PIC020', 'SIC021');
