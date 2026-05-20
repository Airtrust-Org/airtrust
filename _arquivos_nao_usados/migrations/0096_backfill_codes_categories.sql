-- Migration 0096: Backfill tipo_codigo e categoria a partir de qualificacoes_tipos
-- Regras:
-- 1. Preencher tipo_codigo se vazio/nulo com codigo do tipo
-- 2. Se categoria = 'DESCONHECIDO' e tipo.categoria não nula, usar categoria do tipo
-- 3. Não sobrescrever valores já definidos

UPDATE qualificacoes_historico
SET tipo_codigo = (
  SELECT codigo FROM qualificacoes_tipos qt WHERE qt.id = qualificacoes_historico.qualificacao_id LIMIT 1
)
WHERE (tipo_codigo IS NULL OR tipo_codigo = '') AND qualificacao_id IS NOT NULL;

UPDATE qualificacoes_historico
SET categoria = (
  SELECT categoria FROM qualificacoes_tipos qt WHERE qt.id = qualificacoes_historico.qualificacao_id LIMIT 1
)
WHERE categoria = 'DESCONHECIDO' AND qualificacao_id IS NOT NULL AND (
  SELECT categoria FROM qualificacoes_tipos qt WHERE qt.id = qualificacoes_historico.qualificacao_id LIMIT 1
) IS NOT NULL;

-- Consolidação de código final: se codigo vazio mas tipo_codigo presente, espelhar
UPDATE qualificacoes_historico
SET codigo = tipo_codigo
WHERE (codigo IS NULL OR codigo = '') AND tipo_codigo IS NOT NULL;
