-- Atualiza fichas_sessao.tipo_sessao dos códigos antigos para os novos códigos
-- Códigos antigos: CHECK-CRED-EXAMINADOR → CRED-EXA, CHECK-TRIN-INSTRUTOR → TRE-INST
-- e define template_id para as fichas que ainda não possuem

UPDATE fichas_sessao
SET tipo_sessao = 'CRED-EXA'
WHERE tipo_sessao = 'CHECK-CRED-EXAMINADOR'
  AND deleted_at IS NULL;

UPDATE fichas_sessao
SET tipo_sessao = 'TRE-INST'
WHERE tipo_sessao = 'CHECK-TRIN-INSTRUTOR'
  AND deleted_at IS NULL;

-- Define template_id para fichas especiais que ainda não possuem
UPDATE fichas_sessao
SET template_id = (
  SELECT id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL LIMIT 1
)
WHERE tipo_sessao = 'CRED-EXA'
  AND template_id IS NULL
  AND deleted_at IS NULL;

UPDATE fichas_sessao
SET template_id = (
  SELECT id FROM modelos_sessao WHERE codigo = 'TRE-INST' AND deleted_at IS NULL LIMIT 1
)
WHERE tipo_sessao = 'TRE-INST'
  AND template_id IS NULL
  AND deleted_at IS NULL;
