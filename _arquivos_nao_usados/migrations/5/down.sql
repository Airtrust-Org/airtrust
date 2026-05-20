
-- Remover funcionários de teste
DELETE FROM funcionarios WHERE matricula IN ('P001', 'C001', 'M001', 'P002', 'I001');

-- Remover funções
DELETE FROM funcoes WHERE nome IN ('PILOTO', 'COMISSARIO', 'MECANICO', 'INSTRUTOR_VOO', 'DESPACHANTE_VOO');
