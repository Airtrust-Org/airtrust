DELETE FROM sessoes_template;

INSERT INTO sessoes_template (id, codigo, nome, tipo, descricao, duracao_minutos, sessao_numero, ativo, created_at, updated_at)
SELECT id, codigo, nome, tipo, descricao, duracao_estimada, ordem_no_treinamento, 1, created_at, updated_at
FROM modelos_sessao
WHERE deleted_at IS NULL;
