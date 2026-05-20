-- Remover dados adicionais
DELETE FROM auditoria_manobras WHERE ficha_manobras_executadas_id >= 13;
DELETE FROM fichas_manobras_executadas WHERE ficha_id >= 4;
DELETE FROM fichas_sessao WHERE id >= 4;
DELETE FROM manobras_catalogo WHERE id >= 9;
DELETE FROM funcionarios WHERE id >= 21;
